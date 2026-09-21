import test from 'node:test';
import assert from 'node:assert/strict';
import type { CoarseChunkState } from '../src/types.js';
import { applyWildlifeMigration, ensureWildlifePopulations, planWildlifeMigration, simulateWildlife, wildlifeCount } from '../src/world/ecology.js';

const chunk=(id:string,cx:number,patch:Partial<CoarseChunkState>={}):CoarseChunkState=>({
  id,cx,cz:0,biome:'plains',settlementLevel:0,population:0,food:70,wood:60,water:75,ecology:82,danger:12,prosperity:20,
  strategy:'sustain',migrationPolicy:'retain',ecologyPolicy:'balance',lastDecisionAt:0,decisionVersion:0,...patch
});

test('wildlife seeding is deterministic and bounded by habitat',()=>{
  const a=chunk('chunk_0_0',0),b=chunk('chunk_0_0',0);
  assert.deepEqual(ensureWildlifePopulations(a),ensureWildlifePopulations(b));
  assert.ok(wildlifeCount(a)>0);
  assert.ok(a.wildlife!.every(p=>p.count>=0&&p.carryingCapacity>=0&&p.health>=0&&p.health<=100));
});

test('coarse wildlife simulation updates populations without negative counts',()=>{
  const a=chunk('chunk_0_0',0);
  ensureWildlifePopulations(a);
  simulateWildlife(a,10,'clear');
  assert.ok(a.wildlife!.every(p=>p.count>=0&&Number.isFinite(p.count)));
});

test('wildlife migration conserves each species across neighbor chunks',()=>{
  const a=chunk('chunk_0_0',0,{biome:'forest'}),b=chunk('chunk_1_0',1,{biome:'dryland',ecology:28,food:28,water:24});
  ensureWildlifePopulations(a);ensureWildlifePopulations(b);
  for(const p of a.wildlife!)p.count=Math.max(3,p.carryingCapacity*1.1);
  for(const p of b.wildlife!)p.count=Math.max(0,p.carryingCapacity*.05);
  const before=new Map(a.wildlife!.map(p=>[p.species,p.count+(b.wildlife!.find(x=>x.species===p.species)?.count||0)]));
  const chunks=new Map([[a.id,a],[b.id,b]]);
  const moves=planWildlifeMigration(chunks.values(),new Set());
  assert.ok(moves.length>0);
  applyWildlifeMigration(chunks,moves);
  for(const species of before.keys()){
    const after=(a.wildlife!.find(x=>x.species===species)?.count||0)+(b.wildlife!.find(x=>x.species===species)?.count||0);
    assert.ok(Math.abs(after-before.get(species)!)<.002);
  }
});
