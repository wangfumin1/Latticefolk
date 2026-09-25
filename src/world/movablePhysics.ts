import { FinePhysicsAuthority, type DynamicCollider, type KinematicMoveResult, type PhysicsPoint } from './finePhysics.js';
import type { RigidBodyArchetypeId, WorldObjectState } from '../types.js';

export interface RigidBodyArchetype {
  id:RigidBodyArchetypeId;
  radius:number;
  maxSubstep:number;
  pushScale:number;
}

export const RIGID_BODY_ARCHETYPES:Readonly<Record<RigidBodyArchetypeId,RigidBodyArchetype>>={
  cart:{id:'cart',radius:1.05,maxSubstep:.14,pushScale:1}
};

export interface MovableBodyInput {
  id:string;
  position:PhysicsPoint;
  archetype:RigidBodyArchetype;
}

function finitePositive(value:number|undefined,fallback:number){
  return Number.isFinite(value)&&Number(value)>0?Number(value):fallback;
}

/**
 * Resolve canonical rigid-body semantics for a WorldObject.
 * Legacy movable cart snapshots remain readable so existing SQLite worlds upgrade
 * without creating a parallel physics state store.
 */
export function worldObjectRigidBody(state:WorldObjectState):RigidBodyArchetype|undefined {
  const canonical=state.rigidBodyArchetype
    ? RIGID_BODY_ARCHETYPES[state.rigidBodyArchetype]
    : undefined;
  if(canonical)return canonical;

  if(state.movable&&state.kind==='cart'){
    const base=RIGID_BODY_ARCHETYPES.cart;
    return {...base,radius:finitePositive(state.physicsRadius,base.radius)};
  }
  return undefined;
}

/**
 * Upgrade legacy persisted movable semantics in-place to the canonical archetype id.
 * The next normal world snapshot persists the upgraded form.
 */
export function normalizeWorldObjectRigidBody(state:WorldObjectState):RigidBodyArchetype|undefined {
  const profile=worldObjectRigidBody(state);
  if(!profile)return undefined;
  state.rigidBodyArchetype=profile.id;
  delete state.movable;
  delete state.physicsRadius;
  return RIGID_BODY_ARCHETYPES[profile.id];
}

/**
 * Resolve a movable prop through the same deterministic fine-physics authority used by characters.
 * The caller owns authoritative object state and applies only the returned position.
 */
export function resolveMovableBodyStep(
  physics:FinePhysicsAuthority,
  body:MovableBodyInput,
  displacement:PhysicsPoint,
  dynamic:readonly DynamicCollider[]=[]
):KinematicMoveResult {
  const requested={
    x:(Number.isFinite(displacement.x)?displacement.x:0)*body.archetype.pushScale,
    z:(Number.isFinite(displacement.z)?displacement.z:0)*body.archetype.pushScale
  };
  return physics.moveKinematic({
    id:body.id,
    position:body.position,
    displacement:requested,
    radius:Math.max(.05,body.archetype.radius),
    dynamic,
    maxSubstep:Math.max(.05,body.archetype.maxSubstep)
  });
}
