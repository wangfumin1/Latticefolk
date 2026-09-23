import test from 'node:test';
import assert from 'node:assert/strict';
import { accumulateWildlifeHabitatExposure, computeEvolutionStatistics, computeWildlifeInteractionSelectionEvidence, dominantWildlifeExposureBiome, lineageAncestors } from '../src/world/evolution.js';
import type { WildlifeLineageRecord, WildlifePhenotype, WildlifeTraits } from '../src/types.js';

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


test('fitness-by-habitat quantifies outcome associations across exposure bands',()=>{
  const sample:WildlifeLineageRecord[]=[
    [10,3,120],[20,2,110],[25,1,100],
    [40,1,90],[50,0,80],[60,0,70],
    [75,0,60],[85,0,50],[90,0,40]
  ].map(([disease,offspring,lifespan],index)=>{
    const habitat={
      biome:'forest' as const,ecology:78,food:68,water:72,danger:24,settlementLevel:1,plantBiomass:70,
      competitionPressure:42,seasonalSuitability:74,diseasePressure:disease!
    };
    const exposure=accumulateWildlifeHabitatExposure(undefined,habitat,'fitness_forest',1);
    exposure.lastObservedDay=undefined;
    return {
      entityId:`fitness_${index}`,species:'rabbit' as const,birthDay:1,generation:Math.floor(index/3),
      deathDay:1+lifespan!,deathReason:'senescence' as const,birthChunk:'fitness_forest',
      traitsAtBirth:traits(.2+index*.04,1+index*.01),birthHabitat:habitat,habitatExposure:exposure,
      origin:index<3?'founder' as const:'reproduction' as const,
      offspringCount:offspring!,reproductiveSuccess:offspring!>0
    };
  });
  const rabbit=computeEvolutionStatistics(sample).find(entry=>entry.species==='rabbit')!;
  const disease=rabbit.exposureFitness.find(entry=>entry.dimension==='diseasePressure')!;
  assert.equal(disease.sampleSize,9);
  assert.notEqual(disease.reproductionAssociation,null);
  assert.notEqual(disease.offspringAssociation,null);
  assert.notEqual(disease.lifespanAssociation,null);
  assert.notEqual(disease.breederExposureMean,null);
  assert.notEqual(disease.nonBreederExposureMean,null);
  assert.ok(disease.reproductionAssociation!<0);
  assert.ok(disease.offspringAssociation!<0);
  assert.ok(disease.lifespanAssociation!<0);
  assert.equal(disease.bands.find(band=>band.band==='low')?.population,3);
  assert.equal(disease.bands.find(band=>band.band==='low')?.breederRate,1);
  assert.equal(disease.bands.find(band=>band.band==='high')?.breederRate,0);
  assert.ok(disease.breederExposureMean!<disease.nonBreederExposureMean!);
});


test('fitness-by-habitat right-censors living juveniles but keeps juvenile deaths as completed outcomes',()=>{
  const habitat=(diseasePressure:number)=>({
    biome:'forest' as const,ecology:80,food:70,water:72,danger:20,settlementLevel:0,plantBiomass:74,
    competitionPressure:20,seasonalSuitability:78,diseasePressure
  });
  const exposure=(pressure:number)=>{
    const result=accumulateWildlifeHabitatExposure(undefined,habitat(pressure),'fitness_censor',1);
    result.lastObservedDay=undefined;
    return result;
  };
  const sample:WildlifeLineageRecord[]=[
    {
      entityId:'adult_breeder',species:'rabbit',birthDay:1,generation:0,birthChunk:'fitness_censor',
      traitsAtBirth:traits(.5),birthHabitat:habitat(10),habitatExposure:exposure(10),
      origin:'founder',offspringCount:2,reproductiveSuccess:true
    },
    {
      entityId:'adult_nonbreeder',species:'rabbit',birthDay:1,generation:0,birthChunk:'fitness_censor',
      traitsAtBirth:traits(.5),birthHabitat:habitat(80),habitatExposure:exposure(80),
      origin:'founder',offspringCount:0,reproductiveSuccess:false
    },
    {
      entityId:'living_juvenile',species:'rabbit',birthDay:150,generation:1,birthChunk:'fitness_censor',
      traitsAtBirth:traits(.5),birthHabitat:habitat(95),habitatExposure:exposure(95),
      origin:'reproduction',offspringCount:0,reproductiveSuccess:false
    },
    {
      entityId:'dead_juvenile',species:'rabbit',birthDay:150,deathDay:170,deathReason:'disease',generation:1,birthChunk:'fitness_censor',
      traitsAtBirth:traits(.5),birthHabitat:habitat(90),habitatExposure:exposure(90),
      origin:'reproduction',offspringCount:0,reproductiveSuccess:false
    }
  ];
  const disease=computeEvolutionStatistics(sample,200).find(entry=>entry.species==='rabbit')!
    .exposureFitness.find(entry=>entry.dimension==='diseasePressure')!;
  assert.equal(disease.sampleSize,4);
  assert.equal(disease.reproductionEligibleSamples,3);
  assert.equal(disease.lifespanSamples,1);
  assert.equal(disease.bands.find(band=>band.band==='high')?.population,3);
  assert.equal(disease.bands.find(band=>band.band==='high')?.eligiblePopulation,2);
});

