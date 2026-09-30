import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { sourceGltf } from './helpers/source-gltf.js';
import { DROPPED_PARCEL_HEIGHT, DROPPED_PARCEL_SOURCE, droppedParcelSpec } from '../src/scene/droppedParcel.js';
import type { ItemKind, WorldObjectState } from '../src/types.js';

const kinds: ItemKind[] = ['apple','bread','wood','coin','flower','grain','flour','water','stone','plank','tool'];
test('dropped goods use the unchanged licensed parcel container, not generated payload geometry', async () => {
  const file = new URL(`../public/assets/${DROPPED_PARCEL_SOURCE}`,import.meta.url);
  const before = fs.readFileSync(file);
  const digest = createHash('sha256').update(before).digest('hex');
  const source = await sourceGltf(DROPPED_PARCEL_SOURCE);
  const original = new THREE.Box3().setFromObject(source.scene,true);
  assert.ok(original.max.y>original.min.y);
  for (const item of kinds) {
    const state: WorldObjectState = {id:`drop_${item}`,kind:'dropped_item',name:`Parcel: ${item}`,position:{x:48,z:0},tags:['dropped','parcel',item],usable:false,pickupable:true,item,resourceAmount:1};
    const spec = droppedParcelSpec(state)!;
    assert.equal(spec.asset,'crate_rts');
    assert.equal(spec.height,DROPPED_PARCEL_HEIGHT);
    const model = source.scene.clone(true);
    model.scale.multiplyScalar(spec.height/(original.max.y-original.min.y));
    model.updateMatrixWorld(true);
    const fit = new THREE.Box3().setFromObject(model,true), center = fit.getCenter(new THREE.Vector3());
    model.position.set(-center.x,-fit.min.y,-center.z);model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model,true);
    assert.ok(Math.abs(bounds.min.y)<1e-8);
    assert.ok(Math.abs(bounds.max.y-.4)<1e-8);
    assert.ok(bounds.max.x-bounds.min.x<.8&&bounds.max.z-bounds.min.z<.8);
    let meshes=0;
    model.traverse(child=>{
      const mesh=child as THREE.Mesh;if(!mesh.isMesh)return;meshes++;
      assert.ok(!['BoxGeometry','CylinderGeometry','ConeGeometry'].includes(mesh.geometry.type));
      assert.ok(mesh.geometry.getAttribute('position').count>0);
    });
    assert.ok(meshes>0);
    assert.equal(state.kind,'dropped_item');assert.equal(state.item,item);
  }
  assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'),digest);
  assert.equal(droppedParcelSpec({kind:'crate'} as WorldObjectState),undefined);
});
