import type { WildlifeMovementProfile } from './wildlifeSpecies.js';

export interface WildlifeMotionState {
  speed:number;
  /** Yaw in radians using the same convention as Three.js rotation.y / atan2(dx,dz). */
  heading:number;
}

export interface WildlifeMotionStep extends WildlifeMotionState {
  travelDistance:number;
  speedRatio:number;
  arrived:boolean;
}

const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const moveToward=(value:number,target:number,maxDelta:number)=>{
  if(value<target)return Math.min(target,value+maxDelta);
  if(value>target)return Math.max(target,value-maxDelta);
  return value;
};
const normalizeAngle=(angle:number)=>{
  let value=angle;
  while(value>Math.PI)value-=Math.PI*2;
  while(value<-Math.PI)value+=Math.PI*2;
  return value;
};

/**
 * Deterministic pre-physics wildlife controller.
 *
 * Translation stays on the pathfinder-supplied segment; heading is visual only.
 * This gives movement modes bounded acceleration/braking/turn semantics without
 * allowing controller integration to cut corners through blocked geometry.
 */
export function stepWildlifeMovementController(
  current:WildlifeMotionState,
  movement:WildlifeMovementProfile,
  targetSpeed:number,
  desiredHeading:number,
  distanceToWaypoint:number,
  dt:number
):WildlifeMotionStep {
  const stepDt=clamp(Number.isFinite(dt)?dt:0,0,.10);
  const distance=Math.max(0,Number.isFinite(distanceToWaypoint)?distanceToWaypoint:0);
  const maxSpeed=Math.max(0,Number.isFinite(targetSpeed)?targetSpeed:0);
  const arrival=Math.max(.01,movement.arrivalRadius);
  const acceleration=Math.max(.01,movement.acceleration);
  const deceleration=Math.max(.01,movement.deceleration);
  const currentSpeed=Math.max(0,Number.isFinite(current.speed)?current.speed:0);

  const turnDelta=normalizeAngle(desiredHeading-(Number.isFinite(current.heading)?current.heading:0));
  const heading=normalizeAngle(
    (Number.isFinite(current.heading)?current.heading:0)+
    clamp(turnDelta,-movement.turnRate*stepDt,movement.turnRate*stepDt)
  );

  if(distance<=arrival||maxSpeed<=0||stepDt<=0){
    const speed=moveToward(currentSpeed,0,deceleration*stepDt);
    return {speed,heading,travelDistance:0,speedRatio:maxSpeed>0?clamp(speed/maxSpeed,0,1.25):0,arrived:distance<=arrival};
  }

  // Classic stopping-speed bound: start braking early enough to enter the
  // waypoint radius without overshooting it.
  const brakingSpeed=Math.sqrt(2*deceleration*Math.max(0,distance-arrival));
  const desiredSpeed=Math.min(maxSpeed,brakingSpeed);
  const rate=desiredSpeed>=currentSpeed?acceleration:deceleration;
  const speed=moveToward(currentSpeed,desiredSpeed,rate*stepDt);
  const remaining=Math.max(0,distance-arrival);
  const travelDistance=Math.min(remaining,speed*stepDt);
  const arrived=travelDistance>=remaining-1e-9;

  return {
    speed,
    heading,
    travelDistance,
    speedRatio:maxSpeed>0?clamp(speed/maxSpeed,0,1.25):0,
    arrived
  };
}