test('fitness associations report missing evidence instead of zero when outcome variance is absent',()=>{
  const habitat={
    biome:'plains' as const,ecology:80,food:70,water:72,danger:20,settlementLevel:0,plantBiomass:74,
    competitionPressure:20,seasonalSuitability:78,diseasePressure:15
  };
  const sample:WildlifeLineageRecord[]=[0,1,2].map(index=>{
    const exposure=accumulateWildlifeHabitatExposure(undefined,{...habitat,diseasePressure:10+index*10},'fitness_null',1);
    exposure.lastObservedDay=undefined;
    return {
      entityId:`null_${index}`,species:'rabbit' as const,birthDay:1,generation:0,birthChunk:'fitness_null',
      traitsAtBirth:traits(.5),birthHabitat:habitat,habitatExposure:exposure,
      origin:'founder' as const,offspringCount:0,reproductiveSuccess:false
    };
  });
  const disease=computeEvolutionStatistics(sample,200).find(entry=>entry.species==='rabbit')!
    .exposureFitness.find(entry=>entry.dimension==='diseasePressure')!;
  assert.equal(disease.reproductionEligibleSamples,3);
  assert.equal(disease.reproductionAssociation,null);
  assert.equal(disease.offspringAssociation,null);
});


test('evolution statistics include all newly configured wildlife species',()=>{
  const stats=computeEvolutionStatistics([]);
  assert.ok(stats.some(entry=>entry.species==='goat'));
  assert.ok(stats.some(entry=>entry.species==='wolf'));
  assert.ok(stats.some(entry=>entry.species==='badger'));
});


test('lifetime habitat exposure preserves time-weighted predator pressure',()=>{
  const safe={biome:'hills' as const,ecology:80,food:66,water:68,danger:22,settlementLevel:0,plantBiomass:70,competitionPressure:24,seasonalSuitability:76,diseasePressure:8,predatorPressure:10};
  const hunted={...safe,predatorPressure:70};
  let exposure=accumulateWildlifeHabitatExposure(undefined,safe,'chunk_safe',1);
  exposure=accumulateWildlifeHabitatExposure(exposure,hunted,'chunk_hunted',3);
  assert.equal(exposure.observedDays,4);
  assert.equal(exposure.habitatMean.predatorPressure,55);
});

test('fitness-by-habitat quantifies predator-pressure associations without causal labeling',()=>{
  const sample:WildlifeLineageRecord[]=[
    [8,3,130],[18,2,120],[28,1,110],
    [42,1,95],[52,0,85],[62,0,75],
    [74,0,65],[84,0,55],[94,0,45]
  ].map(([pressure,offspring,lifespan],index)=>{
    const habitat={
      biome:'hills' as const,ecology:78,food:68,water:70,danger:25,settlementLevel:0,plantBiomass:69,
      competitionPressure:35,seasonalSuitability:78,diseasePressure:12,predatorPressure:pressure!
    };
    const exposure=accumulateWildlifeHabitatExposure(undefined,habitat,'predator_fitness',1);
    exposure.lastObservedDay=undefined;
    return {
      entityId:`predator_fit_${index}`,species:'goat' as const,birthDay:1,generation:Math.floor(index/3),
      deathDay:1+lifespan!,deathReason:'predation' as const,birthChunk:'predator_fitness',
      traitsAtBirth:traits(.3+index*.05,.8+index*.02),birthHabitat:habitat,habitatExposure:exposure,
      origin:index<3?'founder' as const:'reproduction' as const,
      offspringCount:offspring!,reproductiveSuccess:offspring!>0
    };
  });
  const goat=computeEvolutionStatistics(sample).find(entry=>entry.species==='goat')!;
  const predator=goat.exposureFitness.find(entry=>entry.dimension==='predatorPressure')!;
  assert.equal(predator.sampleSize,9);
  assert.notEqual(predator.reproductionAssociation,null);
  assert.notEqual(predator.offspringAssociation,null);
  assert.notEqual(predator.lifespanAssociation,null);
  assert.ok(predator.reproductionAssociation!<0);
  assert.ok(predator.offspringAssociation!<0);
  assert.ok(predator.lifespanAssociation!<0);
  assert.equal(predator.bands.find(band=>band.band==='low')?.population,3);
  assert.equal(predator.bands.find(band=>band.band==='high')?.breederRate,0);
});


test('predator-source exposure excludes legacy unknown days from source means',()=>{
  const habitat={biome:'forest' as const,ecology:80,food:68,water:70,danger:24,settlementLevel:0,plantBiomass:72,competitionPressure:20,seasonalSuitability:76,diseasePressure:8,predatorPressure:30};
  let exposure=accumulateWildlifeHabitatExposure(undefined,habitat,'legacy_chunk',2);
  exposure=accumulateWildlifeHabitatExposure(exposure,habitat,'source_chunk',1,{fox:20,wolf:0});
  exposure=accumulateWildlifeHabitatExposure(exposure,habitat,'source_chunk',3,{fox:80,wolf:40});
  assert.equal(exposure.observedDays,6);
  assert.equal(exposure.predatorSourceObservedDays,4);
  assert.equal(exposure.predatorSourceMean?.fox,65);
  assert.equal(exposure.predatorSourceMean?.wolf,30);
});

