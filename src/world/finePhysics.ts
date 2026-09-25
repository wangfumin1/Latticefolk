import { SpatialHashIndex, type SpatialBounds } from './spatialHash.js';

export interface PhysicsPoint {
  x:number;
  z:number;
}

export interface StaticCollider {
  id:string;
  minX:number;
  maxX:number;
  minZ:number;
  maxZ:number;
  chunkId?:string;
}

export interface PhysicsTrigger extends StaticCollider {
  tag?:string;
}

/** A bounded deterministic ground plane: y = originY + slopeX*(x-originX) + slopeZ*(z-originZ). */
export interface TerrainSurface extends StaticCollider {
  originX:number;
  originZ:number;
  originY:number;
  slopeX:number;
  slopeZ:number;
}

export interface TerrainContact {
  surfaceId:string;
  height:number;
  slope:number;
}

export interface DoorCollider extends StaticCollider {
  open:boolean;
}

export interface DynamicCollider {
  id:string;
  x:number;
  z:number;
  radius:number;
}

export type PhysicsContactKind='static'|'door'|'dynamic';

export interface SegmentContactQuery {
  start:PhysicsPoint;
  end:PhysicsPoint;
  /** Sweep radius. Zero performs a point segment query. */
  radius?:number;
  /** Materialized dynamic circles supplied by the caller; authoritative identities remain outside the physics store. */
  dynamic?:readonly DynamicCollider[];
  /** Collider/body ids to omit, normally the source body or projectile owner. */
  excludeIds?:readonly string[];
}

export interface SegmentContactHit {
  id:string;
  kind:PhysicsContactKind;
  /** Normalized segment fraction in [0,1]. */
  t:number;
  distance:number;
  point:PhysicsPoint;
}

export interface KinematicMoveInput {
  id:string;
  position:PhysicsPoint;
  displacement:PhysicsPoint;
  radius:number;
  dynamic?:readonly DynamicCollider[];
  maxSubstep?:number;
  /** Maximum traversable ground angle in radians. Defaults to 45 degrees. */
  maxSlope?:number;
  /** Maximum vertical ground delta allowed in one physics substep. Defaults to .5. */
  maxGroundStep?:number;
}

export interface KinematicMoveResult {
  position:PhysicsPoint;
  displacement:PhysicsPoint;
  collided:boolean;
  staticHits:string[];
  dynamicHits:string[];
  terrainHits:string[];
  ground?:TerrainContact;
}

const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));

function circleIntersectsAabb(x:number,z:number,radius:number,collider:StaticCollider){
  const nearestX=clamp(x,collider.minX,collider.maxX);
  const nearestZ=clamp(z,collider.minZ,collider.maxZ);
  const dx=x-nearestX,dz=z-nearestZ;
  return dx*dx+dz*dz<radius*radius-1e-12;
}

function circleIntersectsCircle(x:number,z:number,radius:number,other:DynamicCollider){
  const dx=x-other.x,dz=z-other.z;
  const minDistance=Math.max(0,radius)+Math.max(0,other.radius);
  return dx*dx+dz*dz<minDistance*minDistance-1e-12;
}

function segmentAabbT(start:PhysicsPoint,end:PhysicsPoint,collider:StaticCollider,radius=0){
  const expand=Math.max(0,radius);
  const minX=collider.minX-expand,maxX=collider.maxX+expand,minZ=collider.minZ-expand,maxZ=collider.maxZ+expand;
  const dx=end.x-start.x,dz=end.z-start.z;
  let tMin=0,tMax=1;
  const axis=(origin:number,delta:number,min:number,max:number)=>{
    if(Math.abs(delta)<=1e-12)return origin>=min-1e-12&&origin<=max+1e-12;
    let a=(min-origin)/delta,b=(max-origin)/delta;
    if(a>b)[a,b]=[b,a];
    tMin=Math.max(tMin,a);tMax=Math.min(tMax,b);
    return tMin<=tMax+1e-12;
  };
  if(!axis(start.x,dx,minX,maxX)||!axis(start.z,dz,minZ,maxZ))return undefined;
  return clamp(tMin,0,1);
}

