import { FinePhysicsAuthority, type DynamicCollider, type PhysicsContactKind, type PhysicsPoint, type SegmentContactHit } from './finePhysics.js';

export type ContactActionStatus='hit'|'blocked'|'out_of_range'|'missing_target';
export interface ContactActionInput {
  actorId:string; targetId:string; start:PhysicsPoint; end:PhysicsPoint; maxRange:number;
  sweepRadius?:number; dynamic?:readonly DynamicCollider[];
}
export interface ContactActionResult {
  status:ContactActionStatus; distance:number; targetId:string; blockerId?:string;
  blockerKind?:PhysicsContactKind; contact?:SegmentContactHit;
}
export function resolveContactAction(physics:FinePhysicsAuthority,input:ContactActionInput):ContactActionResult {
  const dx=input.end.x-input.start.x,dz=input.end.z-input.start.z,distance=Math.hypot(dx,dz);
  const maxRange=Math.max(0,Number.isFinite(input.maxRange)?input.maxRange:0),base={distance,targetId:input.targetId};
  if(!Number.isFinite(distance)||distance>maxRange+1e-9)return {...base,status:'out_of_range'};
  const contact=physics.firstSegmentContact({start:input.start,end:input.end,radius:Math.max(0,input.sweepRadius??0),dynamic:input.dynamic,excludeIds:[input.actorId]});
  if(!contact)return {...base,status:'missing_target'};
  if(contact.id===input.targetId)return {...base,status:'hit',contact};
  return {...base,status:'blocked',blockerId:contact.id,blockerKind:contact.kind,contact};
}
