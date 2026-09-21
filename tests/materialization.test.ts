import test from 'node:test';
import assert from 'node:assert/strict';
import type { CoarseChunkState } from '../src/types.js';
import { planFineChunk } from '../src/world/materialization.js';

const chunk:CoarseChunkState={
  id:'chunk_2_-1',cx:2,cz:-1,biome:'plains',settlementLevel:2,population:23,
  food:68,wood:57,water:71,ecology:73,danger:18,prosperity:66,
  strategy:'trade_route',migrationPolicy:'attract',ecologyPolicy:'balance',
  lastDecisionAt:0,decisionVersion:3
};

test('fine chunk planning is deterministic for a coarse chunk',()=>{
  const a=planFineChunk(chunk,24);
  const b=planFineChunk(chunk,24);
  assert.deepEqual(a,b);
});

test('materialized plans preserve chunk ownership and bounded representative population',()=>{
  const plan=planFineChunk(chunk,24);
  assert.equal(plan.chunkId,chunk.id);
  assert.ok(plan.buildings.length>=1);
  assert.ok(plan.objects.length>=1);
  assert.ok(plan.residents.length<=12);
  assert.ok(plan.residents.length<=Math.round(chunk.population));
  assert.ok(plan.objects.every(x=>x.state.chunkId===chunk.id));
  assert.ok(plan.residents.every(x=>x.id.startsWith(chunk.id)));
});

test('settled chunks expose water, food/trade and local work opportunities',()=>{
  const plan=planFineChunk(chunk,24);
  const caps=new Set(plan.objects.flatMap(x=>x.state.capabilities||[]));
  assert.ok(caps.has('draw_water'));
  assert.ok(caps.has('harvest'));
  assert.ok(caps.has('trade'));
  assert.ok(caps.has('work'));
});
