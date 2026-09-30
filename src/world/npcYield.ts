import type { DynamicCollider, PhysicsPoint } from './finePhysics.js';
import { FinePhysicsAuthority } from './finePhysics.js';
import { characterHeadEnvelope, NPC_BODY_RADIUS, PLAYER_BODY_RADIUS, npcHeadConstraint } from './characterContact.js';

/** Transient motor state only: no replacement task, destination, saved position or provider call. */
export interface NpcYieldPlan { direction:PhysicsPoint; travel:PhysicsPoint; remaining:number; }
interface YieldInput {
  id:string; asset:string; position:PhysicsPoint; yaw:number;
  player?:PhysicsPoint; travel?:PhysicsPoint; activePath:boolean; blockedPlayer:boolean;
  plan?:NpcYieldPlan; dt:number; dynamic:readonly DynamicCollider[];
}
const finitePoint=(p:PhysicsPoint)=>Number.isFinite(p.x)&&Number.isFinite(p.z);

/** Two lateral exits from the attempted player's corridor, ordered by shortest clearance.
 * Project the unchanged oriented head corners rather than assigning another radial maximum.
 */
export function npcYieldOptions(asset:string,position:PhysicsPoint,yaw:number,player:PhysicsPoint,travel:PhysicsPoint):NpcYieldPlan[] {
  if(!finitePoint(position)||!finitePoint(player)||!finitePoint(travel)||!Number.isFinite(yaw))return [];
  const length=Math.hypot(travel.x,travel.z);if(length<1e-9)return [];
  const forward={x:travel.x/length,z:travel.z/length};
  const right={x:-forward.z,z:forward.x},e=characterHeadEnvelope(asset),c=Math.cos(yaw),s=Math.sin(yaw);
  let min=Infinity,max=-Infinity;
  for(const x of [e.minX,e.maxX])for(const z of [e.minZ,e.maxZ]){
    const projection=((position.x-player.x)+c*x+s*z)*right.x+((position.z-player.z)-s*x+c*z)*right.z;
    min=Math.min(min,projection);max=Math.max(max,projection);
  }
  const margin=PLAYER_BODY_RADIUS+.12;
  return [
    {direction:right,travel:forward,remaining:Math.max(0,margin-min)},
    {direction:{x:-right.x,z:-right.z},travel:forward,remaining:Math.max(0,max+margin)}
  ].sort((a,b)=>a.remaining-b.remaining);
}

/** An already walking NPC yields through the same authoritative solver, not a player push.
 * Idle NPCs remain solid and stationary. No input, observer mode (absent player), or a
 * completed path immediately invalidates this transient courtesy maneuver.
 */
export function stepNpcYield(physics:FinePhysicsAuthority,input:YieldInput):{position:PhysicsPoint;plan?:NpcYieldPlan}|undefined {
  const {player,travel,position,yaw,asset}=input;
  if(!input.activePath||!player||!travel||!finitePoint(travel)||!Number.isFinite(input.dt)||input.dt<=0)return;
  const length=Math.hypot(travel.x,travel.z);if(length<1e-9)return;
  const forward={x:travel.x/length,z:travel.z/length};
  const previous=input.plan;
  const continuing=previous&&previous.remaining>1e-5&&previous.travel.x*forward.x+previous.travel.z*forward.z>.99;
  if(!continuing&&!input.blockedPlayer)return;
  const choices=continuing?[previous]:npcYieldOptions(asset,position,yaw,player,travel);
  for(const plan of choices){
    if(plan.remaining<=1e-5)continue;
    const step=Math.min(plan.remaining,1.65*Math.min(input.dt,.05));
    // Keep the current facing during the sidestep: turning wide hair must not sweep
    // through the player. Normal path-facing resumes under safeNpcHeading afterward.
    const result=physics.moveKinematic({id:input.id,position,displacement:{x:plan.direction.x*step,z:plan.direction.z*step},
      radius:NPC_BODY_RADIUS,dynamic:input.dynamic,constraints:[npcHeadConstraint(asset,player,yaw)]});
    const progress=result.displacement.x*plan.direction.x+result.displacement.z*plan.direction.z;
    if(progress<=1e-6)continue;
    const remaining=Math.max(0,plan.remaining-progress);
    return {position:result.position,plan:remaining>1e-5?{...plan,remaining}:undefined};
  }
  return;
}
