import test from 'node:test';
import assert from 'node:assert/strict';
import { computeEvolutionStatistics, lineageAncestors } from '../src/world/evolution.js';
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