test('predator specialization separates fox pressure from zero wolf exposure',()=>{
  const sample:WildlifeLineageRecord[]=[
    [8,3,130],[18,2,120],[28,1,110],
    [42,1,95],[52,0,85],[62,0,75],
    [74,0,65],[84,0,55],[94,0,45]
  ].map(([foxPressure,offspring,lifespan],index)=>{
    const habitat={
      biome:'plains' as const,ecology:78,food:70,water:68,danger:24,settlementLevel:0,plantBiomass:70,
      competitionPressure:30,seasonalSuitability:75,diseasePressure:10,predatorPressure:foxPressure!
    };
    const exposure=accumulateWildlifeHabitatExposure(undefined,habitat,'predator_source_fitness',1,{fox:foxPressure!,wolf:0});
    exposure.lastObservedDay=undefined;
    return {
      entityId:`predator_source_${index}`,species:'rabbit' as const,birthDay:1,generation:Math.floor(index/3),
      deathDay:1+lifespan!,deathReason:'predation' as const,birthChunk:'predator_source_fitness',
      traitsAtBirth:traits(.25+index*.05,.55+index*.01),birthHabitat:habitat,habitatExposure:exposure,
      origin:index<3?'founder' as const:'reproduction' as const,
      offspringCount:offspring!,reproductiveSuccess:offspring!>0
    };
  });
  const rabbit=computeEvolutionStatistics(sample).find(entry=>entry.species==='rabbit')!;
  const fox=rabbit.predatorSpecialization.find(entry=>entry.predatorSpecies==='fox');
  const wolf=rabbit.predatorSpecialization.find(entry=>entry.predatorSpecies==='wolf');
  assert.ok(fox);
  assert.equal(fox!.sampleSize,9);
  assert.notEqual(fox!.reproductionAssociation,null);
  assert.ok(fox!.reproductionAssociation!<0);
  assert.ok(fox!.offspringAssociation!<0);
  assert.ok(fox!.lifespanAssociation!<0);
  assert.equal(wolf,undefined);
});


test('competition and disease source exposure excludes legacy unknown days from source means',()=>{
  const habitat={biome:'forest' as const,ecology:80,food:68,water:70,danger:24,settlementLevel:0,plantBiomass:72,competitionPressure:30,seasonalSuitability:76,diseasePressure:20,predatorPressure:10};
  let exposure=accumulateWildlifeHabitatExposure(undefined,habitat,'legacy_chunk',2);
  exposure=accumulateWildlifeHabitatExposure(exposure,habitat,'source_chunk',1,undefined,{deer:20},{fox:10});
  exposure=accumulateWildlifeHabitatExposure(exposure,habitat,'source_chunk',3,undefined,{deer:80},{fox:50});
  assert.equal(exposure.observedDays,6);
  assert.equal(exposure.competitionSourceObservedDays,4);
  assert.equal(exposure.diseaseSourceObservedDays,4);
  assert.equal(exposure.competitionSourceMean?.deer,65);
  assert.equal(exposure.diseaseSourceMean?.fox,40);
});

test('network-linked source fitness keeps living juveniles right-censored',()=>{
  const pressures=[8,18,28,42,52,62,74,84,94];
  const sample:WildlifeLineageRecord[]=pressures.map((pressure,index)=>{
    const habitat={
      biome:'plains' as const,ecology:78,food:70,water:68,danger:24,settlementLevel:0,plantBiomass:70,
      competitionPressure:pressure,seasonalSuitability:75,diseasePressure:pressure*.6,predatorPressure:0
    };
    const exposure=accumulateWildlifeHabitatExposure(
      undefined,habitat,'network_source',1,undefined,{goat:pressure},{deer:pressure*.6}
    );
    exposure.lastObservedDay=undefined;
    const offspring=index<3?3-index:index<5?1:0;
    return {
      entityId:`network_source_${index}`,species:'rabbit' as const,birthDay:1,generation:Math.floor(index/3),
      deathDay:150+index*10,deathReason:'other' as const,birthChunk:'network_source',
      traitsAtBirth:traits(.25+index*.05,.7+index*.02),birthHabitat:habitat,habitatExposure:exposure,
      origin:index<3?'founder' as const:'reproduction' as const,
      offspringCount:offspring,reproductiveSuccess:offspring>0
    };
  });
  const juvenileHabitat={
    biome:'plains' as const,ecology:78,food:70,water:68,danger:24,settlementLevel:0,plantBiomass:70,
    competitionPressure:99,seasonalSuitability:75,diseasePressure:70,predatorPressure:0
  };
  const juvenileExposure=accumulateWildlifeHabitatExposure(
    undefined,juvenileHabitat,'network_source',1,undefined,{goat:99},{deer:70}
  );
  juvenileExposure.lastObservedDay=undefined;
  sample.push({
    entityId:'network_source_juvenile',species:'rabbit',birthDay:950,generation:3,birthChunk:'network_source',
    traitsAtBirth:traits(.95,1.1),birthHabitat:juvenileHabitat,habitatExposure:juvenileExposure,
    origin:'reproduction',offspringCount:0,reproductiveSuccess:false
  });

  const rabbit=computeEvolutionStatistics(sample,1000).find(entry=>entry.species==='rabbit')!;
  const competition=rabbit.interactionSourceFitness.find(entry=>entry.kind==='competition'&&entry.sourceSpecies==='goat')!;
  const disease=rabbit.interactionSourceFitness.find(entry=>entry.kind==='disease'&&entry.sourceSpecies==='deer')!;
  assert.equal(competition.sampleSize,10);
  assert.equal(competition.reproductionEligibleSamples,9);
  assert.equal(disease.sampleSize,10);
  assert.equal(disease.reproductionEligibleSamples,9);
  assert.notEqual(competition.reproductionAssociation,null);
  assert.notEqual(competition.offspringAssociation,null);
  assert.notEqual(competition.lifespanAssociation,null);
  assert.ok(competition.reproductionAssociation!<0);
  assert.ok(competition.offspringAssociation!<0);
  assert.ok(disease.reproductionAssociation!<0);
  assert.ok(competition.selectionDifferential.wariness<0);
});


