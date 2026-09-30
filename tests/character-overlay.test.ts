import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { characterOverlay } from '../src/scene/characterOverlay.js';

const viewport={width:1440,height:900},label={width:310,height:64};
function camera(x:number,y:number,z:number){
  const camera=new THREE.PerspectiveCamera(70,viewport.width/viewport.height,.1,1000);
  camera.position.set(x,y,z);camera.rotation.set(-.22,0,0,'YXZ');camera.updateMatrixWorld();
  return camera;
}

test('near-source dialogue stays in the viewport rather than using the obsolete 2.9 m anchor',()=>{
  const view=camera(-9,1.7,-9.25),actor=new THREE.Vector3(-9,0,-11);
  const obsolete=new THREE.Vector3(-9,2.9,-11).project(view);
  assert.ok(obsolete.y>1,'reproduce the off-screen legacy dialogue at actual contact distance');
  const result=characterOverlay(view,actor,viewport,label)!;assert.ok(result);
  assert.ok(result.top-label.height*1.1>=64-1e-6);
  assert.ok(result.left-label.width/2>=12&&result.left+label.width/2<=viewport.width-12);
});

test('character overlay follows elevated authoritative ground and hides actors behind the camera',()=>{
  const plain=characterOverlay(camera(-9,1.7,-9.25),new THREE.Vector3(-9,0,-11),viewport,label);
  const elevated=characterOverlay(camera(-9,11.7,-9.25),new THREE.Vector3(-9,10,-11),viewport,label);
  assert.ok(plain&&elevated);assert.ok(Math.abs(plain.top-elevated.top)<1e-8);
  assert.equal(characterOverlay(camera(0,1.7,0),new THREE.Vector3(0,0,5),viewport,label),undefined);
  assert.equal(characterOverlay(camera(0,1.7,0),new THREE.Vector3(0,0,-2),{width:0,height:0},label),undefined);
});
