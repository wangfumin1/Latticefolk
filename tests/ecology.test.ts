import test from 'node:test';
import assert from 'node:assert/strict';
import type { CoarseChunkState } from '../src/types.js';
import { applyWildlifeMigration, computeWildlifeDiseasePressure, computeWildlifeNicheCompetition, ensurePlantBiomass, ensureWildlifePopulations, planWildlifeMigration, seasonalHabitatSuitability, seasonForDay, simulatePlantBiomass, simulateWildlife, wildlifeCount, wildlifeDiseaseContactCoefficient } from '../src/world/ecology.js';

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


test('seasonal habitat suitability changes deterministically by species and biome',()=>{
  const forest=chunk('chunk_season_forest',10,{biome:'forest',ecology:82,food:74,water:72,danger:18});
  ensurePlantBiomass(forest);
  const deerSummer=seasonalHabitatSuitability(forest,'deer',31);
  const deerAutumn=seasonalHabitatSuitability(forest,'deer',61);
  assert.ok(deerAutumn>deerSummer);
  assert.equal(deerAutumn,seasonalHabitatSuitability(forest,'deer',61));
});

test('seasonal pull can reverse deer migration direction while conserving population',()=>{
  const forest=chunk('chunk_season_a',11,{biome:'forest',ecology:82,food:74,water:72,danger:18});
  const hills=chunk('chunk_season_b',12,{biome:'hills',ecology:82,food:74,water:72,danger:18});
  forest.plants={grass:70,shrub:70,fruit:70,crop:40};
  hills.plants={grass:70,shrub:70,fruit:70,crop:40};
  ensureWildlifePopulations(forest);ensureWildlifePopulations(hills);
  for(const species of ['rabbit','boar','fox'] as const){
    forest.wildlife!.find(p=>p.species===species)!.count=0;
    hills.wildlife!.find(p=>p.species===species)!.count=0;
  }
  const deerForest=forest.wildlife!.find(p=>p.species==='deer')!;
  const deerHills=hills.wildlife!.find(p=>p.species==='deer')!;
  deerForest.count=Math.min(deerForest.carryingCapacity*.55,8);
  deerHills.count=Math.min(deerHills.carryingCapacity*.55,8);
  deerForest.diseaseLoad=0;deerHills.diseaseLoad=0;

  const summer=planWildlifeMigration([forest,hills],new Set(),31).find(move=>move.species==='deer');
  const autumn=planWildlifeMigration([forest,hills],new Set(),61).find(move=>move.species==='deer');
  assert.ok(summer);
  assert.ok(autumn);
  assert.notEqual(summer!.fromChunkId,autumn!.fromChunkId);

  const totalBefore=deerForest.count+deerHills.count;
  applyWildlifeMigration(new Map([[forest.id,forest],[hills.id,hills]]),[autumn!]);
  const totalAfter=deerForest.count+deerHills.count;
  assert.ok(Math.abs(totalAfter-totalBefore)<.002);
});


test('wildlife disease pressure separates environmental, local and cross-species exposure',()=>{
  const a=chunk('chunk_disease_pressure',13,{biome:'wetlands',ecology:75,water:94});
  const populations=ensureWildlifePopulations(a);
  for(const pop of populations){
    pop.count=Math.max(2,pop.carryingCapacity*.8);
    pop.diseaseLoad=pop.species==='deer'?70:5;
    pop.importedDiseasePressure=0;
  }
  const pressure=computeWildlifeDiseasePressure(a,populations,'rain');
  assert.ok(pressure.environmentalPressure>0);
  assert.ok(pressure.crossSpeciesPressure.rabbit>0);
  assert.ok(pressure.speciesPressure.rabbit>pressure.localContactPressure.rabbit);
  assert.ok(pressure.strongestPair);
  assert.ok(Object.values(pressure.speciesPressure).every(value=>value>=0&&value<=100));
});

test('cross-species disease contact coefficients are bounded and preserve stronger same-species contact',()=>{
  assert.equal(wildlifeDiseaseContactCoefficient('rabbit','rabbit'),1);
  assert.ok(wildlifeDiseaseContactCoefficient('deer','rabbit')>0);
  assert.ok(wildlifeDiseaseContactCoefficient('deer','rabbit')<1);
  assert.ok(wildlifeDiseaseContactCoefficient('rabbit','fox')>0);
});

