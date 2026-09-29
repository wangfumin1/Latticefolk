import * as THREE from 'three';
import type { PhysicsTrigger, StaticCollider } from '../world/finePhysics';

// Adult source proportions; the old 3.5 m fit put broad crowns at the 1.7 m eye.
// A generated plan's existing height draw remains a bounded visual variation only.
const ADULT_HEIGHT:Readonly<Record<string,number>>={tree1:7.0,tree2:7.4,tree3:8.4};
export function treeVisualHeight(asset:string,plannedHeight?:number) {
  const height=ADULT_HEIGHT[asset];
  if(!height)throw new Error(`Uncalibrated tree asset: ${asset}`);
  const variation=plannedHeight===undefined?1:THREE.MathUtils.clamp(plannedHeight/3.8,.9,1.15);
  return height*variation;
}

/** Actual basal vertices, not the asymmetric crown's center or its collision box. */
export function treeBaseBounds(model:THREE.Object3D,bandHeight=.15) {
  model.updateWorldMatrix(true,true);
  const full=new THREE.Box3().setFromObject(model,true);
  if(full.isEmpty()||!Number.isFinite(full.min.y))throw new Error('Tree has no finite source geometry');
  const base=new THREE.Box3();
  const vertex=new THREE.Vector3();
  model.traverse(child=>{
    const mesh=child as THREE.Mesh;
    if(!mesh.isMesh)return;
    const positions=mesh.geometry.getAttribute('position');
    for(let index=0;index<positions.count;index++){
      mesh.getVertexPosition(index,vertex).applyMatrix4(mesh.matrixWorld);
      if(vertex.y<=full.min.y+bandHeight)base.expandByPoint(vertex);
    }
  });
  if(base.isEmpty())throw new Error('Tree has no basal source vertices');
  return base;
}

/** Transform the original model only. Source buffers, topology and materials stay intact. */
export function fitTreeModel(model:THREE.Object3D,height:number,rotationY:number) {
  if(!(height>0&&Number.isFinite(height)&&Number.isFinite(rotationY)))throw new Error('Invalid tree fit');
  if(model.parent)throw new Error('Fit tree before attaching it to its semantic anchor');
  model.updateMatrixWorld(true);
  const original=new THREE.Box3().setFromObject(model,true);
  const originalHeight=original.max.y-original.min.y;
  if(!(originalHeight>0))throw new Error('Tree has no vertical extent');
  model.scale.multiplyScalar(height/originalHeight);
  model.rotation.y=rotationY;
  model.updateMatrixWorld(true);
  const center=treeBaseBounds(model).getCenter(new THREE.Vector3());
  const bottom=new THREE.Box3().setFromObject(model,true).min.y;
  model.position.x-=center.x;
  model.position.z-=center.z;
  model.position.y-=bottom;
  model.traverse(child=>{
    const mesh=child as THREE.Mesh;
    if(mesh.isMesh){mesh.castShadow=true;mesh.receiveShadow=true;}
  });
  model.updateMatrixWorld(true);
  const size=new THREE.Box3().setFromObject(model,true).getSize(new THREE.Vector3());
  return {x:size.x,y:size.y,z:size.z};
}

export function treePhysics(
  model:THREE.Object3D,id:string,chunkId?:string,interactive=true
):{collider:StaticCollider;trigger?:PhysicsTrigger} {
  const base=treeBaseBounds(model);
  const collider:StaticCollider={id,minX:base.min.x,maxX:base.max.x,minZ:base.min.z,maxZ:base.max.z,chunkId};
  if(!(collider.maxX>collider.minX&&collider.maxZ>collider.minZ))throw new Error(`Invalid tree base: ${id}`);
  // Reach surrounds the trunk, not the crown. Movement/tool contacts remain in physics.
  const padding=.65;
  const trigger:PhysicsTrigger|undefined=interactive?{
    id:id.replace(/^object:/,'object-trigger:'),chunkId,tag:'interaction',
    minX:base.min.x-padding,maxX:base.max.x+padding,minZ:base.min.z-padding,maxZ:base.max.z+padding
  }:undefined;
  return {collider,trigger};
}
