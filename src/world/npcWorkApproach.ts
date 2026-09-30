import type { PhysicsPoint, StaticCollider } from './finePhysics.js';
import { characterHeadEnvelope, NPC_BODY_RADIUS } from './characterContact.js';

export interface NpcWorkApproach extends PhysicsPoint { yaw:number; }
/** The oven's stable entity anchor is not a traversable navigation goal. Prefer a
 * source-clear side/front corner so a working baker does not occupy its front aisle.
 * This depends on the facility/rig and static authority, never a camera or observer.
 */
export function bakingWorkApproach(asset:string,anchor:PhysicsPoint,bounds:StaticCollider|undefined,
  blocked:(point:PhysicsPoint,radius:number)=>boolean):NpcWorkApproach|undefined {
  if(!bounds||![anchor.x,anchor.z,bounds.minX,bounds.maxX,bounds.minZ,bounds.maxZ].every(Number.isFinite)||
    bounds.minX>=bounds.maxX||bounds.minZ>=bounds.maxZ)return;
  const front=characterHeadEnvelope(asset).maxZ+.12;
  const center={x:(bounds.minX+bounds.maxX)/2,z:(bounds.minZ+bounds.maxZ)/2};
  for(const x of [bounds.maxX+front,bounds.minX-front]){
    const point={x,z:bounds.maxZ};
    if(Math.hypot(point.x-anchor.x,point.z-anchor.z)>2.3||blocked(point,NPC_BODY_RADIUS))continue;
    // The existing path grid must also be able to reach the final approach cell.
    if(blocked({x:Math.round(point.x),z:Math.round(point.z)},NPC_BODY_RADIUS))continue;
    return {...point,yaw:Math.atan2(center.x-point.x,center.z-point.z)};
  }
}
