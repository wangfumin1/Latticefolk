import type { KinematicConstraint, PhysicsPoint } from './finePhysics.js';

export const PLAYER_BODY_RADIUS=.30;
export const NPC_BODY_RADIUS=.32;
export interface CharacterHeadEnvelope { readonly minX:number; readonly maxX:number; readonly minZ:number; readonly maxZ:number; }

// Measured in the normalized 1.82 m source frame at y=1.3..1.9, across all six
// grounded clips. Rounded outward with >=5 cm margin. Never mutate source meshes.
// A radial maximum incorrectly fills the empty space in front of/behind wide hair.
const HEAD_ENVELOPES:Readonly<Record<string,CharacterHeadEnvelope>>=Object.freeze({
  female1:Object.freeze({minX:-.80,maxX:.95,minZ:-1.05,maxZ:.75}),
  female2:Object.freeze({minX:-1.30,maxX:1.35,minZ:-1.15,maxZ:.75}),
  male1:Object.freeze({minX:-.70,maxX:.65,minZ:-.90,maxZ:.65}),
  male2:Object.freeze({minX:-.80,maxX:.95,minZ:-1.05,maxZ:.75})
});
export function characterHeadEnvelope(asset:string):CharacterHeadEnvelope {
  const envelope=HEAD_ENVELOPES[asset];
  if(!envelope)throw new Error(`Uncalibrated character head: ${asset}`);
  return envelope;
}

/** Signed separation of the player's disc and the source-oriented head rectangle.
 * Positive is clear. Negative is overlap depth, including points inside the rectangle.
 * The rounded corners are the exact rectangle/disc Minkowski sum, not another AABB.
 */
export function playerHeadClearance(asset:string,npc:PhysicsPoint,yaw:number,player:PhysicsPoint):number {
  const e=characterHeadEnvelope(asset);
  if(![npc.x,npc.z,yaw,player.x,player.z].every(Number.isFinite))return Number.NEGATIVE_INFINITY;
  const dx=player.x-npc.x,dz=player.z-npc.z,c=Math.cos(yaw),s=Math.sin(yaw);
  // Inverse of the same +Y rotation used by the source model (+Z is its front).
  const x=c*dx-s*dz,z=s*dx+c*dz;
  const qx=Math.abs(x-(e.minX+e.maxX)/2)-(e.maxX-e.minX)/2;
  const qz=Math.abs(z-(e.minZ+e.maxZ)/2)-(e.maxZ-e.minZ)/2;
  return Math.hypot(Math.max(qx,0),Math.max(qz,0))+Math.min(Math.max(qx,qz),0)-PLAYER_BODY_RADIUS;
}

/** Frontal center separation for the read-only diagnostic, not an isotropic collider. */
export function npcPlayerSeparation(asset:string) { return characterHeadEnvelope(asset).maxZ+PLAYER_BODY_RADIUS; }

export function playerHeadConstraint(id:string,asset:string,npc:PhysicsPoint,yaw:number):KinematicConstraint {
  const anchor={...npc};
  return {id,clearance:point=>playerHeadClearance(asset,anchor,yaw,point)};
}
export function npcHeadConstraint(asset:string,player:PhysicsPoint,yaw:number):KinematicConstraint {
  const anchor={...player};
  return {id:'player',clearance:point=>playerHeadClearance(asset,point,yaw,anchor)};
}

/** An instantaneous path turn must not sweep the wider side of the head into a player.
 * Keep the previous heading until translation clears it; existing overlap may improve.
 */
export function safeNpcHeading(asset:string,npc:PhysicsPoint,previous:number,desired:number,player:PhysicsPoint):number {
  const next=playerHeadClearance(asset,npc,desired,player);
  const current=playerHeadClearance(asset,npc,previous,player);
  return next>=-1e-9||(current<0&&next>current+1e-9)?desired:previous;
}

export const PLAYER_CONVERSATION_REACH=2.2;
export function reachedPlayerConversation(playerExists:boolean,action:string|undefined,targetId:string|undefined,distance:number) {
  return playerExists&&targetId==='player'&&(action==='talk'||action==='visit')&&
    Number.isFinite(distance)&&distance>=0&&distance<=PLAYER_CONVERSATION_REACH;
}
