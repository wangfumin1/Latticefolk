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
}

export interface KinematicMoveResult {
  position:PhysicsPoint;
  displacement:PhysicsPoint;
  collided:boolean;
  staticHits:string[];
  dynamicHits:string[];
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
 *
 * Static geometry and semantic triggers live here while a chunk is materialized.
 * Dynamic character state remains owned by the simulation; callers supply current
 * dynamic colliders for each move so unloading never persists meaningless frame bodies.
 */
export class FinePhysicsAuthority {
  private staticColliders=new Map<string,StaticCollider>();
  private triggers=new Map<string,PhysicsTrigger>();

  registerStatic(collider:StaticCollider){
    const normalized=this.normalize(collider);
    this.staticColliders.set(normalized.id,normalized);
    return normalized;
  }

  unregisterStatic(id:string){
    this.staticColliders.delete(id);
  }

  registerBlockedCell(id:string,x:number,z:number,chunkId?:string){
    return this.registerStatic({id,minX:x-.5,maxX:x+.5,minZ:z-.5,maxZ:z+.5,chunkId});
  }

  registerTrigger(trigger:PhysicsTrigger){
    const normalized={...this.normalize(trigger),tag:trigger.tag};
    this.triggers.set(normalized.id,normalized);
    return normalized;
  }

  unregisterTrigger(id:string){
    this.triggers.delete(id);
  }

  clearChunk(chunkId:string){
    for(const [id,collider] of this.staticColliders)if(collider.chunkId===chunkId)this.staticColliders.delete(id);
    for(const [id,trigger] of this.triggers)if(trigger.chunkId===chunkId)this.triggers.delete(id);
  }

  clear(){
    this.staticColliders.clear();
    this.triggers.clear();
  }

  isBlocked(x:number,z:number,radius=0){
    const r=Math.max(0,radius);
    for(const collider of this.staticColliders.values()){
      if(r>0?circleIntersectsAabb(x,z,r,collider):x>collider.minX&&x<collider.maxX&&z>collider.minZ&&z<collider.maxZ)return true;
    }
    return false;
  }

  overlappingTriggers(position:PhysicsPoint,radius=0){
    const hits:PhysicsTrigger[]=[];
    for(const trigger of this.triggers.values()){
      if(radius>0
        ?circleIntersectsAabb(position.x,position.z,radius,trigger)
        :position.x>=trigger.minX&&position.x<=trigger.maxX&&position.z>=trigger.minZ&&position.z<=trigger.maxZ
      )hits.push({...trigger});
    }
    return hits.sort((a,b)=>a.id.localeCompare(b.id));
  }

  moveKinematic(input:KinematicMoveInput):KinematicMoveResult {
    const radius=Math.max(.01,input.radius);
    const dx=Number.isFinite(input.displacement.x)?input.displacement.x:0;
    const dz=Number.isFinite(input.displacement.z)?input.displacement.z:0;
    const distance=Math.hypot(dx,dz);
    const maxSubstep=Math.max(.05,input.maxSubstep??.22);
    const steps=Math.max(1,Math.ceil(distance/maxSubstep));
    const stepX=dx/steps,stepZ=dz/steps;
    let x=input.position.x,z=input.position.z;
    const staticHits=new Set<string>(),dynamicHits=new Set<string>();

    const blockersAt=(cx:number,cz:number)=>{
      const statics:string[]=[];
      for(const collider of this.staticColliders.values())if(circleIntersectsAabb(cx,cz,radius,collider))statics.push(collider.id);
      const dynamics:string[]=[];
      for(const other of input.dynamic||[]){
        if(other.id===input.id)continue;
        if(circleIntersectsCircle(cx,cz,radius,other))dynamics.push(other.id);
      }
      return {statics,dynamics};
    };

    for(let i=0;i<steps;i++){
      // Axis-separated resolution gives deterministic wall sliding and avoids
      // diagonal corner tunnelling while keeping the simulation strictly 2D.
      const xBlock=blockersAt(x+stepX,z);
      if(!xBlock.statics.length&&!xBlock.dynamics.length)x+=stepX;
      else{
        for(const id of xBlock.statics)staticHits.add(id);
        for(const id of xBlock.dynamics)dynamicHits.add(id);
      }

      const zBlock=blockersAt(x,z+stepZ);
      if(!zBlock.statics.length&&!zBlock.dynamics.length)z+=stepZ;
      else{
        for(const id of zBlock.statics)staticHits.add(id);
        for(const id of zBlock.dynamics)dynamicHits.add(id);
      }
    }

    return {
      position:{x,z},
      displacement:{x:x-input.position.x,z:z-input.position.z},
      collided:staticHits.size>0||dynamicHits.size>0,
      staticHits:[...staticHits].sort(),
      dynamicHits:[...dynamicHits].sort()
    };
  }

  private normalize<T extends StaticCollider>(collider:T):T {
    return {
      ...collider,
      minX:Math.min(collider.minX,collider.maxX),
      maxX:Math.max(collider.minX,collider.maxX),
      minZ:Math.min(collider.minZ,collider.maxZ),
      maxZ:Math.max(collider.minZ,collider.maxZ)
    };
  }
}
