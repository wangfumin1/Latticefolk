import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SunShadowView } from '../src/scene/sunShadow.js';

function fixture(){
  const scene=new THREE.Scene(),sun=new THREE.DirectionalLight();scene.add(sun,sun.target);
  return {sun,view:new SunShadowView(sun)};
}
function inside(sun:THREE.DirectionalLight,p:THREE.Vector3){
  const clip=p.clone().project(sun.shadow.camera);
  assert.ok(Math.abs(clip.x)<=1&&Math.abs(clip.y)<=1&&Math.abs(clip.z)<=1,JSON.stringify(clip));
}

test('bounded sun window covers nearby ground and tall sourced casters at home and distant coordinates',()=>{
  const {sun,view}=fixture();
  for(const focus of [new THREE.Vector3(-9,0,-7.5),new THREE.Vector3(10000,12,-20000)]){
    view.update('firstPerson',focus);
    for(const dx of [-12,0,12])for(const dz of [-12,0,12])for(const dy of [0,10])inside(sun,focus.clone().add(new THREE.Vector3(dx,dy,dz)));
    const direction=sun.position.clone().sub(sun.target.position).normalize();
    assert.ok(direction.distanceTo(new THREE.Vector3(12,22,8).normalize())<1e-10);
    assert.equal(view.diagnostics().halfExtent,24);assert.equal(sun.shadow.mapSize.x,2048);
  }
});

test('light-space texel anchoring resists subpixel movement and God View remains bounded',()=>{
  const {sun,view}=fixture();
  view.update('firstPerson',new THREE.Vector3());
  const point=new THREE.Vector3(1,0,2),before=point.clone().applyMatrix4(sun.shadow.matrix);
  view.update('firstPerson',new THREE.Vector3(.000001,0,0));
  const after=point.clone().applyMatrix4(sun.shadow.matrix);
  assert.ok(Math.abs(after.x-before.x)<1e-9&&Math.abs(after.y-before.y)<1e-9);
  for(const distance of [0,20,96,5000]){
    view.update('god',new THREE.Vector3(100,4,200),distance);
    const span=view.diagnostics().halfExtent;
    assert.ok(span>=32&&span<=96);assert.equal(sun.shadow.mapSize.x,2048);
    const texel=2*span/2048;
    assert.equal(sun.shadow.normalBias,2*texel);
    assert.ok(Math.abs(sun.shadow.bias*(sun.shadow.camera.far-sun.shadow.camera.near)+texel)<1e-9);
  }
  const original=sun.position.clone();view.update('god',new THREE.Vector3(NaN,0,0));
  assert.deepEqual(sun.position,original);
  view.update('firstPerson',new THREE.Vector3());assert.equal(view.diagnostics().halfExtent,24);
});
