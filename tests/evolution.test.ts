import test from 'node:test';
import assert from 'node:assert/strict';
import { accumulateWildlifeHabitatExposure, computeEvolutionStatistics, dominantWildlifeExposureBiome, lineageAncestors } from '../src/world/evolution.js';
import type { WildlifeLineageRecord, WildlifeTraits } from '../src/types.js';

const traits=(wariness:number,size=1):WildlifeTraits=>({speed:1.5+wariness,size,fertility:.7,wariness});

const records:WildlifeLineageRecord[]=[
  {
    entityId:'r0f',species:'rabbit',birthDay:1,deathDay:120,deathReason:'predation',generation:0,
    birthChunk:'chunk_0_0',deathChunk:'chunk_0_0',traitsAtBirth:traits(.20),traitsAtDeath:traits(.20),origin:'founder',
    offspringCount:2,reproductiveSuccess:true
  },
  {
    entityId:'r0m',species:'rabbit',birthDay:2,deathDay:180,deathReason:'senescence',generation:0,
    birthChunk:'chunk_0_0',deathChunk:'chunk_0_0',traitsAtBirth:traits(.25),traitsAtDeath:traits(.25),origin:'founder',
    offspringCount:2,reproductiveSuccess:true
  },
  {
    entityId:'r1a',species:'rabbit',motherId:'r0f',fatherId:'r0m',birthDay:40,deathDay:130,deathReason:'disease',generation:1,
    birthChunk:'chunk_0_0',deathChunk:'chunk_0_1',traitsAtBirth:traits(.50,1.1),traitsAtDeath:traits(.50,1.1),origin:'reproduction',
    offspringCount:1,reproductiveSuccess:true
  },
  {
    entityId:'r2a',species:'rabbit',motherId:'r1a',birthDay:90,generation:2,
    birthChunk:'chunk_0_1',traitsAtBirth:traits(.80,1.2),origin:'reproduction',offspringCount:0,reproductiveSuccess:false
  }
];

test('evolution statistics combine living and dead generations with measurable trait trends',()=>{
  const rabbit=computeEvolutionStatistics(records).find(entry=>entry.species==='rabbit')!;
  assert.equal(rabbit.livingPopulation,1);
  assert.equal(rabbit.historicalPopulation,4);
  assert.equal(rabbit.births,2);
  assert.equal(rabbit.deaths,3);
  assert.equal(rabbit.generationMax,2);
  assert.equal(rabbit.mortality.predation,1);
  assert.equal(rabbit.mortality.disease,1);
  assert.equal(rabbit.mortality.senescence,1);
  assert.ok(rabbit.lifespanMean>0);
  assert.ok(rabbit.traitVariance.wariness>0);
  assert.ok(rabbit.traitTrendPerGeneration.wariness>0);
  assert.equal(rabbit.cohorts.length,3);
  assert.equal(rabbit.cohorts[2]?.living,1);
  assert.equal(rabbit.survivalToReproductionRate,.75);
});

test('lineageAncestors walks durable ancestry without duplicating shared ancestors',()=>{
  const map=new Map(records.map(record=>[record.entityId,record]));
  const ancestors=lineageAncestors(map,'r2a',3);
  assert.deepEqual(ancestors.map(record=>record.entityId),['r1a','r0f','r0m']);
});


