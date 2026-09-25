import { FinePhysicsAuthority, type DynamicCollider, type KinematicMoveResult, type PhysicsPoint } from './finePhysics.js';

export interface MovableBodyInput {
  id:string;
  position:PhysicsPoint;
  radius:number;
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
  return physics.moveKinematic({
    id:body.id,
    position:body.position,
    displacement,
    radius:Math.max(.05,body.radius),
    dynamic,
    maxSubstep:.14
  });
}
