import type { DoorCollider, StaticCollider } from './finePhysics.js';

export type BuildingEntranceSide='north'|'south'|'east'|'west';
export interface BuildingPhysicsLayout {entrance:BuildingEntranceSide;doorCenter:{x:number;z:number};interactionPosition:{x:number;z:number};doorRotationY:number;doorWidth:number;walls:StaticCollider[];door:DoorCollider;}
export interface BuildingPhysicsInput {id:string;x:number;z:number;w:number;d:number;rotationY?:number;chunkId?:string;doorWidth?:number;wallThickness?:number;interactionOffset?:number;}

function entranceSide(rotationY:number):BuildingEntranceSide {
  const fx=Math.sin(rotationY),fz=Math.cos(rotationY);
  if(Math.abs(fx)>Math.abs(fz))return fx>=0?'east':'west';
  return fz>=0?'north':'south';
}

export function buildingPhysicsLayout(input:BuildingPhysicsInput):BuildingPhysicsLayout {
  const w=Math.max(2,Math.abs(input.w)),d=Math.max(2,Math.abs(input.d));
  const t=Math.min(Math.max(.16,input.wallThickness??.32),Math.min(w,d)/3);
  const doorWidth=Math.min(Math.max(.7,input.doorWidth??1.35),Math.max(.7,Math.min(w,d)-t*3));
  const doorHalf=doorWidth/2,offset=Math.max(.55,input.interactionOffset??1.15);
  const minX=input.x-w/2,maxX=input.x+w/2,minZ=input.z-d/2,maxZ=input.z+d/2;
  const entrance=entranceSide(Number.isFinite(input.rotationY)?input.rotationY||0:0),chunkId=input.chunkId;
  const wall=(suffix:string,a:number,b:number,c:number,e:number):StaticCollider=>({id:`building:${input.id}:wall:${suffix}`,minX:Math.min(a,b),maxX:Math.max(a,b),minZ:Math.min(c,e),maxZ:Math.max(c,e),chunkId});
  let doorCenter={x:input.x,z:input.z},interactionPosition={x:input.x,z:input.z},doorRotationY=0;const walls:StaticCollider[]=[];let door:DoorCollider;
  if(entrance==='north'||entrance==='south'){
    const north=entrance==='north',front=north?maxZ:minZ,back=north?minZ:maxZ,sign=north?1:-1;
    walls.push(wall('west',minX,minX+t,minZ,maxZ),wall('east',maxX-t,maxX,minZ,maxZ),wall('back',minX+t,maxX-t,back-t/2,back+t/2),wall('front-west',minX+t,input.x-doorHalf,front-t/2,front+t/2),wall('front-east',input.x+doorHalf,maxX-t,front-t/2,front+t/2));
    doorCenter={x:input.x,z:front};interactionPosition={x:input.x,z:front+sign*offset};
    door={id:`door:${input.id}`,minX:input.x-doorHalf,maxX:input.x+doorHalf,minZ:front-t/2,maxZ:front+t/2,chunkId,open:false};
  }else{
    const east=entrance==='east',front=east?maxX:minX,back=east?minX:maxX,sign=east?1:-1;doorRotationY=Math.PI/2;
    walls.push(wall('south',minX,maxX,minZ,minZ+t),wall('north',minX,maxX,maxZ-t,maxZ),wall('back',back-t/2,back+t/2,minZ+t,maxZ-t),wall('front-south',front-t/2,front+t/2,minZ+t,input.z-doorHalf),wall('front-north',front-t/2,front+t/2,input.z+doorHalf,maxZ-t));
    doorCenter={x:front,z:input.z};interactionPosition={x:front+sign*offset,z:input.z};
    door={id:`door:${input.id}`,minX:front-t/2,maxX:front+t/2,minZ:input.z-doorHalf,maxZ:input.z+doorHalf,chunkId,open:false};
  }
  return {entrance,doorCenter,interactionPosition,doorRotationY,doorWidth,walls,door};
}