test('biome selection statistics expose persistent breeder trait differentials without claiming causality',()=>{
  const forest=(generation:number,index:number,wariness:number,offspringCount:number):WildlifeLineageRecord=>({
    entityId:`forest_g${generation}_${index}`,
    species:'rabbit',
    birthDay:generation*20+index,
    generation,
    birthChunk:`chunk_forest_${generation}`,
    traitsAtBirth:traits(wariness,1+generation*.02),
    birthHabitat:{biome:'forest',ecology:82,food:70,water:68,danger:55,settlementLevel:1,plantBiomass:74},
    origin:generation===0?'founder':'reproduction',
    offspringCount,
    reproductiveSuccess:offspringCount>0
  });
  const selectionRecords:WildlifeLineageRecord[]=[
    forest(0,0,.20,0),forest(0,1,.40,0),forest(0,2,.70,2),
    forest(1,0,.30,0),forest(1,1,.50,0),forest(1,2,.80,2),
    forest(2,0,.40,0),forest(2,1,.60,0),forest(2,2,.90,2)
  ];
  const rabbit=computeEvolutionStatistics(selectionRecords).find(entry=>entry.species==='rabbit')!;
  const forestStats=rabbit.biomeSelection.find(entry=>entry.biome==='forest')!;
  assert.equal(forestStats.population,9);
  assert.equal(forestStats.breeders,3);
  assert.equal(forestStats.generationsObserved,3);
  assert.ok(forestStats.selectionDifferential.wariness>0);
  assert.ok(forestStats.normalizedSelectionDifferential.wariness>.2);
  assert.equal(forestStats.selectionConsistency.wariness,1);
  assert.equal(forestStats.comparableSelectionGenerations.wariness,3);
  assert.equal(forestStats.signal.wariness,'persistent');
  assert.ok(forestStats.traitTrendPerGeneration.wariness>0);
  assert.equal(forestStats.habitatMean.ecology,82);
});


test('persistent selection signal requires repeated comparable generations and aligned realized trait trend',()=>{
  const habitat={biome:'plains' as const,ecology:70,food:70,water:70,danger:30,settlementLevel:0,plantBiomass:70};
  const sample:WildlifeLineageRecord[]=[
    {entityId:'g0a',species:'rabbit',birthDay:1,generation:0,birthChunk:'a',traitsAtBirth:traits(.2),birthHabitat:habitat,origin:'founder',offspringCount:0,reproductiveSuccess:false},
    {entityId:'g0b',species:'rabbit',birthDay:1,generation:0,birthChunk:'a',traitsAtBirth:traits(.8),birthHabitat:habitat,origin:'founder',offspringCount:2,reproductiveSuccess:true},
    {entityId:'g1a',species:'rabbit',birthDay:2,generation:1,birthChunk:'a',traitsAtBirth:traits(.15),birthHabitat:habitat,origin:'reproduction',offspringCount:0,reproductiveSuccess:false},
    {entityId:'g1b',species:'rabbit',birthDay:2,generation:1,birthChunk:'a',traitsAtBirth:traits(.75),birthHabitat:habitat,origin:'reproduction',offspringCount:2,reproductiveSuccess:true},
    {entityId:'g2a',species:'rabbit',birthDay:3,generation:2,birthChunk:'a',traitsAtBirth:traits(.10),birthHabitat:habitat,origin:'reproduction',offspringCount:0,reproductiveSuccess:false},
    {entityId:'g2b',species:'rabbit',birthDay:3,generation:2,birthChunk:'a',traitsAtBirth:traits(.70),birthHabitat:habitat,origin:'reproduction',offspringCount:2,reproductiveSuccess:true}
  ];
  const stats=computeEvolutionStatistics(sample).find(entry=>entry.species==='rabbit')!.biomeSelection[0]!;
  assert.ok(stats.normalizedSelectionDifferential.wariness>0);
  assert.equal(stats.selectionConsistency.wariness,1);
  assert.equal(stats.comparableSelectionGenerations.wariness,3);
  assert.ok(stats.traitTrendPerGeneration.wariness<0);
  assert.equal(stats.signal.wariness,'weak');
});