test('interaction source generations keep reciprocal species histories independent',()=>{
  const habitat={
    biome:'plains' as const,ecology:80,food:72,water:70,danger:20,settlementLevel:0,plantBiomass:75,
    competitionPressure:40,seasonalSuitability:78,diseasePressure:0,predatorPressure:0
  };
  const make=(id:string,species:'rabbit'|'goat',generation:number,source:'rabbit'|'goat',pressure:number,offspring:number,wariness:number):WildlifeLineageRecord=>{
    const exposure=accumulateWildlifeHabitatExposure(
      undefined,habitat,`chunk_${id}`,1,undefined,{[source]:pressure}
    );
    exposure.lastObservedDay=undefined;
    return {
      entityId:id,species,birthDay:1,deathDay:160+generation*12,deathReason:'other',
      generation,birthChunk:`chunk_${id}`,traitsAtBirth:traits(wariness,.8+generation*.03),
      birthHabitat:habitat,habitatExposure:exposure,origin:generation===0?'founder':'reproduction',
      offspringCount:offspring,reproductiveSuccess:offspring>0
    };
  };

  const sample:WildlifeLineageRecord[]=[
    make('rabbit_g0','rabbit',0,'goat',10,2,.30),
    make('rabbit_g2','rabbit',2,'goat',50,1,.55),
    make('rabbit_g4','rabbit',4,'goat',90,0,.80),
    make('goat_g1','goat',1,'rabbit',20,0,.40),
    make('goat_g3','goat',3,'rabbit',45,1,.60),
    make('goat_g5','goat',5,'rabbit',80,2,.85)
  ];

  const pair=computeWildlifeInteractionSelectionEvidence(sample,1000)
    .find(entry=>entry.kind==='competition'&&
      ((entry.speciesA==='goat'&&entry.speciesB==='rabbit')||(entry.speciesA==='rabbit'&&entry.speciesB==='goat')))!;

  assert.equal(pair.bothSidesObserved,true);
  const rabbitSide=pair.sideA.targetSpecies==='rabbit'?pair.sideA:pair.sideB;
  const goatSide=pair.sideA.targetSpecies==='goat'?pair.sideA:pair.sideB;
  assert.deepEqual(rabbitSide.generations.map(entry=>entry.generation),[0,2,4]);
  assert.deepEqual(goatSide.generations.map(entry=>entry.generation),[1,3,5]);
  assert.ok((rabbitSide.pressureTrendPerGeneration||0)>0);
  assert.ok((goatSide.pressureTrendPerGeneration||0)>0);
  assert.ok((rabbitSide.pressureOffspringAssociation||0)<-.9);
  assert.ok((goatSide.pressureOffspringAssociation||0)>.9);
  assert.ok((rabbitSide.pressureTraitAssociation.wariness||0)>.9);
  assert.ok((goatSide.pressureTraitAssociation.wariness||0)>.9);
  assert.ok((rabbitSide.traitTrendPerGeneration.wariness||0)>0);
  assert.ok((goatSide.traitTrendPerGeneration.wariness||0)>0);
});

test('interaction source generations preserve one-sided disease evidence as partial',()=>{
  const habitat={
    biome:'forest' as const,ecology:78,food:65,water:74,danger:30,settlementLevel:0,plantBiomass:80,
    competitionPressure:0,seasonalSuitability:75,diseasePressure:35,predatorPressure:0
  };
  const exposure=accumulateWildlifeHabitatExposure(
    undefined,habitat,'disease_partial',1,undefined,undefined,{fox:35}
  );
  exposure.lastObservedDay=undefined;
  const rabbit:WildlifeLineageRecord={
    entityId:'rabbit_disease_partial',species:'rabbit',birthDay:1,deathDay:180,deathReason:'disease',
    generation:2,birthChunk:'disease_partial',traitsAtBirth:traits(.7,.9),birthHabitat:habitat,
    habitatExposure:exposure,origin:'reproduction',offspringCount:0,reproductiveSuccess:false
  };

  const pair=computeWildlifeInteractionSelectionEvidence([rabbit],1000)
    .find(entry=>entry.kind==='disease'&&entry.speciesA==='fox'&&entry.speciesB==='rabbit')!;
  assert.equal(pair.bothSidesObserved,false);
  const rabbitSide=pair.sideA.targetSpecies==='rabbit'?pair.sideA:pair.sideB;
  const foxSide=pair.sideA.targetSpecies==='fox'?pair.sideA:pair.sideB;
  assert.equal(rabbitSide.generationsObserved,1);
  assert.equal(rabbitSide.generations[0]?.pressureMean,35);
  assert.equal(rabbitSide.generations[0]?.deaths,1);
  assert.equal(rabbitSide.generations[0]?.lifespanPressureMean,35);
  assert.equal(foxSide.generationsObserved,0);
  assert.equal(rabbitSide.pressureBreederAssociation,null);
  assert.equal(rabbitSide.pressureTraitAssociation.wariness,null);
});


