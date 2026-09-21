import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CoarseWorldRuntime } from '../src/world/coarseWorld.js';

test('coarse world streams a fixed active window while retaining discovered chunks',()=>{
  const scene=new THREE.Scene();
  const world=new CoarseWorldRuntime(scene,'stream-test');
  const initial=world.status();
  assert.equal(initial.activeChunks,72);
  assert.equal(initial.chunks,72);

  const changed=world.ensureWindowAround(20*world.chunkSize,0);
  assert.equal(changed,true);
  const moved=world.status();
  assert.equal(moved.activeChunks,81);
  assert.ok(moved.chunks>initial.chunks);
  assert.equal(moved.activeCenter,'20,0');
  assert.ok(world.chunkAtWorld(20*world.chunkSize,0));

  const knownAfterMove=moved.chunks;
  assert.equal(world.ensureWindowAround(20*world.chunkSize+2,1),false);
  assert.equal(world.status().chunks,knownAfterMove);

  world.ensureWindowAround(0,0);
  assert.equal(world.status().activeChunks,72);
  assert.equal(world.status().chunks,knownAfterMove);
  assert.ok(world.chunks.has('chunk_20_0'));
});

test('restored distant chunks remain authoritative when their window is streamed back in',()=>{
  const scene=new THREE.Scene();
  const world=new CoarseWorldRuntime(scene,'stream-restore');
  const saved=world.ensureChunk(30,-12)!;
  saved.food=7;
  saved.strategy='conserve';
  const snapshot=structuredClone(saved);

  const fresh=new CoarseWorldRuntime(new THREE.Scene(),'stream-restore');
  fresh.restoreKnownChunks([snapshot]);
  fresh.ensureWindowAround(30*fresh.chunkSize,-12*fresh.chunkSize);
  const restored=fresh.chunkAtWorld(30*fresh.chunkSize,-12*fresh.chunkSize);
  assert.ok(restored);
  assert.equal(restored.food,7);
  assert.equal(restored.strategy,'conserve');
});

test('home chunks stay owned by the always-fine center town',()=>{
  const world=new CoarseWorldRuntime(new THREE.Scene(),'stream-home');
  assert.equal(world.chunkAtWorld(0,0),undefined);
  assert.equal(world.ensureChunk(1,-1),undefined);
});
