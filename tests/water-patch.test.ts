import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { sourceGltf } from './helpers/source-gltf.js';
import {
  WATER_PATCH_ASSET, WATER_PATCH_DEPTH, WATER_PATCH_ORIGINAL_SOURCE, WATER_PATCH_SOURCE, WATER_PATCH_SURFACE_Y,
  WATER_PATCH_UPSTREAM_BLOB, WATER_PATCH_WIDTH, waterPatchVisualSpec
} from '../src/scene/waterPatch.js';
import type { WorldObjectState } from '../src/types.js';

test('water patch uses the unchanged pinned Kenney Nature Kit source', async () => {
  const file=new URL(`../public/assets/${WATER_PATCH_ORIGINAL_SOURCE}`,import.meta.url);
  const bytes=fs.readFileSync(file);
  const gitBlob=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  assert.equal(gitBlob,WATER_PATCH_UPSTREAM_BLOB);

  const original=await sourceGltf(WATER_PATCH_ORIGINAL_SOURCE);
  const source=await sourceGltf(WATER_PATCH_SOURCE);
  const sourceBox=new THREE.Box3().setFromObject(original.scene);
  const servedBox=new THREE.Box3().setFromObject(source.scene);
  assert.deepEqual(servedBox.min.toArray(),sourceBox.min.toArray());
  assert.deepEqual(servedBox.max.toArray(),sourceBox.max.toArray());
  const box=servedBox;
  const size=new THREE.Vector3();box.getSize(size);
  assert.ok(Math.abs(size.x-1)<1e-6);
  assert.ok(Math.abs(size.z-1)<1e-6);
  assert.ok(size.y<1e-6,'source remains an authored flat water surface');

  let meshes=0,assistantPrimitives=0,waterMaterial=false;
  source.scene.traverse(child=>{
    const mesh=child as THREE.Mesh;
    if(!mesh.isMesh)return;
    meshes++;
    if(['BoxGeometry','CylinderGeometry','ConeGeometry','PlaneGeometry'].includes(mesh.geometry.type))assistantPrimitives++;
    const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    if(materials.some(material=>{
      if(material?.name!=='water')return false;
      const standard=material as THREE.MeshStandardMaterial;
      assert.equal(standard.metalness,0,'served water must remain dielectric under scene lighting');
      assert.ok(standard.color.r>.6&&standard.color.g>.9&&standard.color.b>.95,'served water keeps upstream pale-blue base color');
      return true;
    }))waterMaterial=true;
  });
  assert.ok(meshes>0);
  assert.equal(assistantPrimitives,0);
  assert.equal(waterMaterial,true);
});

test('water patch presentation keeps the existing 3.4m semantic footprint without changing state', () => {
  const state:WorldObjectState={
    id:'chunk_2_0_object_natural_water',chunkId:'chunk_2_0',kind:'water_patch',name:'自然水洼',
    position:{x:53.8,z:5.4},tags:['water','nature','habitat'],usable:true,pickupable:false,
    resourceAmount:10,resourceCapacity:10,capabilities:['inspect','drink','draw_water','wash']
  };
  const original=structuredClone(state);
  assert.deepEqual(waterPatchVisualSpec(state),{
    asset:WATER_PATCH_ASSET,source:WATER_PATCH_SOURCE,height:.05,
    width:WATER_PATCH_WIDTH,depth:WATER_PATCH_DEPTH,surfaceY:WATER_PATCH_SURFACE_Y
  });
  assert.deepEqual(state,original);
  assert.equal(waterPatchVisualSpec({...state,kind:'rock'}),undefined);
});