function segmentCircleT(start:PhysicsPoint,end:PhysicsPoint,other:DynamicCollider,radius=0){
  const combined=Math.max(0,radius)+Math.max(0,other.radius);
  const sx=start.x-other.x,sz=start.z-other.z,dx=end.x-start.x,dz=end.z-start.z;
  const c=sx*sx+sz*sz-combined*combined;
  if(c<=1e-12)return 0;
  const a=dx*dx+dz*dz;
  if(a<=1e-12)return undefined;
  const b=2*(sx*dx+sz*dz),disc=b*b-4*a*c;
  if(disc<-1e-12)return undefined;
  const root=Math.sqrt(Math.max(0,disc));
  const t=(-b-root)/(2*a);
  return t>=-1e-12&&t<=1+1e-12?clamp(t,0,1):undefined;
}

/**
 * Deterministic fine-simulation collision authority.
 * Static geometry, authoritative door state, terrain contact and semantic triggers live here while a chunk is materialized.
 */
export class FinePhysicsAuthority {
  private staticColliders=new Map<string,StaticCollider>();
  private doors=new Map<string,DoorCollider>();
  private triggers=new Map<string,PhysicsTrigger>();
  private terrain=new Map<string,TerrainSurface>();
  private staticIndex=new SpatialHashIndex<StaticCollider>(8);
  private doorIndex=new SpatialHashIndex<DoorCollider>(8);
  private triggerIndex=new SpatialHashIndex<PhysicsTrigger>(8);
  private terrainIndex=new SpatialHashIndex<TerrainSurface>(16);

  registerStatic(collider:StaticCollider){
    const normalized=this.normalize(collider);
    this.staticColliders.set(normalized.id,normalized);
    this.staticIndex.upsert(normalized);
    return normalized;
  }

  unregisterStatic(id:string){this.staticColliders.delete(id);this.staticIndex.remove(id);}

  registerDoor(door:DoorCollider){
    const normalized={...this.normalize(door),open:Boolean(door.open)};
    this.doors.set(normalized.id,normalized);
    this.doorIndex.upsert(normalized);
    return {...normalized};
  }

  setDoorOpen(id:string,open:boolean){
    const door=this.doors.get(id);if(!door)return false;
    door.open=Boolean(open);this.doorIndex.upsert(door);return true;
  }

  doorState(id:string){const door=this.doors.get(id);return door?{...door}:undefined;}
  unregisterDoor(id:string){this.doors.delete(id);this.doorIndex.remove(id);}

  registerBlockedCell(id:string,x:number,z:number,chunkId?:string){
    return this.registerStatic({id,minX:x-.5,maxX:x+.5,minZ:z-.5,maxZ:z+.5,chunkId});
  }

  registerTrigger(trigger:PhysicsTrigger){
    const normalized={...this.normalize(trigger),tag:trigger.tag};
    this.triggers.set(normalized.id,normalized);
    this.triggerIndex.upsert(normalized);
    return normalized;
  }

  unregisterTrigger(id:string){this.triggers.delete(id);this.triggerIndex.remove(id);}

  registerTerrain(surface:TerrainSurface){
    const normalized={...this.normalize(surface),originX:Number.isFinite(surface.originX)?surface.originX:0,originZ:Number.isFinite(surface.originZ)?surface.originZ:0,originY:Number.isFinite(surface.originY)?surface.originY:0,slopeX:Number.isFinite(surface.slopeX)?surface.slopeX:0,slopeZ:Number.isFinite(surface.slopeZ)?surface.slopeZ:0};
    this.terrain.set(normalized.id,normalized);
    this.terrainIndex.upsert(normalized);
    return normalized;
  }

  unregisterTerrain(id:string){this.terrain.delete(id);this.terrainIndex.remove(id);}

  groundContactAt(x:number,z:number):TerrainContact|undefined {
    const candidates=this.terrainIndex.query({minX:x,maxX:x,minZ:z,maxZ:z});
    if(!candidates.length)return undefined;
    let best:TerrainContact|undefined;
    for(const surface of candidates){
      const height=surface.originY+surface.slopeX*(x-surface.originX)+surface.slopeZ*(z-surface.originZ);
      const contact={surfaceId:surface.id,height,slope:Math.atan(Math.hypot(surface.slopeX,surface.slopeZ))};
      if(!best||contact.height>best.height+1e-9||(Math.abs(contact.height-best.height)<=1e-9&&contact.surfaceId<best.surfaceId))best=contact;
    }
    return best;
  }

