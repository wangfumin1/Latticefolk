import type { WorldObjectState } from '../types';
import type { StaticCollider, PhysicsTrigger } from '../world/finePhysics';

export const BAKING_OVEN_ASSET = 'bakingOvenAsset';
export const BAKING_OVEN_HEIGHT = 3.6; // Original 1.08 m cooking surface plus chimney, not a 3.6 m countertop.
export const BAKING_OVEN_TRIGGER_PADDING = .5;

type OvenIdentity = Pick<WorldObjectState,'id'|'kind'|'tags'>;
export function isBakingOven(state:OvenIdentity) {
  return state.kind==='workstation' && (state.id==='oven'||state.tags.includes('baker')||state.tags.includes('oven'));
}

export function bakingOvenVisualSpec(state:OvenIdentity) {
  if(!isBakingOven(state))return undefined;
  return {
    asset:BAKING_OVEN_ASSET,height:BAKING_OVEN_HEIGHT,width:1.4,depth:.9,
    fit:'uniform' as const,syncStatic:true,
    // The home entity anchor predates the building-scale repair. Place the licensed
    // visual in front of the facade without moving the saved anchor/NPC work target.
    // Generated bakeries have their own independent lot and need no facade offset.
    offsetZ:state.id==='oven'?.4:0
  };
}

export function bakingOvenPhysics(
  state:Pick<WorldObjectState,'id'|'chunkId'>,
  bounds:Pick<StaticCollider,'minX'|'maxX'|'minZ'|'maxZ'>
):{collider:StaticCollider;trigger:PhysicsTrigger} {
  const values=[bounds.minX,bounds.maxX,bounds.minZ,bounds.maxZ];
  if(!values.every(Number.isFinite)||bounds.minX>=bounds.maxX||bounds.minZ>=bounds.maxZ){
    throw new Error(`Invalid resolved baking oven footprint: ${state.id}`);
  }
  return {
    collider:{...bounds,id:`object:${state.id}`,chunkId:state.chunkId},
    trigger:{
      id:`object-trigger:${state.id}`,chunkId:state.chunkId,tag:'interaction',
      minX:bounds.minX-BAKING_OVEN_TRIGGER_PADDING,maxX:bounds.maxX+BAKING_OVEN_TRIGGER_PADDING,
      minZ:bounds.minZ-BAKING_OVEN_TRIGGER_PADDING,maxZ:bounds.maxZ+BAKING_OVEN_TRIGGER_PADDING
    }
  };
}