test('multi-factor selection separates simultaneous orthogonal interaction sources',()=>{
  const habitat={
    biome:'plains' as const,ecology:82,food:72,water:74,danger:22,settlementLevel:0,plantBiomass:76,
    competitionPressure:45,seasonalSuitability:80,diseasePressure:32,predatorPressure:38
  };
  const levels=[10,50,90];
  const sample:WildlifeLineageRecord[]=[];
  let index=0;
  for(let a=0;a<3;a++)for(let b=0;b<3;b++)for(let c=0;c<3;c++){
    const predation=levels[a]!,competition=levels[b]!,disease=levels[c]!;
    const rawOffspring=1+a-b+c;
    const offspring=Math.max(0,rawOffspring);
    const lifespan=180+35*a-25*b+15*c;
    const exposure=accumulateWildlifeHabitatExposure(
      undefined,habitat,`multifactor_${index}`,1,
      {fox:predation},{goat:competition},{deer:disease}
    );
    exposure.lastObservedDay=undefined;
    sample.push({
      entityId:`multifactor_${index}`,species:'rabbit',birthDay:1,
      deathDay:1+lifespan,deathReason:'other',generation:Math.floor(index/9),
      birthChunk:`multifactor_${index}`,traitsAtBirth:traits(.3+a*.08+c*.03,.8+b*.04),
      birthHabitat:habitat,habitatExposure:exposure,origin:index<9?'founder':'reproduction',
      offspringCount:offspring,reproductiveSuccess:offspring>0
    });
    index++;
  }

  const evidence=computeEvolutionStatistics(sample,1000).find(entry=>entry.species==='rabbit')!.multifactorSelection;
  const offspring=evidence.models.find(model=>model.outcome==='offspring')!;
  const lifespan=evidence.models.find(model=>model.outcome==='lifespan')!;
  const reproduction=evidence.models.find(model=>model.outcome==='reproduction')!;

  assert.equal(offspring.estimable,true);
  assert.equal(offspring.samples,27);
  assert.equal(offspring.selectedFeatures,3);
  assert.ok((offspring.maxFeatureCorrelation||0)<1e-9);
  assert.ok((offspring.rSquared||0)>.7);
  assert.equal(lifespan.estimable,true);
  assert.ok((lifespan.rSquared||0)>.9);
  assert.equal(reproduction.estimable,true);

  const coefficient=(model:typeof offspring,kind:'predation'|'competition'|'disease',source:'fox'|'goat'|'deer')=>
    model.coefficients.find(feature=>feature.kind===kind&&feature.sourceSpecies===source)?.standardizedCoefficient;

  assert.ok(coefficient(offspring,'predation','fox')!>0);
  assert.ok(coefficient(offspring,'competition','goat')!<0);
  assert.ok(coefficient(offspring,'disease','deer')!>0);
  assert.ok(coefficient(lifespan,'predation','fox')!>0);
  assert.ok(coefficient(lifespan,'competition','goat')!<0);
  assert.ok(coefficient(lifespan,'disease','deer')!>0);
  assert.ok(coefficient(reproduction,'competition','goat')!<0);
});

test('multi-factor selection never zero-imputes disjoint legacy source coverage',()=>{
  const habitat={
    biome:'forest' as const,ecology:76,food:68,water:72,danger:28,settlementLevel:0,plantBiomass:78,
    competitionPressure:30,seasonalSuitability:74,diseasePressure:0,predatorPressure:30
  };
  const sample:WildlifeLineageRecord[]=[];
  for(let index=0;index<16;index++){
    const predatorObserved=index<8;
    const pressure=10+(index%8)*10;
    const exposure=accumulateWildlifeHabitatExposure(
      undefined,habitat,`multifactor_missing_${index}`,1,
      predatorObserved?{fox:pressure}:undefined,
      predatorObserved?undefined:{goat:pressure},
      undefined
    );
    exposure.lastObservedDay=undefined;
    sample.push({
      entityId:`multifactor_missing_${index}`,species:'rabbit',birthDay:1,
      deathDay:180+index,deathReason:'other',generation:index%3,birthChunk:`multifactor_missing_${index}`,
      traitsAtBirth:traits(.4+index*.01,.8),birthHabitat:habitat,habitatExposure:exposure,
      origin:index<4?'founder':'reproduction',offspringCount:index%2,reproductiveSuccess:index%2===1
    });
  }

  const multifactor=computeEvolutionStatistics(sample,1000).find(entry=>entry.species==='rabbit')!.multifactorSelection;
  const model=multifactor.models.find(entry=>entry.outcome==='offspring')!;
  const stability=multifactor.stability.find(entry=>entry.outcome==='offspring')!;

  assert.equal(model.candidateFeatures,2);
  assert.equal(model.estimable,false);
  assert.equal(model.status,'insufficient_features');
  assert.equal(model.selectedFeatures,1);
  assert.equal(model.samples,8);
  assert.equal(model.coefficients.length,1);
  assert.equal(model.coefficients[0]?.coverageSamples,8);
  assert.equal(model.coefficients[0]?.standardizedCoefficient,null);
  assert.equal(stability.leaveOneGenerationOut.availableGenerations,3);
  assert.equal(stability.leaveOneGenerationOut.attemptedReplicates,0);
  assert.deepEqual(stability.leaveOneGenerationOut.testedGenerations,[]);
  assert.equal(stability.localWindows.length,0);
});