  clearChunk(chunkId:string){
    this.removeChunkEntries(this.staticColliders,this.staticIndex,chunkId);
    this.removeChunkEntries(this.doors,this.doorIndex,chunkId);
    this.removeChunkEntries(this.triggers,this.triggerIndex,chunkId);
    this.removeChunkEntries(this.terrain,this.terrainIndex,chunkId);
  }

  clear(){
    this.staticColliders.clear();this.doors.clear();this.triggers.clear();this.terrain.clear();
    this.staticIndex.clear();this.doorIndex.clear();this.triggerIndex.clear();this.terrainIndex.clear();
  }

  stats(){return {
    staticColliders:this.staticColliders.size,doors:this.doors.size,triggers:this.triggers.size,terrainSurfaces:this.terrain.size,
    spatialCells:{static:this.staticIndex.cellCount,doors:this.doorIndex.cellCount,triggers:this.triggerIndex.cellCount,terrain:this.terrainIndex.cellCount}
  };}

  isBlocked(x:number,z:number,radius=0){
    const r=Math.max(0,radius),bounds=this.pointBounds(x,z,r);
    for(const collider of this.blockingColliders(bounds))if(r>0?circleIntersectsAabb(x,z,r,collider):x>collider.minX&&x<collider.maxX&&z>collider.minZ&&z<collider.maxZ)return true;
    return false;
  }

  overlappingTriggers(position:PhysicsPoint,radius=0){
    const r=Math.max(0,radius),hits:PhysicsTrigger[]=[];
    for(const trigger of this.triggerIndex.query(this.pointBounds(position.x,position.z,r)))if(r>0?circleIntersectsAabb(position.x,position.z,r,trigger):position.x>=trigger.minX&&position.x<=trigger.maxX&&position.z>=trigger.minZ&&position.z<=trigger.maxZ)hits.push({...trigger});
    return hits.sort((a,b)=>a.id.localeCompare(b.id));
  }

  segmentContacts(input:SegmentContactQuery):SegmentContactHit[] {
    const radius=Math.max(0,input.radius??0),excluded=new Set(input.excludeIds||[]);
    const dx=input.end.x-input.start.x,dz=input.end.z-input.start.z,length=Math.hypot(dx,dz);
    const hits:SegmentContactHit[]=[];
    const add=(id:string,kind:PhysicsContactKind,t:number|undefined)=>{
      if(t===undefined||excluded.has(id))return;
      hits.push({
        id,kind,t,distance:length*t,
        point:{x:input.start.x+dx*t,z:input.start.z+dz*t}
      });
    };
    const queryBounds={minX:Math.min(input.start.x,input.end.x)-radius,maxX:Math.max(input.start.x,input.end.x)+radius,minZ:Math.min(input.start.z,input.end.z)-radius,maxZ:Math.max(input.start.z,input.end.z)+radius};
    for(const collider of this.staticIndex.query(queryBounds))add(collider.id,'static',segmentAabbT(input.start,input.end,collider,radius));
    for(const door of this.doorIndex.query(queryBounds))if(!door.open)add(door.id,'door',segmentAabbT(input.start,input.end,door,radius));
    const seenDynamic=new Set<string>();
    for(const body of input.dynamic||[]){
      if(seenDynamic.has(body.id))continue;
      seenDynamic.add(body.id);
      add(body.id,'dynamic',segmentCircleT(input.start,input.end,body,radius));
    }
    const kindOrder:Record<PhysicsContactKind,number>={static:0,door:1,dynamic:2};
    return hits.sort((a,b)=>a.t-b.t||kindOrder[a.kind]-kindOrder[b.kind]||a.id.localeCompare(b.id));
  }

  firstSegmentContact(input:SegmentContactQuery){
    return this.segmentContacts(input)[0];
  }