test('lifetime habitat exposure accumulates only observed time with weighted habitat means and transitions',()=>{
  const forest={biome:'forest' as const,ecology:80,food:60,water:70,danger:30,settlementLevel:1,plantBiomass:75};
  const wetlands={biome:'wetlands' as const,ecology:90,food:72,water:95,danger:44,settlementLevel:0,plantBiomass:88};
  let exposure=accumulateWildlifeHabitatExposure(undefined,forest,'chunk_forest',2);
  exposure=accumulateWildlifeHabitatExposure(exposure,wetlands,'chunk_wetlands',1);
  assert.equal(exposure.observedDays,3);
  assert.equal(exposure.biomeDays.forest,2);
  assert.equal(exposure.biomeDays.wetlands,1);
  assert.equal(exposure.chunkDays.chunk_forest,2);
  assert.equal(exposure.chunkDays.chunk_wetlands,1);
  assert.equal(exposure.observedTransitions,1);
  assert.equal(exposure.habitatMean.ecology,(80*2+90)/3);
  assert.equal(exposure.habitatMean.water,(70*2+95)/3);
  assert.equal(dominantWildlifeExposureBiome(exposure),'forest');
});

test('lifetime biome selection groups by observed exposure rather than only birth biome',()=>{
  const plains={biome:'plains' as const,ecology:60,food:65,water:55,danger:20,settlementLevel:1,plantBiomass:58};
  const forest={biome:'forest' as const,ecology:85,food:72,water:68,danger:48,settlementLevel:0,plantBiomass:80};
  const sample:WildlifeLineageRecord[]=[];
  for(let generation=0;generation<3;generation++){
    for(let index=0;index<3;index++){
      const wariness=.25+generation*.1+index*.2;
      const breeder=index===2;
      let exposure=accumulateWildlifeHabitatExposure(undefined,forest,'forest_core',.2+generation*.02);
      exposure.lastObservedDay=undefined;
      sample.push({
        entityId:`migrant_g${generation}_${index}`,species:'rabbit',birthDay:1+generation*10+index,generation,
        birthChunk:'plains_birth',traitsAtBirth:traits(wariness),birthHabitat:plains,
        habitatExposure:exposure,origin:generation===0?'founder':'reproduction',
        offspringCount:breeder?2:0,reproductiveSuccess:breeder
      });
    }
  }
  const rabbit=computeEvolutionStatistics(sample).find(entry=>entry.species==='rabbit')!;
  assert.equal(rabbit.biomeSelection[0]?.basis,'origin');
  assert.equal(rabbit.biomeSelection[0]?.biome,'plains');
  assert.equal(rabbit.lifetimeBiomeSelection[0]?.basis,'lifetime');
  assert.equal(rabbit.lifetimeBiomeSelection[0]?.biome,'forest');
  assert.equal(rabbit.lifetimeBiomeSelection[0]?.population,9);
  assert.ok((rabbit.lifetimeBiomeSelection[0]?.observedExposureDaysMean||0)>.2);
});


test('lifetime habitat exposure preserves time-weighted niche competition pressure',()=>{
  const forest={biome:'forest' as const,ecology:80,food:65,water:70,danger:25,settlementLevel:1,plantBiomass:72,competitionPressure:20};
  const crowded={...forest,competitionPressure:80};
  let exposure=accumulateWildlifeHabitatExposure(undefined,forest,'chunk_a',1);
  exposure=accumulateWildlifeHabitatExposure(exposure,crowded,'chunk_a',3);
  assert.equal(exposure.observedDays,4);
  assert.equal(exposure.habitatMean.competitionPressure,65);
});


test('lifetime habitat exposure preserves time-weighted disease transmission pressure',()=>{
  const calm={biome:'forest' as const,ecology:80,food:65,water:70,danger:25,settlementLevel:1,plantBiomass:72,competitionPressure:20,seasonalSuitability:75,diseasePressure:10};
  const outbreak={...calm,diseasePressure:70};
  let exposure=accumulateWildlifeHabitatExposure(undefined,calm,'chunk_a',1);
  exposure=accumulateWildlifeHabitatExposure(exposure,outbreak,'chunk_a',3);
  assert.equal(exposure.observedDays,4);
  assert.equal(exposure.habitatMean.diseasePressure,55);
});
