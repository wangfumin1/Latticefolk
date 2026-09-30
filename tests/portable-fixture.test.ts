import test from 'node:test';
import assert from 'node:assert/strict';
import { fineParcelFixture } from '../e2e/helpers/parcel-fixture.js';
import type { CoarseChunkState } from '../src/types.js';

const chunk: CoarseChunkState = {id:'chunk_2_0',cx:2,cz:0,biome:'plains',settlementLevel:0,population:6,
  food:50,wood:50,water:50,ecology:50,danger:0,prosperity:10,
  strategy:'sustain',migrationPolicy:'retain',ecologyPolicy:'balance',lastDecisionAt:0,decisionVersion:0};

test('parcel journey rejects the original start inside the actual tree_11 trunk without moving entities', async () => {
  const original=structuredClone(chunk);
  const fixture=await fineParcelFixture(chunk);
  assert.deepEqual(chunk,original,'setup planning must not mutate the saved input');
  assert.equal(fixture.rejected[0].id,'chunk_2_0_npc_00');
  assert.ok(fixture.rejected[0].staticHits.includes('object:chunk_2_0_tree_11'));
  assert.equal(fixture.donor.id,'chunk_2_0_npc_02');
  assert.equal(fixture.exitX,35.6);
  assert.deepEqual(fixture.start,{x:fixture.donor.x+.7,z:fixture.donor.z+1.8});
  assert.equal(fixture.treeColliders.length,8,'the complete original tree population is retained');
  const trunk=fixture.treeColliders.find(t=>t.id==='object:chunk_2_0_tree_11')!;
  assert.ok(Math.abs(trunk.minX-51.212301461406646)<1e-8);
  assert.ok(Math.abs(trunk.minZ-5.374386607465256)<1e-8);
});
