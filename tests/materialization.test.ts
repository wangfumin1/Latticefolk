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
  assert.deepEqual(planFineChunk(chunk,24),planFineChunk(chunk,24));
});

test('settled chunks generate semantic roads, buildings, work sites and bounded residents',()=>{
  const plan=planFineChunk(chunk,24);
  assert.equal(plan.archetype,'market_hamlet');
  assert.ok(plan.roads.length>=2);
  assert.ok(plan.buildings.length>=2);
  assert.ok(plan.residents.length<=12);
  assert.ok(plan.residents.length<=Math.round(chunk.population));
  assert.ok(plan.objects.every(x=>x.state.chunkId===chunk.id));
  assert.ok(plan.objects.every(x=>(x.state.capabilities?.length||0)>0));
  const caps=new Set(plan.objects.flatMap(x=>x.state.capabilities||[]));
  assert.ok(caps.has('draw_water'));
  assert.ok(caps.has('harvest'));
  assert.ok(caps.has('trade'));
  assert.ok(caps.has('work'));
});

test('procedural nature avoids generated building footprints and roads',()=>{
  const plan=planFineChunk(chunk,24);
  const nature=plan.objects.filter(x=>['tree','bush','rock','flower'].includes(x.state.kind));
  for(const item of nature){
    const p=item.state.position;
    assert.ok(!plan.buildings.some(b=>Math.abs(p.x-b.x)<=b.w/2+.8&&Math.abs(p.z-b.z)<=b.d/2+.8));
    assert.ok(!plan.roads.some(r=>Math.abs(p.x-r.x)<=r.w/2+.7&&Math.abs(p.z-r.z)<=r.d/2+.7));
  }
});

test('biome and policy create distinct settlement archetypes',()=>{
  const timber=planFineChunk({...chunk,id:'chunk_8_8',cx:8,cz:8,biome:'forest',strategy:'extract_resources',prosperity:42},24);
  const quarry=planFineChunk({...chunk,id:'chunk_9_8',cx:9,cz:8,biome:'hills',strategy:'extract_resources',wood:32,prosperity:40},24);
  const refuge=planFineChunk({...chunk,id:'chunk_10_8',cx:10,cz:8,danger:82,strategy:'fortify'},24);
  assert.equal(timber.archetype,'timber_camp');
  assert.equal(quarry.archetype,'quarry_outpost');
  assert.equal(refuge.archetype,'refuge');
  assert.ok(quarry.objects.some(x=>x.state.tags.includes('mine')));
});


test('wetland wilderness exposes natural water for wildlife and player interaction',()=>{
  const wild={...chunk,id:'chunk_7_7',cx:7,cz:7,biome:'wetlands' as const,settlementLevel:0,population:0,water:88};
  const plan=planFineChunk(wild,24);
  const water=plan.objects.find(x=>x.state.kind==='water_patch');
  assert.ok(water);
  assert.ok(water!.state.tags.includes('water'));
  assert.ok(water!.state.capabilities?.includes('drink'));
});


test('fine materialization supports goat and wolf identities from coarse wildlife',()=>{
  const expanded:CoarseChunkState={
    ...chunk,id:'chunk_species_fine',cx:4,cz:4,biome:'hills',
    wildlife:[
      {species:'rabbit',count:4,carryingCapacity:8,health:80},
      {species:'deer',count:2,carryingCapacity:5,health:80},
      {species:'boar',count:2,carryingCapacity:4,health:80},
      {species:'goat',count:5,carryingCapacity:8,health:80},
      {species:'fox',count:1,carryingCapacity:3,health:80},
      {species:'wolf',count:2,carryingCapacity:3,health:80}
    ]
  };
  const plan=planFineChunk(expanded,24);
  assert.ok(plan.wildlife.some(animal=>animal.species==='goat'));
  assert.ok(plan.wildlife.some(animal=>animal.species==='wolf'));
  assert.ok(plan.wildlife.filter(animal=>animal.species==='wolf').length<=1);
});
