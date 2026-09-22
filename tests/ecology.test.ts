import test from 'node:test';
import assert from 'node:assert/strict';
import type { CoarseChunkState } from '../src/types.js';
import { applyWildlifeMigration, computeWildlifeNicheCompetition, ensurePlantBiomass, ensureWildlifePopulations, planWildlifeMigration, seasonForDay, simulatePlantBiomass, simulateWildlife, wildlifeCount } from '../src/world/ecology.js';

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


test('plant biomass is deterministic and seasons advance every 30 days',()=>{
  const a=chunk('chunk_plants',3,{biome:'forest',ecology:76,water:70});
  const b=chunk('chunk_plants',3,{biome:'forest',ecology:76,water:70});
  assert.deepEqual(ensurePlantBiomass(a),ensurePlantBiomass(b));
  assert.equal(seasonForDay(1),'spring');
  assert.equal(seasonForDay(31),'summer');
  assert.equal(seasonForDay(61),'autumn');
  assert.equal(seasonForDay(91),'winter');
});

test('plant biomass regenerates under favorable habitat and feeds carrying capacity',()=>{
  const a=chunk('chunk_regrow',4,{biome:'plains',ecology:90,water:90});
  const plants=ensurePlantBiomass(a);
  plants.grass=20;
  const before=plants.grass;
  simulatePlantBiomass(a,20,'rain',10);
  assert.ok(a.plants!.grass>before);
  ensureWildlifePopulations(a);
  assert.ok(a.wildlife!.find(x=>x.species==='rabbit')!.carryingCapacity>0);
});

test('crowding can create wildlife disease pressure without invalid state',()=>{
  const a=chunk('chunk_disease',5,{biome:'wetlands',ecology:76,water:92});
  ensureWildlifePopulations(a);
  for(const p of a.wildlife!){p.count=Math.max(2,p.carryingCapacity*1.4);p.diseaseLoad=4;}
  simulateWildlife(a,30,'rain',20);
  assert.ok(a.wildlife!.some(p=>(p.diseaseLoad||0)>4));
  assert.ok(a.wildlife!.every(p=>p.count>=0&&(p.diseaseLoad||0)>=0&&(p.diseaseLoad||0)<=100));
});


test('trophic flux records plant production, herbivory and predation as bounded recent rates',()=>{
  const a=chunk('chunk_flux',6,{biome:'plains',ecology:88,water:88,food:82});
  ensurePlantBiomass(a);ensureWildlifePopulations(a);
  const rabbits=a.wildlife!.find(x=>x.species==='rabbit')!;
  const foxes=a.wildlife!.find(x=>x.species==='fox')!;
  rabbits.count=Math.max(8,rabbits.carryingCapacity*.7);
  foxes.count=Math.max(2,foxes.carryingCapacity*.7);
  for(let i=0;i<8;i++)simulateWildlife(a,20,'rain',12);
  assert.ok(a.trophicFlux);
  assert.ok((a.trophicFlux?.primaryProduction||0)>=0);
  assert.ok((a.trophicFlux?.herbivory||0)>0);
  assert.ok((a.trophicFlux?.predation||0)>=0);
  assert.ok((a.trophicFlux?.mortalityReturn||0)>=0);
});


test('shared herbivore niches create deterministic competition pressure and reduce effective capacity',()=>{
  const a=chunk('chunk_compete',7,{biome:'forest',ecology:88,water:84,food:78});
  const populations=ensureWildlifePopulations(a);
  for(const p of populations)p.count=0;
  const rabbit=populations.find(p=>p.species==='rabbit')!;
  rabbit.count=8;
  computeWildlifeNicheCompetition(a,populations);
  const lowPressure=rabbit.competitionPressure||0;
  const lowCapacity=rabbit.carryingCapacity;

  const deer=populations.find(p=>p.species==='deer')!;
  const boar=populations.find(p=>p.species==='boar')!;
  deer.count=14;
  boar.count=10;
  computeWildlifeNicheCompetition(a,populations);

  assert.ok((rabbit.competitionPressure||0)>lowPressure);
  assert.ok(rabbit.carryingCapacity<lowCapacity);
  assert.ok((a.nicheCompetition?.strongestPair?.pressure||0)>0);
  assert.ok(a.nicheCompetition?.strongestPair?.speciesA);
  assert.ok(a.nicheCompetition?.strongestPair?.speciesB);
});

test('niche partitioning keeps fox competition lower than crowded plant consumers',()=>{
  const a=chunk('chunk_partition',8,{biome:'plains',ecology:90,water:88,food:82});
  const populations=ensureWildlifePopulations(a);
  for(const p of populations){
    if(p.species==='rabbit')p.count=30;
    else if(p.species==='deer')p.count=14;
    else if(p.species==='boar')p.count=11;
    else p.count=5;
  }
  const state=computeWildlifeNicheCompetition(a,populations);
  assert.ok(state.speciesPressure.rabbit>state.speciesPressure.fox);
  assert.ok(state.speciesPressure.deer>state.speciesPressure.fox);
  assert.ok(Object.values(state.speciesPressure).every(value=>value>=0&&value<=100));
  assert.ok(populations.every(p=>p.carryingCapacity>=0&&(p.competitionPressure||0)>=0&&(p.competitionPressure||0)<=100));
});

test('competition state remains valid through repeated ecology simulation',()=>{
  const a=chunk('chunk_competition_tick',9,{biome:'wetlands',ecology:84,water:94,food:76});
  ensureWildlifePopulations(a);
  for(let i=0;i<20;i++)simulateWildlife(a,20,i%3===0?'rain':'clear',25);
  assert.ok(a.nicheCompetition);
  assert.ok(Number.isFinite(a.nicheCompetition!.meanPressure));
  assert.ok(a.wildlife!.every(p=>Number.isFinite(p.carryingCapacity)&&Number.isFinite(p.competitionPressure||0)&&p.count>=0));
});
