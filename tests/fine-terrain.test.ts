import test from 'node:test';
import assert from 'node:assert/strict';
import { fineTerrainSurfaceForChunk, homeTerrainSurface, registerFineTerrainForChunk, registerHomeTerrain } from '../src/world/fineTerrain.js';
import { FinePhysicsAuthority } from '../src/world/finePhysics.js';

test('home terrain matches the authored town footprint and is not chunk-scoped',()=>{
  const surface=homeTerrainSurface(72);
  assert.deepEqual(surface,{
    id:'terrain:home',minX:-36,maxX:36,minZ:-36,maxZ:36,
    originX:0,originZ:0,originY:0,slopeX:0,slopeZ:0
  });
  const physics=new FinePhysicsAuthority();
  registerHomeTerrain(physics,72);
  assert.equal(physics.groundContactAt(35.9,-35.9)?.surfaceId,'terrain:home');
  assert.equal(physics.groundContactAt(36.1,0),undefined);
  physics.clearChunk('chunk_0_0');
  assert.equal(physics.groundContactAt(0,0)?.surfaceId,'terrain:home');
});

test('materialized chunk terrain matches the deterministic chunk footprint',()=>{
  const surface=fineTerrainSurfaceForChunk({id:'chunk_2_-1',cx:2,cz:-1},24);
  assert.deepEqual(surface,{
    id:'terrain:chunk_2_-1',chunkId:'chunk_2_-1',
    minX:36,maxX:60,minZ:-36,maxZ:-12,
    originX:48,originZ:-24,originY:0,slopeX:0,slopeZ:0
  });
});

test('materialization registers chunk terrain into the same physics authority and teardown sleeps it',()=>{
  const physics=new FinePhysicsAuthority();
  const surface=registerFineTerrainForChunk(physics,{id:'chunk_0_0',cx:0,cz:0},24);
  assert.equal(surface.id,'terrain:chunk_0_0');
  assert.equal(physics.groundContactAt(11.9,-11.9)?.surfaceId,'terrain:chunk_0_0');
  assert.equal(physics.groundContactAt(12.1,0),undefined);
  assert.equal(physics.stats().terrainSurfaces,1);
  physics.clearChunk('chunk_0_0');
  assert.equal(physics.groundContactAt(0,0),undefined);
  assert.equal(physics.stats().terrainSurfaces,0);
});

test('registered materialized terrain is consumed by kinematic movement ground authority',()=>{
  const physics=new FinePhysicsAuthority();
  registerFineTerrainForChunk(physics,{id:'chunk_0_0',cx:0,cz:0},24);
  const result=physics.moveKinematic({
    id:'npc:test',position:{x:0,z:0},displacement:{x:2,z:1},radius:.3
  });
  assert.ok(Math.abs(result.position.x-2)<1e-9);
  assert.ok(Math.abs(result.position.z-1)<1e-9);
  assert.equal(result.ground?.surfaceId,'terrain:chunk_0_0');
  assert.equal(result.ground?.height,0);
  assert.deepEqual(result.terrainHits,[]);
});
