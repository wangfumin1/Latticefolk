import type {CoarseChunkState,Vec2,WildlifeState,WorldRandomness} from '../types.js';
import type {DynamicCollider,StaticCollider} from './finePhysics.js';
import {playerHeadClearance} from './characterContact.js';
import {keyedRandom,randomEventCursor,WorldRandomValidationError} from './worldRandom.js';

export interface ActorContact {
  blocked:(x:number,z:number,radius:number)=>boolean;
  static:readonly StaticCollider[];
  dynamic:readonly DynamicCollider[];
  player?:Vec2;
}

export function wildlifeBodyRadius(state:Pick<WildlifeState,'traits'>):number {
  return Math.max(.24,Math.min(.48,.20+state.traits.size*.10));
}

export function actorPointClear(point:Vec2,radius:number,contact:ActorContact,characterAsset?:string):boolean {
  if(!Number.isFinite(point.x)||!Number.isFinite(point.z)||!(radius>0&&Number.isFinite(radius)))return false;
  if(contact.blocked(point.x,point.z,radius))return false;
  for(const box of contact.static){
    const x=Math.max(box.minX,Math.min(box.maxX,point.x)),z=Math.max(box.minZ,Math.min(box.maxZ,point.z));
    if((point.x-x)**2+(point.z-z)**2<radius**2-1e-12)return false;
  }
  if(contact.dynamic.some(body=>Math.hypot(body.x-point.x,body.z-point.z)<body.radius+radius-1e-12))return false;
  return !characterAsset||!contact.player||playerHeadClearance(characterAsset,point,0,contact.player)>=0;
}

/** A finite, repeatable owner-cell search. No fallback may put a new body in a collider. */
export function findActorSpawn(anchor:Vec2,chunk:CoarseChunkState,radius:number,contact:ActorContact,characterAsset?:string):Vec2|undefined {
  if(actorPointClear(anchor,radius,contact,characterAsset))return {...anchor};
  const center={x:chunk.cx*24,z:chunk.cz*24};
  for(let ring=0;ring<=11;ring++)for(let z=-ring;z<=ring;z++)for(let x=-ring;x<=ring;x++){
    if(Math.max(Math.abs(x),Math.abs(z))!==ring)continue;
    const point={x:center.x+x,z:center.z+z};
    if(actorPointClear(point,radius,contact,characterAsset))return point;
  }
  return undefined;
}

/** Peek at the same keyed event as accepted entry without changing the queued cursor. */
export function pendingEntryPosition(state:WildlifeState,chunk:CoarseChunkState,randomness:WorldRandomness,contact:ActorContact):Vec2|undefined {
  const cursor=randomEventCursor(state.randomEventCursor);
  if(cursor===Number.MAX_SAFE_INTEGER)throw new WorldRandomValidationError('Entity random event cursor exhausted');
  const random=keyedRandom(randomness,'event','transfer-entry',state.id,cursor,chunk.id);
  const cx=chunk.cx*24,cz=chunk.cz*24,radius=wildlifeBodyRadius(state);
  for(let attempt=0;attempt<60;attempt++){
    const x=Math.round(Math.max(cx-11,Math.min(cx+11,state.position.x+(random()*2-1)*3)));
    const z=Math.round(Math.max(cz-11,Math.min(cz+11,state.position.z+(random()*2-1)*3)));
    if(actorPointClear({x,z},radius,contact))return {x,z};
  }
  return undefined;
}
