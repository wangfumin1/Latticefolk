import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import type { CoarseChunkState } from '../src/types.js';
import { CoarseChunkSpatialIndex } from '../src/world/coarseSpatialIndex.js';
import { CoarseWorldRuntime } from '../src/world/coarseWorld.js';

const chunk=(id:string,cx:number,cz:number):CoarseChunkState=>({
  id,cx,cz,biome:'plains',settlementLevel:0,population:1,food:50,wood:50,water:50,
  ecology:60,danger:10,prosperity:20,strategy:'sustain',migrationPolicy:'retain',
  ecologyPolicy:'balance',lastDecisionAt:0,decisionVersion:0
});

test('coarse spatial index replaces coordinates and follows id relocation deterministically',()=>{
  const index=new CoarseChunkSpatialIndex();
  const a=chunk('a',2,3);
  const b=chunk('b',2,3);
  index.upsert(a);
  assert.equal(index.get(2,3),a);
  index.upsert(b);
  assert.equal(index.get(2,3),b);
  assert.equal(index.size,1);

  const moved={...b,cx:4};
  index.upsert(moved);
  assert.equal(index.get(2,3),undefined);
  assert.equal(index.get(4,3),moved);
  assert.equal(index.size,1);
});

test('coarse runtime keeps the persistent coordinate index aligned with generated and restored chunks',()=>{
  const runtime=new CoarseWorldRuntime(new THREE.Scene(),'coarse-index-test');
  const generated=runtime.ensureChunk(20,21)!;
  assert.equal(runtime.chunkSpatialIndex.get(20,21),generated);

  const restored={...generated,food:7};
  runtime.restoreKnownChunks([restored]);
  assert.equal(runtime.chunks.get(restored.id)?.food,7);
  assert.equal(runtime.chunkSpatialIndex.get(20,21),runtime.chunks.get(restored.id));
  assert.equal(runtime.chunkSpatialIndex.size,runtime.chunks.size);
});
