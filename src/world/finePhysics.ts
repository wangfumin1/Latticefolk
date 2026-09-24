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

export interface RigidBody {
  id:string;
  x:number;
  z:number;
  radius:number;
  vx:number;
  vz:number;
  mass:number;
  damping:number;
  maxSpeed:number;
  chunkId?:string;
}

export interface RigidBodyStep {
  id:string;
  x:number;
  z:number;
  vx:number;
  vz:number;
  collided:boolean;
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
  private rigidBodies=new Map<string,RigidBody>();

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
    for(const [id,body] of this.rigidBodies)if(body.chunkId===chunkId)this.rigidBodies.delete(id);
  }

  clear(){
    this.staticColliders.clear();
    this.triggers.clear();
    this.rigidBodies.clear();
  }

  stats(){
    return {staticColliders:this.staticColliders.size,triggers:this.triggers.size,rigidBodies:this.rigidBodies.size};
  }

  registerRigidBody(body:RigidBody){
    const normalized:RigidBody={
      ...body,
      radius:Math.max(.05,body.radius),
      mass:Math.max(.1,body.mass),
      damping:clamp(body.damping,0,20),
      maxSpeed:Math.max(.05,body.maxSpeed),
      vx:Number.isFinite(body.vx)?body.vx:0,
      vz:Number.isFinite(body.vz)?body.vz:0
    };
    this.rigidBodies.set(body.id,normalized);
    return {...normalized};
  }

  unregisterRigidBody(id:string){
    this.rigidBodies.delete(id);
  }

  rigidBody(id:string){
    const body=this.rigidBodies.get(id);
    return body?{...body}:undefined;
  }

  setRigidBodyPosition(id:string,position:PhysicsPoint){
    const body=this.rigidBodies.get(id);
    if(!body)return false;
    body.x=position.x;body.z=position.z;
    return true;
  }

  applyRigidImpulse(id:string,impulse:PhysicsPoint){
    const body=this.rigidBodies.get(id);
    if(!body)return false;
    body.vx+=impulse.x/body.mass;
    body.vz+=impulse.z/body.mass;
    const speed=Math.hypot(body.vx,body.vz);
    if(speed>body.maxSpeed){
      const scale=body.maxSpeed/speed;
      body.vx*=scale;body.vz*=scale;
    }
    return true;
  }

  rigidColliders(excludeId?:string):DynamicCollider[] {
    return [...this.rigidBodies.values()]
      .filter(body=>body.id!==excludeId)
      .map(body=>({id:`rigid:${body.id}`,x:body.x,z:body.z,radius:body.radius}));
  }

  stepRigidBodies(dt:number,dynamic:readonly DynamicCollider[]=[]):RigidBodyStep[] {
    const stepDt=clamp(dt,0,.1);
    const results:RigidBodyStep[]=[];
    const ids=[...this.rigidBodies.keys()].sort();
    for(const id of ids){
      const body=this.rigidBodies.get(id);
      if(!body)continue;
      const damping=Math.exp(-body.damping*stepDt);
      body.vx*=damping;body.vz*=damping;
      if(Math.hypot(body.vx,body.vz)<.002){body.vx=0;body.vz=0;}
      const startX=body.x,startZ=body.z;
      let collided=false;
      if(body.vx||body.vz){
        const displacement={x:body.vx*stepDt,z:body.vz*stepDt};
        const others=[
          ...dynamic.filter(entry=>entry.id!==`rigid:${id}`),
          ...this.rigidColliders(id)
        ];
        const moved=this.moveCircleAgainstWorld(
          {x:body.x,z:body.z},displacement,body.radius,others,.16
        );
        body.x=moved.position.x;body.z=moved.position.z;
        collided=moved.collided;
        if(Math.abs(moved.displacement.x-displacement.x)>1e-9)body.vx=0;
        if(Math.abs(moved.displacement.z-displacement.z)>1e-9)body.vz=0;
      }
      results.push({id,x:body.x,z:body.z,vx:body.vx,vz:body.vz,collided:collided||(body.x===startX&&body.z===startZ&&(body.vx!==0||body.vz!==0))});
    }
    return results;
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
    return this.moveCircleAgainstWorld(
      input.position,
      input.displacement,
      Math.max(.01,input.radius),
      [...(input.dynamic||[]),...this.rigidColliders()],
      Math.max(.05,input.maxSubstep??.22),
      input.id
    );
  }

  private moveCircleAgainstWorld(
    position:PhysicsPoint,
    displacement:PhysicsPoint,
    radius:number,
    dynamic:readonly DynamicCollider[],
    maxSubstep:number,
    excludeId?:string
  ):KinematicMoveResult {
    const dx=Number.isFinite(displacement.x)?displacement.x:0;
    const dz=Number.isFinite(displacement.z)?displacement.z:0;
    const distance=Math.hypot(dx,dz);
    const steps=Math.max(1,Math.ceil(distance/maxSubstep));
    const stepX=dx/steps,stepZ=dz/steps;
    let x=position.x,z=position.z;
    const staticHits=new Set<string>(),dynamicHits=new Set<string>();

    const blockersAt=(cx:number,cz:number)=>{
      const statics:string[]=[];
      for(const collider of this.staticColliders.values())if(circleIntersectsAabb(cx,cz,radius,collider))statics.push(collider.id);
      const dynamics:string[]=[];
      for(const other of dynamic){
        if(other.id===excludeId)continue;
        if(!circleIntersectsCircle(cx,cz,radius,other))continue;
        const currentHit=circleIntersectsCircle(x,z,radius,other);
        if(currentHit){
          const currentDistanceSq=(x-other.x)**2+(z-other.z)**2;
          const candidateDistanceSq=(cx-other.x)**2+(cz-other.z)**2;
          if(candidateDistanceSq>currentDistanceSq+1e-9)continue;
        }
        dynamics.push(other.id);
      }
      return {statics,dynamics};
    };

    for(let i=0;i<steps;i++){
      if(Math.abs(stepX)>1e-12){
        const xBlock=blockersAt(x+stepX,z);
        if(!xBlock.statics.length&&!xBlock.dynamics.length)x+=stepX;
        else{
          for(const id of xBlock.statics)staticHits.add(id);
          for(const id of xBlock.dynamics)dynamicHits.add(id);
        }
      }
      if(Math.abs(stepZ)>1e-12){
        const zBlock=blockersAt(x,z+stepZ);
        if(!zBlock.statics.length&&!zBlock.dynamics.length)z+=stepZ;
        else{
          for(const id of zBlock.statics)staticHits.add(id);
          for(const id of zBlock.dynamics)dynamicHits.add(id);
        }
      }
    }

    return {
      position:{x,z},
      displacement:{x:x-position.x,z:z-position.z},
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
