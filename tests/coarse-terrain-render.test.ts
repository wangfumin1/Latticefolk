import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CoarseWorldRuntime } from '../src/world/coarseWorld.js';
import { FinePhysicsAuthority } from '../src/world/finePhysics.js';
import { registerFineTerrainForChunk, registerHomeTerrain } from '../src/world/fineTerrain.js';

function fixture() {
  const scene = new THREE.Scene();
  const world = new CoarseWorldRuntime(scene, 'terrain-render-contract');
  const root = scene.getObjectByName('coarse-world');
  assert.ok(root);
  const tile = (id:string) => {
    const mesh=root.children.find(child=>child instanceof THREE.Mesh&&child.userData.coarseChunkId===id);
    assert.ok(mesh instanceof THREE.Mesh,`missing actual ground mesh: ${id}`);
    return mesh;
  };
  return {scene,world,root,tile};
}
const bounds=(object:THREE.Object3D)=>new THREE.Box3().setFromObject(object);
const close=(a:number,b:number,label:string)=>assert.ok(Math.abs(a-b)<1e-6,`${label}: actual=${a}, expected=${b}`);

test('real Three ground tiles meet the authored home footprint on all four edges',()=>{
  const {tile}=fixture();
  close(bounds(tile('chunk_2_0')).min.x,36,'east');
  close(bounds(tile('chunk_-2_0')).max.x,-36,'west');
  close(bounds(tile('chunk_0_2')).min.z,36,'south');
  close(bounds(tile('chunk_0_-2')).max.z,-36,'north');
});
test('adjacent rendered chunk bounds touch without gaps or positive-area overlap',()=>{
  const {tile}=fixture();
  for(const [a,b] of [['chunk_2_0','chunk_3_0'],['chunk_-3_0','chunk_-2_0']])
    close(bounds(tile(a)).max.x,bounds(tile(b)).min.x,`${a} to ${b}`);
  for(const [a,b] of [['chunk_0_2','chunk_0_3'],['chunk_0_-3','chunk_0_-2']])
    close(bounds(tile(a)).max.z,bounds(tile(b)).min.z,`${a} to ${b}`);
});
test('real Three raycasts hit ground throughout both home/chunk and chunk/chunk seam neighborhoods',()=>{
  const {root}=fixture();
  root.updateMatrixWorld(true);
  const ray=new THREE.Raycaster();
  const meshes=root.children.filter(child=>child instanceof THREE.Mesh);
  for(const [x,z] of [[36.01,0],[36.1,0],[36.174,0],[59.9,0],[60,0],[60.1,0],[-36.1,0],[0,36.1],[0,-36.1],[0,60]]) {
    ray.set(new THREE.Vector3(x,5,z),new THREE.Vector3(0,-1,0));
    const hits=ray.intersectObjects(meshes,false);
    assert.ok(hits.length>0,`rendered ground missing at ${x},${z}`);
    close(hits[0].point.y,0,`raycast ground at ${x},${z}`);
  }
});
test('actual rendered top equals the authoritative physical height before and after materialization',()=>{
  const {world,tile}=fixture();
  const physics=new FinePhysicsAuthority();
  registerHomeTerrain(physics,72);
  for(const id of ['chunk_2_0','chunk_3_0','chunk_-2_0','chunk_0_-2']) {
    const chunk=world.chunks.get(id)!;
    const terrain=registerFineTerrainForChunk(physics,chunk,world.chunkSize);
    for(const materialized of [false,true,false]) {
      world.setMaterialized(id,materialized);
      assert.equal(tile(id).visible,true);
      const b=bounds(tile(id));
      close(b.min.x,terrain.minX,`${id} minX`);
      close(b.max.x,terrain.maxX,`${id} maxX`);
      close(b.min.z,terrain.minZ,`${id} minZ`);
      close(b.max.z,terrain.maxZ,`${id} maxZ`);
      close(b.max.y,physics.groundContactAt(terrain.originX,terrain.originZ)!.height,`${id} top`);
    }
  }
});
test('stream away/revisit disposes old ground once and recreates aligned geometry without mutating known chunk state',()=>{
  const {world,tile}=fixture();
  const old=tile('chunk_2_0');
  let geometryDisposals=0,materialDisposals=0;
  old.geometry.addEventListener('dispose',()=>geometryDisposals++);
  const material=old.material as THREE.Material;
  material.addEventListener('dispose',()=>materialDisposals++);
  const chunk=world.chunks.get('chunk_2_0')!;
  const saved=JSON.stringify(chunk);
  world.ensureWindowAround(20*world.chunkSize,0);
  assert.equal(old.parent,null);
  assert.equal(geometryDisposals,1);
  assert.equal(materialDisposals,1);
  world.ensureWindowAround(20*world.chunkSize+1,0);
  assert.equal(geometryDisposals,1);
  world.ensureWindowAround(0,0);
  const fresh=tile('chunk_2_0');
  assert.notEqual(fresh,old);
  close(bounds(fresh).min.x,36,'revisit boundary');
  close(bounds(fresh).max.y,0,'revisit top');
  assert.equal(JSON.stringify(chunk),saved);
});