test('multi-factor selection rejects severe predictor collinearity instead of emitting ridge coefficients',()=>{
  const habitat={
    biome:'plains' as const,ecology:80,food:74,water:72,danger:30,settlementLevel:0,plantBiomass:76,
    competitionPressure:35,seasonalSuitability:78,diseasePressure:24,predatorPressure:32
  };
  const sample:WildlifeLineageRecord[]=[];
  for(let index=0;index<18;index++){
    const pressure=10+index*3;
    const disease=12+(index%4)*11;
    const exposure=accumulateWildlifeHabitatExposure(
      undefined,habitat,`multifactor_collinear_${index}`,1,
      {fox:pressure},{goat:pressure*2},{deer:disease}
    );
    exposure.lastObservedDay=undefined;
    const offspring=(index%5)<2?2:0;
    sample.push({
      entityId:`multifactor_collinear_${index}`,species:'rabbit',birthDay:1,
      deathDay:170+index*4,deathReason:'other',generation:index%4,birthChunk:`multifactor_collinear_${index}`,
      traitsAtBirth:traits(.35+index*.01,.8),birthHabitat:habitat,habitatExposure:exposure,
      origin:index<5?'founder':'reproduction',offspringCount:offspring,reproductiveSuccess:offspring>0
    });
  }

  const model=computeEvolutionStatistics(sample,1000).find(entry=>entry.species==='rabbit')!
    .multifactorSelection.models.find(entry=>entry.outcome==='offspring')!;

  assert.equal(model.candidateFeatures,3);
  assert.equal(model.selectedFeatures,3);
  assert.equal(model.estimable,false);
  assert.equal(model.status,'unstable_collinearity');
  assert.ok((model.maxFeatureCorrelation||0)>.999);
  assert.equal(model.maxVarianceInflationFactor,null);
  assert.ok(model.coefficients.every(feature=>feature.standardizedCoefficient===null));
});

test('multi-factor stability uses deterministic leave-one-generation-out sensitivity and narrow local windows',()=>{
  const habitat={
    biome:'plains' as const,ecology:82,food:76,water:74,danger:26,settlementLevel:0,plantBiomass:80,
    competitionPressure:28,seasonalSuitability:82,diseasePressure:12,predatorPressure:25
  };
  const sample:WildlifeLineageRecord[]=[];
  for(let generation=0;generation<4;generation++){
    for(let a=0;a<3;a++)for(let b=0;b<3;b++){
      const index=generation*9+a*3+b;
      const exposure=accumulateWildlifeHabitatExposure(
        undefined,habitat,`stability_${generation}_${a}_${b}`,1,
        {fox:10+a*20},{goat:12+b*18},undefined
      );
      exposure.lastObservedDay=undefined;
      const offspring=2*a+(2-b);
      sample.push({
        entityId:`stability_${index}`,species:'rabbit',birthDay:1+generation*100,
        deathDay:180+generation*100+index,deathReason:'other',generation,
        birthChunk:`stability_${generation}`,traitsAtBirth:traits(.4+a*.04,.75+b*.05),
        birthHabitat:habitat,habitatExposure:exposure,origin:generation===0?'founder':'reproduction',
        offspringCount:offspring,reproductiveSuccess:offspring>0
      });
    }
  }

  const evidence=computeEvolutionStatistics(sample,1000).find(entry=>entry.species==='rabbit')!.multifactorSelection;
  const stability=evidence.stability.find(entry=>entry.outcome==='offspring')!;
  assert.equal(stability.basis,'target_species_generation');
  assert.equal(stability.leaveOneGenerationOut.availableGenerations,4);
  assert.deepEqual(stability.leaveOneGenerationOut.testedGenerations,[0,1,2,3]);
  assert.equal(stability.leaveOneGenerationOut.attemptedReplicates,4);
  assert.equal(stability.leaveOneGenerationOut.estimableReplicates,4);
  assert.equal(stability.leaveOneGenerationOut.comparableReplicates,4);

  const predator=stability.leaveOneGenerationOut.coefficients.find(entry=>entry.kind==='predation'&&entry.sourceSpecies==='fox')!;
  const competition=stability.leaveOneGenerationOut.coefficients.find(entry=>entry.kind==='competition'&&entry.sourceSpecies==='goat')!;
  assert.equal(predator.comparableReplicates,4);
  assert.equal(predator.signConsistency,1);
  assert.equal(competition.signConsistency,1);
  assert.ok((predator.coefficientMin||0)>0);
  assert.ok((competition.coefficientMax||0)<0);

  assert.equal(stability.localWindows.length,4);
  for(const window of stability.localWindows){
    assert.equal(window.startGeneration,window.endGeneration);
    assert.equal(window.generations.length,1);
    assert.equal(window.searchTruncated,false);
    assert.equal(window.model.estimable,true);
    assert.equal(window.model.samples,9);
  }
});

