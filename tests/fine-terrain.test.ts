import test from 'node:test';
import assert from 'node:assert/strict';
import { fineTerrainSurfaceForChunk } from '../src/world/fineTerrain.js';
import { FinePhysicsAuthority } from '../src/world/finePhysics.js';

test('materialized chunk terrain matches the deterministic chunk footprint',()=>{
  const surface=fineTerrainSurfaceForChunk({id:'chunk_2_-1',cx:2,cz:-1},24);
  assert.deepEqual(surface,{
    id:'terrain:chunk_2_-1',chunkId:'chunk_2_-1',
    minX:36,maxX:60,minZ:-36,maxZ:-12,
    originX:48,originZ:-24,originY:0,slopeX:0,slopeZ:0
  });
});

test('chunk terrain descriptor registers into the same physics authority and sleeps with the chunk',()=>{
  const physics=new FinePhysicsAuthority();
  const surface=fineTerrainSurfaceForChunk({id:'chunk_0_0',cx:0,cz:0},24);
  physics.registerTerrain(surface);
  assert.equal(physics.groundContactAt(11.9,-11.9)?.surfaceId,'terrain:chunk_0_0');
  assert.equal(physics.groundContactAt(12.1,0),undefined);
  assert.equal(physics.stats().terrainSurfaces,1);
  physics.clearChunk('chunk_0_0');
  assert.equal(physics.groundContactAt(0,0),undefined);
  assert.equal(physics.stats().terrainSurfaces,0);
});
