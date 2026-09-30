import * as THREE from 'three';

interface Viewport {width:number;height:number;}
interface LabelSize {width:number;height:number;}

/** Project a sourced actor, then keep its label readable when the head anchor is off screen. */
export function characterOverlay(
  camera:THREE.Camera,position:THREE.Vector3,viewport:Viewport,label:LabelSize,
  actorHeight=1.82,verticalTransform=1.1
):{left:number;top:number}|undefined {
  if(!(viewport.width>0&&viewport.height>0&&actorHeight>0))return;
  const center=position.clone().add(new THREE.Vector3(0,actorHeight*.5,0)).project(camera);
  if(center.z < -1||center.z>1||Math.abs(center.x)>1.15||Math.abs(center.y)>1.15)return;
  const head=position.clone().add(new THREE.Vector3(0,actorHeight+.13,0)).project(camera);
  if(!Number.isFinite(head.x+head.y+head.z))return;
  const margin=12,halfWidth=Math.min(label.width/2,viewport.width/2-margin);
  const topInset=Math.min(64,viewport.height*.2)+label.height*verticalTransform;
  return {
    left:THREE.MathUtils.clamp((head.x*.5+.5)*viewport.width,margin+halfWidth,viewport.width-margin-halfWidth),
    top:THREE.MathUtils.clamp((-head.y*.5+.5)*viewport.height,Math.min(topInset,viewport.height-margin),viewport.height-margin)
  };
}