test('generation-local multi-factor windows expose regime changes hidden by pooled history',()=>{
  const habitat={
    biome:'forest' as const,ecology:84,food:72,water:78,danger:34,settlementLevel:0,plantBiomass:82,
    competitionPressure:32,seasonalSuitability:76,diseasePressure:10,predatorPressure:30
  };
  const sample:WildlifeLineageRecord[]=[];
  for(let generation=0;generation<2;generation++){
    for(let a=0;a<3;a++)for(let b=0;b<3;b++){
      const index=generation*9+a*3+b;
      const exposure=accumulateWildlifeHabitatExposure(
        undefined,habitat,`regime_${generation}_${a}_${b}`,1,
        {fox:10+a*20},{goat:15+b*15},undefined
      );
      exposure.lastObservedDay=undefined;
      const predatorComponent=generation===0?2*a:2*(2-a);
      const offspring=predatorComponent+(2-b);
      sample.push({
        entityId:`regime_${index}`,species:'rabbit',birthDay:1+generation*120,
        deathDay:190+generation*120+index,deathReason:'other',generation,
        birthChunk:`regime_${generation}`,traitsAtBirth:traits(.42+a*.03,.78+b*.04),
        birthHabitat:habitat,habitatExposure:exposure,origin:generation===0?'founder':'reproduction',
        offspringCount:offspring,reproductiveSuccess:offspring>0
      });
    }
  }

  const stability=computeEvolutionStatistics(sample,1000).find(entry=>entry.species==='rabbit')!
    .multifactorSelection.stability.find(entry=>entry.outcome==='offspring')!;
  assert.equal(stability.localWindows.length,2);
  const early=stability.localWindows.find(window=>window.endGeneration===0)!;
  const late=stability.localWindows.find(window=>window.endGeneration===1)!;
  assert.equal(early.model.estimable,true);
  assert.equal(late.model.estimable,true);
  const coefficient=(window:typeof early)=>window.model.coefficients
    .find(entry=>entry.kind==='predation'&&entry.sourceSpecies==='fox')!.standardizedCoefficient!;
  assert.ok(coefficient(early)>0);
  assert.ok(coefficient(late)<0);
});

test('multi-factor stability keeps long generation histories computationally bounded',()=>{
  const habitat={
    biome:'plains' as const,ecology:80,food:74,water:72,danger:24,settlementLevel:0,plantBiomass:78,
    competitionPressure:30,seasonalSuitability:80,diseasePressure:8,predatorPressure:28
  };
  const sample:WildlifeLineageRecord[]=[];
  for(let generation=0;generation<20;generation++){
    for(let a=0;a<3;a++)for(let b=0;b<3;b++){
      const index=generation*9+a*3+b;
      const exposure=accumulateWildlifeHabitatExposure(
        undefined,habitat,`bounded_${generation}_${a}_${b}`,1,
        {fox:10+a*20},{goat:12+b*18},undefined
      );
      exposure.lastObservedDay=undefined;
      const offspring=2*a+(2-b);
      sample.push({
        entityId:`bounded_${index}`,species:'rabbit',birthDay:1+generation*80,
        deathDay:160+generation*80+index,deathReason:'other',generation,
        birthChunk:`bounded_${generation}`,traitsAtBirth:traits(.4+a*.03,.76+b*.04),
        birthHabitat:habitat,habitatExposure:exposure,origin:generation===0?'founder':'reproduction',
        offspringCount:offspring,reproductiveSuccess:offspring>0
      });
    }
  }

  const stability=computeEvolutionStatistics(sample,5000).find(entry=>entry.species==='rabbit')!
    .multifactorSelection.stability.find(entry=>entry.outcome==='offspring')!;
  assert.equal(stability.leaveOneGenerationOut.availableGenerations,20);
  assert.equal(stability.leaveOneGenerationOut.attemptedReplicates,12);
  assert.equal(stability.leaveOneGenerationOut.testedGenerations.length,12);
  assert.equal(stability.leaveOneGenerationOut.testedGenerations[0],0);
  assert.equal(stability.leaveOneGenerationOut.testedGenerations.at(-1),19);
  assert.ok(stability.localWindows.length<=6);
  assert.ok(stability.localWindows.every(window=>window.generations.length<=8));
});

const phenotype=(bodyLength:number,riskTolerance:number):WildlifePhenotype=>({
  morphology:{bodyLength,bodyHeight:1,legLength:1,headScale:1,tailScale:1},
  behavior:{forageDrive:1,migrationDrive:1,riskTolerance,recoveryDrive:1}
});