  moveKinematic(input:KinematicMoveInput):KinematicMoveResult {
    const radius=Math.max(.01,input.radius);
    const dx=Number.isFinite(input.displacement.x)?input.displacement.x:0,dz=Number.isFinite(input.displacement.z)?input.displacement.z:0;
    const distance=Math.hypot(dx,dz),maxSubstep=Math.max(.05,input.maxSubstep??.22),steps=Math.max(1,Math.ceil(distance/maxSubstep));
    const stepX=dx/steps,stepZ=dz/steps;
    const maxSlope=clamp(input.maxSlope??Math.PI/4,0,Math.PI/2),maxGroundStep=Math.max(0,input.maxGroundStep??.5);
    let x=input.position.x,z=input.position.z;
    const staticHits=new Set<string>(),dynamicHits=new Set<string>(),terrainHits=new Set<string>();

    const blockersAt=(cx:number,cz:number)=>{
      const statics:string[]=[];for(const collider of this.blockingColliders(this.pointBounds(cx,cz,radius)))if(circleIntersectsAabb(cx,cz,radius,collider))statics.push(collider.id);
      const dynamics:string[]=[];
      for(const other of input.dynamic||[]){
        if(other.id===input.id||!circleIntersectsCircle(cx,cz,radius,other))continue;
        if(circleIntersectsCircle(x,z,radius,other)){
          const currentDistanceSq=(x-other.x)**2+(z-other.z)**2,candidateDistanceSq=(cx-other.x)**2+(cz-other.z)**2;
          if(candidateDistanceSq>currentDistanceSq+1e-9)continue;
        }
        dynamics.push(other.id);
      }
      const terrain:string[]=[];
      const currentGround=this.groundContactAt(x,z),candidateGround=this.groundContactAt(cx,cz);
      if(candidateGround){
        if(candidateGround.slope>maxSlope+1e-9)terrain.push(candidateGround.surfaceId);
        else if(currentGround&&Math.abs(candidateGround.height-currentGround.height)>maxGroundStep+1e-9)terrain.push(candidateGround.surfaceId);
      }
      return {statics,dynamics,terrain};
    };

    for(let i=0;i<steps;i++){
      if(Math.abs(stepX)>1e-12){const hit=blockersAt(x+stepX,z);if(!hit.statics.length&&!hit.dynamics.length&&!hit.terrain.length)x+=stepX;else{hit.statics.forEach(id=>staticHits.add(id));hit.dynamics.forEach(id=>dynamicHits.add(id));hit.terrain.forEach(id=>terrainHits.add(id));}}
      if(Math.abs(stepZ)>1e-12){const hit=blockersAt(x,z+stepZ);if(!hit.statics.length&&!hit.dynamics.length&&!hit.terrain.length)z+=stepZ;else{hit.statics.forEach(id=>staticHits.add(id));hit.dynamics.forEach(id=>dynamicHits.add(id));hit.terrain.forEach(id=>terrainHits.add(id));}}
    }
    return {position:{x,z},displacement:{x:x-input.position.x,z:z-input.position.z},collided:staticHits.size>0||dynamicHits.size>0||terrainHits.size>0,staticHits:[...staticHits].sort(),dynamicHits:[...dynamicHits].sort(),terrainHits:[...terrainHits].sort(),ground:this.groundContactAt(x,z)};
  }

  private blockingColliders(bounds:SpatialBounds):StaticCollider[]{
    return [
      ...this.staticIndex.query(bounds),
      ...this.doorIndex.query(bounds).filter(door=>!door.open)
    ].sort((a,b)=>a.id.localeCompare(b.id));
  }

  private pointBounds(x:number,z:number,radius=0):SpatialBounds {
    const r=Math.max(0,radius);return {minX:x-r,maxX:x+r,minZ:z-r,maxZ:z+r};
  }

  private removeChunkEntries<T extends StaticCollider>(store:Map<string,T>,index:SpatialHashIndex<T>,chunkId:string) {
    for(const [id,value] of store)if(value.chunkId===chunkId){store.delete(id);index.remove(id);}
  }

  private normalize<T extends StaticCollider>(collider:T):T {
    return {...collider,minX:Math.min(collider.minX,collider.maxX),maxX:Math.max(collider.minX,collider.maxX),minZ:Math.min(collider.minZ,collider.maxZ),maxZ:Math.max(collider.minZ,collider.maxZ)};
  }
}
