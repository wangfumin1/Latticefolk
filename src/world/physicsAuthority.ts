import type { Vec2 } from '../types.js';

export type PhysicsBodyKind='static'|'character'|'trigger';
export type PhysicsShape=
  | {type:'circle';radius:number}
  | {type:'aabb';halfX:number;halfZ:number};

export interface PhysicsBody {
  id:string;
  kind:PhysicsBodyKind;
  position:Vec2;
  shape:PhysicsShape;
  chunkId?:string;
  sleeping:boolean;
  tags:readonly string[];
}

export interface CharacterControllerConfig {
  radius:number;
  maxSubstep:number;
  maxSlopeDegrees:number;
}

export interface CharacterMoveRequest {
  id:string;
  position:Vec2;
  desiredDelta:Vec2;
  chunkId?:string;
  config:CharacterControllerConfig;
  ignoreIds?:readonly string[];
}

export interface CharacterMoveResult {
  position:Vec2;
  appliedDelta:Vec2;
  collisions:string[];
  blocked:boolean;
  substeps:number;
}

const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
const distanceSq=(a:Vec2,b:Vec2)=>{const dx=a.x-b.x,dz=a.z-b.z;return dx*dx+dz*dz;};

export class PhysicsAuthority {
  private readonly bodies=new Map<string,PhysicsBody>();
  private readonly sleepingChunks=new Set<string>();

  body(id:string){return this.bodies.get(id);}

  allBodies(){return [...this.bodies.values()].map(body=>({...body,position:{...body.position},shape:{...body.shape},tags:[...body.tags]}));}

  upsertStaticAabb(id:string,position:Vec2,halfX:number,halfZ:number,chunkId?:string,tags:readonly string[]=[]){
    return this.upsert({
      id,kind:'static',position:{...position},
      shape:{type:'aabb',halfX:Math.max(.01,halfX),halfZ:Math.max(.01,halfZ)},
      chunkId,sleeping:chunkId?this.sleepingChunks.has(chunkId):false,tags:[...tags]
    });
  }

  upsertStaticCircle(id:string,position:Vec2,radius:number,chunkId?:string,tags:readonly string[]=[]){
    return this.upsert({
      id,kind:'static',position:{...position},shape:{type:'circle',radius:Math.max(.01,radius)},
      chunkId,sleeping:chunkId?this.sleepingChunks.has(chunkId):false,tags:[...tags]
    });
  }

  upsertTriggerCircle(id:string,position:Vec2,radius:number,chunkId?:string,tags:readonly string[]=[]){
    return this.upsert({
      id,kind:'trigger',position:{...position},shape:{type:'circle',radius:Math.max(.01,radius)},
      chunkId,sleeping:chunkId?this.sleepingChunks.has(chunkId):false,tags:[...tags]
    });
  }

  upsertCharacter(id:string,position:Vec2,radius:number,chunkId?:string,tags:readonly string[]=[]){
    return this.upsert({
      id,kind:'character',position:{...position},shape:{type:'circle',radius:Math.max(.01,radius)},
      chunkId,sleeping:chunkId?this.sleepingChunks.has(chunkId):false,tags:[...tags]
    });
  }

  removeBody(id:string){this.bodies.delete(id);}

  sleepChunk(chunkId:string){
    this.sleepingChunks.add(chunkId);
    for(const body of this.bodies.values())if(body.chunkId===chunkId)body.sleeping=true;
  }

  wakeChunk(chunkId:string){
    this.sleepingChunks.delete(chunkId);
    for(const body of this.bodies.values())if(body.chunkId===chunkId)body.sleeping=false;
  }

  isChunkSleeping(chunkId:string){return this.sleepingChunks.has(chunkId);}

  removeChunkBodies(chunkId:string){
    for(const [id,body] of this.bodies)if(body.chunkId===chunkId)this.bodies.delete(id);
    this.sleepingChunks.delete(chunkId);
  }

  queryTriggers(position:Vec2,radius:number,tags:readonly string[]=[]){
    const required=new Set(tags);
    return [...this.bodies.values()]
      .filter(body=>body.kind==='trigger'&&!this.isSleeping(body))
      .filter(body=>!required.size||[...required].every(tag=>body.tags.includes(tag)))
      .filter(body=>this.circleOverlapsBody(position,radius,body))
      .map(body=>body.id)
      .sort();
  }