test('phenotype observability keeps legacy coverage explicit and measures generation trends plus breeder differentials',()=>{
  const legacy=computeEvolutionStatistics(records).find(entry=>entry.species==='rabbit')!;
  assert.equal(legacy.phenotype.sampleSize,0);
  assert.equal(legacy.phenotype.mean,null);
  assert.equal(legacy.phenotype.trendPerGeneration,null);

  const sample:WildlifeLineageRecord[]=[];
  for(let generation=0;generation<3;generation++){
    sample.push({
      entityId:`phenotype_g${generation}_a`,species:'rabbit',birthDay:1+generation*20,generation,birthChunk:'a',
      traitsAtBirth:traits(.4),phenotypeAtBirth:phenotype(.90+generation*.05,.85+generation*.04),
      phenotypeProvenance:generation===0?'founder_seed':'birth',
      origin:generation===0?'founder':'reproduction',offspringCount:0,reproductiveSuccess:false
    });
    sample.push({
      entityId:`phenotype_g${generation}_b`,species:'rabbit',birthDay:2+generation*20,generation,birthChunk:'a',
      traitsAtBirth:traits(.6),phenotypeAtBirth:phenotype(1.02+generation*.05,1.02+generation*.04),
      phenotypeProvenance:generation===0?'founder_seed':'birth',
      origin:generation===0?'founder':'reproduction',offspringCount:2,reproductiveSuccess:true
    });
  }
  sample.push({
    entityId:'legacy_upgrade_outlier',species:'rabbit',birthDay:1,generation:99,birthChunk:'legacy',
    traitsAtBirth:traits(.5),phenotypeAtBirth:phenotype(1.22,.70),phenotypeProvenance:'legacy_upgrade',
    origin:'founder',offspringCount:0,reproductiveSuccess:false
  });
  const rabbit=computeEvolutionStatistics(sample).find(entry=>entry.species==='rabbit')!;
  assert.equal(rabbit.phenotype.sampleSize,7);
  assert.equal(rabbit.phenotype.comparableSamples,6);
  assert.equal(rabbit.phenotype.birthTrackedSamples,4);
  assert.equal(rabbit.phenotype.founderSeedSamples,2);
  assert.equal(rabbit.phenotype.legacyUpgradeSamples,1);
  assert.ok((rabbit.phenotype.variance?.morphology.bodyLength||0)>0);
  assert.ok(Math.abs((rabbit.phenotype.trendPerGeneration?.morphology.bodyLength||0)-.05)<1e-12);
  assert.ok(Math.abs((rabbit.phenotype.trendPerGeneration?.behavior.riskTolerance||0)-.04)<1e-12);
  assert.ok((rabbit.phenotype.breederDifferential?.morphology.bodyLength||0)>0);
  assert.ok((rabbit.phenotype.breederDifferential?.behavior.riskTolerance||0)>0);
  assert.equal(rabbit.cohorts[0]?.phenotypeSamples,2);
  assert.ok(rabbit.cohorts.every(cohort=>cohort.phenotypeMean!==null));
});

test('phenotype-by-biome fitness evidence is right-censored and excludes legacy-upgrade pseudo-history',()=>{
  const forestExposure=(days:number)=>({
    observedDays:days,
    habitatMean:{ecology:82,food:72,water:70,danger:42,settlementLevel:1,plantBiomass:76,competitionPressure:24,seasonalSuitability:78,diseasePressure:18,predatorPressure:32},
    biomeDays:{forest:days},
    chunkDays:{chunk_forest:days},
    observedTransitions:0
  });
  const sample:WildlifeLineageRecord[]=[];
  for(let i=0;i<6;i++){
    const p=phenotype(.90+i*.035,.82+i*.055);
    p.morphology.legLength=.84+i*.06;
    p.morphology.headScale=.88+i*.045;
    p.behavior.forageDrive=.80+i*.075;
    const birthDay=10+i;
    const lifespan=70+i*18;
    sample.push({
      entityId:`forest_pheno_${i}`,species:'rabbit',birthDay,deathDay:birthDay+lifespan,deathReason:i<2?'predation':'senescence',
      generation:i<2?0:i<4?1:2,birthChunk:'chunk_forest',deathChunk:'chunk_forest',
      traitsAtBirth:traits(.45+i*.02),phenotypeAtBirth:p,phenotypeAtDeath:p,phenotypeProvenance:i<2?'founder_seed':'birth',
      habitatExposure:forestExposure(1+i*.2),
      origin:i<2?'founder':'reproduction',offspringCount:i<2?0:i-1,reproductiveSuccess:i>=2
    });
  }
  sample.push({
    entityId:'legacy_upgrade_pheno',species:'rabbit',birthDay:5,deathDay:500,deathReason:'senescence',generation:20,
    birthChunk:'chunk_forest',deathChunk:'chunk_forest',traitsAtBirth:traits(.9),
    phenotypeAtBirth:{
      morphology:{bodyLength:1.22,bodyHeight:1.18,legLength:.78,headScale:1.18,tailScale:1.2},
      behavior:{forageDrive:.75,migrationDrive:.75,riskTolerance:1.3,recoveryDrive:.75}
    },
    phenotypeProvenance:'legacy_upgrade',habitatExposure:forestExposure(10),
    origin:'founder',offspringCount:20,reproductiveSuccess:true
  });

  const rabbit=computeEvolutionStatistics(sample,600).find(entry=>entry.species==='rabbit')!;
  const forest=rabbit.phenotypeBiomeFitness.find(entry=>entry.biome==='forest')!;
  assert.equal(forest.sampleSize,6);
  assert.equal(forest.reproductionEligibleSamples,6);
  assert.equal(forest.lifespanSamples,6);
  assert.ok(forest.observedExposureDaysMean<3,'legacy exposure must not enter comparable phenotype fitness');
  assert.ok((forest.breederDifferential?.morphology.legLength||0)>0);
  assert.ok((forest.breederDifferential?.behavior.forageDrive||0)>0);
  assert.ok((forest.reproductionAssociation.morphology.legLength||0)>.7);
  assert.ok((forest.offspringAssociation.morphology.legLength||0)>.9);
  assert.ok((forest.offspringAssociation.behavior.forageDrive||0)>.9);
  assert.ok((forest.lifespanAssociation.morphology.legLength||0)>.9);
});

