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

/**
 * Deterministic fine-simulation collision authority.
 * Static geometry, authoritative door state, terrain contact and semantic triggers live here while a chunk is materialized.
 */
export class FinePhysicsAuthority {
  private staticColliders=new Map<string,StaticCollider>();
  private doors=new Map<string,DoorCollider>();
  private triggers=new Map<string,PhysicsTrigger>();
  private terrain=new Map<string,TerrainSurface>();

  registerStatic(collider:StaticCollider){
    const normalized=this.normalize(collider);
    this.staticColliders.set(normalized.id,normalized);
    return normalized;
  }

  unregisterStatic(id:string){this.staticColliders.delete(id);}

  registerDoor(door:DoorCollider){
    const normalized={...this.normalize(door),open:Boolean(door.open)};
    this.doors.set(normalized.id,normalized);
    return {...normalized};
  }

  setDoorOpen(id:string,open:boolean,dynamic:readonly DynamicCollider[]=[]){
    const door=this.doors.get(id);if(!door)return false;
    if(!open&&door.open&&dynamic.some(body=>circleIntersectsAabb(body.x,body.z,Math.max(.01,body.radius),door)))return false;
    door.open=Boolean(open);return true;
  }

  doorState(id:string){const door=this.doors.get(id);return door?{...door}:undefined;}
  unregisterDoor(id:string){this.doors.delete(id);}

  registerBlockedCell(id:string,x:number,z:number,chunkId?:string){
    return this.registerStatic({id,minX:x-.5,maxX:x+.5,minZ:z-.5,maxZ:z+.5,chunkId});
  }

  registerTrigger(trigger:PhysicsTrigger){
    const normalized={...this.normalize(trigger),tag:trigger.tag};
    this.triggers.set(normalized.id,normalized);
    return normalized;
  }

  unregisterTrigger(id:string){this.triggers.delete(id);}

  registerTerrain(surface:TerrainSurface){
    const normalized={...this.normalize(surface),originX:Number.isFinite(surface.originX)?surface.originX:0,originZ:Number.isFinite(surface.originZ)?surface.originZ:0,originY:Number.isFinite(surface.originY)?surface.originY:0,slopeX:Number.isFinite(surface.slopeX)?surface.slopeX:0,slopeZ:Number.isFinite(surface.slopeZ)?surface.slopeZ:0};
    this.terrain.set(normalized.id,normalized);
    return normalized;
  }

  unregisterTerrain(id:string){this.terrain.delete(id);}

  groundContactAt(x:number,z:number):TerrainContact|undefined {
    const candidates=[...this.terrain.values()].filter(surface=>x>=surface.minX&&x<=surface.maxX&&z>=surface.minZ&&z<=surface.maxZ).sort((a,b)=>a.id.localeCompare(b.id));
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
    for(const [id,collider] of this.staticColliders)if(collider.chunkId===chunkId)this.staticColliders.delete(id);
    for(const [id,door] of this.doors)if(door.chunkId===chunkId)this.doors.delete(id);
    for(const [id,trigger] of this.triggers)if(trigger.chunkId===chunkId)this.triggers.delete(id);
    for(const [id,surface] of this.terrain)if(surface.chunkId===chunkId)this.terrain.delete(id);
  }

  clear(){this.staticColliders.clear();this.doors.clear();this.triggers.clear();this.terrain.clear();}

  stats(){return {staticColliders:this.staticColliders.size,doors:this.doors.size,openDoors:[...this.doors.values()].filter(door=>door.open).length,triggers:this.triggers.size,terrainSurfaces:this.terrain.size};}

  isBlocked(x:number,z:number,radius=0){
    const r=Math.max(0,radius);
    for(const collider of this.blockingColliders())if(r>0?circleIntersectsAabb(x,z,r,collider):x>collider.minX&&x<collider.maxX&&z>collider.minZ&&z<collider.maxZ)return true;
    return false;
  }

  overlappingTriggers(position:PhysicsPoint,radius=0){
    const hits:PhysicsTrigger[]=[];
    for(const trigger of this.triggers.values())if(radius>0?circleIntersectsAabb(position.x,position.z,radius,trigger):position.x>=trigger.minX&&position.x<=trigger.maxX&&position.z>=trigger.minZ&&position.z<=trigger.maxZ)hits.push({...trigger});
    return hits.sort((a,b)=>a.id.localeCompare(b.id));
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
      const statics:string[]=[];for(const collider of this.blockingColliders())if(circleIntersectsAabb(cx,cz,radius,collider))statics.push(collider.id);
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

  private *blockingColliders():Iterable<StaticCollider>{
    yield* this.staticColliders.values();
    for(const door of this.doors.values())if(!door.open)yield door;
  }

  private normalize<T extends StaticCollider>(collider:T):T {
    return {...collider,minX:Math.min(collider.minX,collider.maxX),maxX:Math.max(collider.minX,collider.maxX),minZ:Math.min(collider.minZ,collider.maxZ),maxZ:Math.max(collider.minZ,collider.maxZ)};
  }
}