  moveCharacter(request:CharacterMoveRequest):CharacterMoveResult {
    const config={
      radius:Math.max(.01,request.config.radius),
      maxSubstep:Math.max(.04,request.config.maxSubstep),
      // Terrain is currently flat, but the controller contract owns the future slope gate.
      maxSlopeDegrees:clamp(request.config.maxSlopeDegrees,0,89)
    };
    const body=this.upsertCharacter(request.id,request.position,config.radius,request.chunkId,['controller']);
    if(this.isSleeping(body))return {
      position:{...request.position},appliedDelta:{x:0,z:0},collisions:[],blocked:true,substeps:0
    };

    const start={...request.position};
    body.position={...start};
    const desiredLength=Math.hypot(request.desiredDelta.x,request.desiredDelta.z);
    const substeps=Math.max(1,Math.ceil(desiredLength/config.maxSubstep));
    const stepX=request.desiredDelta.x/substeps,stepZ=request.desiredDelta.z/substeps;
    const ignore=new Set([request.id,...(request.ignoreIds||[])]);
    const collisions=new Set<string>();

    for(let i=0;i<substeps;i++){
      const full={x:body.position.x+stepX,z:body.position.z+stepZ};
      const fullHits=this.collisionsAt(full,config.radius,ignore);
      if(!fullHits.length){body.position=full;continue;}
      for(const id of fullHits)collisions.add(id);

      let moved=false;
      if(Math.abs(stepX)>.000001){
        const xOnly={x:body.position.x+stepX,z:body.position.z};
        const hits=this.collisionsAt(xOnly,config.radius,ignore);
        if(!hits.length){body.position=xOnly;moved=true;}
        else for(const id of hits)collisions.add(id);
      }
      if(Math.abs(stepZ)>.000001){
        const zOnly={x:body.position.x,z:body.position.z+stepZ};
        const hits=this.collisionsAt(zOnly,config.radius,ignore);
        if(!hits.length){body.position=zOnly;moved=true;}
        else for(const id of hits)collisions.add(id);
      }
      if(!moved&&Math.abs(stepX)+Math.abs(stepZ)<.000001)break;
    }

    const appliedDelta={x:body.position.x-start.x,z:body.position.z-start.z};
    return {
      position:{...body.position},
      appliedDelta,
      collisions:[...collisions].sort(),
      blocked:collisions.size>0&&Math.hypot(appliedDelta.x,appliedDelta.z)+1e-6<desiredLength,
      substeps
    };
  }

  private upsert(body:PhysicsBody){
    const existing=this.bodies.get(body.id);
    if(existing){
      existing.kind=body.kind;
      existing.position={...body.position};
      existing.shape={...body.shape};
      existing.chunkId=body.chunkId;
      existing.sleeping=body.sleeping;
      existing.tags=[...body.tags];
      return existing;
    }
    this.bodies.set(body.id,body);
    return body;
  }

  private collisionsAt(position:Vec2,radius:number,ignore:Set<string>){
    const hits:string[]=[];
    for(const body of this.bodies.values()){
      if(ignore.has(body.id)||body.kind==='trigger'||this.isSleeping(body))continue;
      if(this.circleOverlapsBody(position,radius,body))hits.push(body.id);
    }
    return hits;
  }

  private isSleeping(body:PhysicsBody){
    return body.sleeping||Boolean(body.chunkId&&this.sleepingChunks.has(body.chunkId));
  }

  private circleOverlapsBody(position:Vec2,radius:number,body:PhysicsBody){
    if(body.shape.type==='circle'){
      const total=radius+body.shape.radius;
      return distanceSq(position,body.position)<total*total-1e-9;
    }
    const nearestX=clamp(position.x,body.position.x-body.shape.halfX,body.position.x+body.shape.halfX);
    const nearestZ=clamp(position.z,body.position.z-body.shape.halfZ,body.position.z+body.shape.halfZ);
    const dx=position.x-nearestX,dz=position.z-nearestZ;
    return dx*dx+dz*dz<radius*radius-1e-9;
  }
}
