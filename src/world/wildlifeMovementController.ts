import type { WildlifeMovementProfile } from './wildlifeSpecies.js';

export interface WildlifeMovementControllerState {
  speed:number;
  heading:number;
}

export interface WildlifeMovementControllerInput {
  x:number;
  z:number;
  targetX:number;
  targetZ:number;
  maxSpeed:number;
  dt:number;
  profile:WildlifeMovementProfile;
  state:WildlifeMovementControllerState;
}

export interface WildlifeMovementControllerStep {
  dx:number;
  dz:number;
  speed:number;
  heading:number;
  desiredHeading:number;
  distance:number;
  arrived:boolean;
  gait:string;
}

const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const normalizeAngle=(angle:number)=>{
  let value=angle;
  while(value>Math.PI)value-=Math.PI*2;
  while(value<-Math.PI)value+=Math.PI*2;
  return value;
};

export function approachWildlifeHeading(current:number,target:number,maxDelta:number){
  const delta=normalizeAngle(target-current);
  if(Math.abs(delta)<=maxDelta)return normalizeAngle(target);
  return normalizeAngle(current+Math.sign(delta)*maxDelta);
}

export function stepWildlifeMovementController(input:WildlifeMovementControllerInput):WildlifeMovementControllerStep {
  const dt=clamp(input.dt,0,.1);
  const dx=input.targetX-input.x;
  const dz=input.targetZ-input.z;
  const distance=Math.hypot(dx,dz);
  const desiredHeading=distance>1e-6?Math.atan2(dx,dz):input.state.heading;
  const arrivalRadius=Math.max(.04,input.profile.arrivalRadius);

  if(distance<=arrivalRadius){
    const speed=Math.max(0,input.state.speed-input.maxSpeed*input.profile.decelerationRate*dt);
    return {dx:0,dz:0,speed:0,heading:input.state.heading,desiredHeading,distance,arrived:true,gait:input.profile.gait};
  }

  const heading=approachWildlifeHeading(
    input.state.heading,
    desiredHeading,
    Math.max(.05,input.profile.turnRate)*dt
  );
  const turnError=Math.abs(normalizeAngle(desiredHeading-heading));
  const alignment=clamp(Math.cos(turnError),0,1);
  const turnSpeedFactor=.22+.78*alignment;
  const desiredSpeed=Math.max(0,input.maxSpeed)*turnSpeedFactor;
  const accelerating=desiredSpeed>=input.state.speed;
  const rate=accelerating?input.profile.accelerationRate:input.profile.decelerationRate;
  const speedDelta=Math.max(0,input.maxSpeed)*Math.max(.05,rate)*dt;
  const speed=accelerating
    ?Math.min(desiredSpeed,input.state.speed+speedDelta)
    :Math.max(desiredSpeed,input.state.speed-speedDelta);
  const stepDistance=Math.min(distance,Math.max(0,speed)*dt);

  return {
    dx:Math.sin(heading)*stepDistance,
    dz:Math.cos(heading)*stepDistance,
    speed,
    heading,
    desiredHeading,
    distance,
    arrived:false,
    gait:input.profile.gait
  };
}

export function stopWildlifeMovementController(
  state:WildlifeMovementControllerState,
  profile:WildlifeMovementProfile,
  maxSpeed:number,
  dt:number
):WildlifeMovementControllerState {
  const next=Math.max(0,state.speed-Math.max(0,maxSpeed)*Math.max(.05,profile.decelerationRate)*clamp(dt,0,.1));
  return {speed:next<.001?0:next,heading:state.heading};
}