test('wildlife migration imports disease pressure without violating population conservation',()=>{
  const from=chunk('chunk_disease_from',14,{biome:'forest'});
  const to=chunk('chunk_disease_to',15,{biome:'plains'});
  ensureWildlifePopulations(from);ensureWildlifePopulations(to);
  const source=from.wildlife!.find(p=>p.species==='rabbit')!;
  const target=to.wildlife!.find(p=>p.species==='rabbit')!;
  source.count=Math.max(4,source.carryingCapacity*.5);
  target.count=Math.min(target.carryingCapacity*.2,2);
  source.diseaseLoad=80;
  target.diseaseLoad=2;
  target.importedDiseasePressure=0;
  const before=source.count+target.count;
  applyWildlifeMigration(new Map([[from.id,from],[to.id,to]]),[{species:'rabbit',fromChunkId:from.id,toChunkId:to.id,amount:.5}]);
  assert.ok((target.importedDiseasePressure||0)>0);
  assert.ok((target.diseaseLoad||0)>2);
  assert.ok(Math.abs(source.count+target.count-before)<.002);
});

test('coarse disease dynamics permit isolated cross-species amplification and bounded recovery',()=>{
  const a=chunk('chunk_disease_dynamics',16,{biome:'plains',ecology:82,water:70});
  const populations=ensureWildlifePopulations(a);
  for(const pop of populations){
    pop.count=['fox','wolf'].includes(pop.species)?0:Math.max(3,pop.carryingCapacity*.75);
    pop.diseaseLoad=pop.species==='deer'?85:1;
    pop.importedDiseasePressure=0;
  }
  const rabbit=populations.find(p=>p.species==='rabbit')!;
  const before=rabbit.diseaseLoad||0;
  simulateWildlife(a,5,'clear',45);
  assert.ok((rabbit.diseaseLoad||0)>before);

  for(const pop of populations){
    pop.count=pop.species==='rabbit'?1:0;
    pop.diseaseLoad=pop.species==='rabbit'?40:0;
    pop.importedDiseasePressure=0;
  }
  const recoveryBefore=rabbit.diseaseLoad||0;
  simulateWildlife(a,10,'clear',45);
  assert.ok((rabbit.diseaseLoad||0)<recoveryBefore);
  assert.ok(populations.every(p=>(p.diseaseLoad||0)>=0&&(p.diseaseLoad||0)<=100));
});


test('wildlife ecology seeds all configured species including goat and wolf',()=>{
  const a=chunk('chunk_species_expansion',17,{biome:'hills',ecology:86,water:70,food:72});
  const populations=ensureWildlifePopulations(a);
  assert.deepEqual(populations.map(p=>p.species),['rabbit','deer','boar','goat','fox','wolf']);
  const goat=populations.find(p=>p.species==='goat')!;
  const wolf=populations.find(p=>p.species==='wolf')!;
  assert.ok(goat.carryingCapacity>0);
  assert.ok(wolf.carryingCapacity>0);
});

test('wolf participates in coarse predation without creating or negative prey populations',()=>{
  const a=chunk('chunk_wolf_predation',18,{biome:'forest',ecology:90,water:78,food:76});
  const populations=ensureWildlifePopulations(a);
  for(const pop of populations){
    pop.count=0;
    pop.diseaseLoad=0;
  }
  const goat=populations.find(p=>p.species==='goat')!;
  const deer=populations.find(p=>p.species==='deer')!;
  const wolf=populations.find(p=>p.species==='wolf')!;
  goat.count=Math.max(4,goat.carryingCapacity*.7);
  deer.count=Math.max(4,deer.carryingCapacity*.7);
  wolf.count=Math.max(2,wolf.carryingCapacity*.7);
  const preyBefore=goat.count+deer.count;
  for(let i=0;i<6;i++)simulateWildlife(a,20,'clear',75);
  const preyAfter=goat.count+deer.count;
  assert.ok((a.trophicFlux?.predation||0)>0);
  assert.ok(preyAfter<preyBefore);
  assert.ok(populations.every(pop=>pop.count>=0));
});
