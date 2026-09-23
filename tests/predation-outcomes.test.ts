import test from 'node:test';
import assert from 'node:assert/strict';
import type { WildlifeLineageRecord, WildlifeTraits } from '../src/types.js';
import { computeEvolutionStatistics } from '../src/world/evolution.js';
import {
  recordWildlifeAttackReceived, recordWildlifeFleeOutcome, recordWildlifeHuntOutcome
} from '../src/world/predationOutcomes.js';

const traits=(speed:number,wariness:number):WildlifeTraits=>({speed,size:.6,fertility:.7,wariness});
const record=(id:string,species:'rabbit'|'fox',t:WildlifeTraits):WildlifeLineageRecord=>({
  entityId:id,species,birthDay:1,generation:0,birthChunk:'chunk_0_0',traitsAtBirth:t,
  origin:'founder',offspringCount:0,reproductiveSuccess:false
});

test('realized predation recorders keep predator and prey roles separate by counterpart species',()=>{
  const fox=record('fox_1','fox',traits(2.7,.7));
  const rabbit=record('rabbit_1','rabbit',traits(2.4,.9));

  recordWildlifeHuntOutcome(fox,'rabbit',false,false);
  recordWildlifeHuntOutcome(fox,'rabbit',true,false);
  recordWildlifeHuntOutcome(fox,'rabbit',true,true);

  recordWildlifeFleeOutcome(rabbit,'fox',false);
  recordWildlifeFleeOutcome(rabbit,'fox',true);
  recordWildlifeAttackReceived(rabbit,'fox',true);
  recordWildlifeAttackReceived(rabbit,'fox',false);

  assert.deepEqual(fox.predationOutcomes?.asPredator.byPrey.rabbit,{huntAttempts:3,huntHits:2,kills:1});
  assert.equal(fox.predationOutcomes?.asPredator.huntAttempts,3);
  assert.equal(fox.predationOutcomes?.asPrey.fleeAttempts,0);

  assert.deepEqual(rabbit.predationOutcomes?.asPrey.byPredator.fox,{
    fleeAttempts:2,successfulEscapes:1,attacksReceived:2,survivedAttacks:1
  });
  assert.equal(rabbit.predationOutcomes?.asPrey.fleeAttempts,2);
  assert.equal(rabbit.predationOutcomes?.asPredator.huntAttempts,0);
});

test('evolution statistics expose realized hunting escape and attack-survival rates',()=>{
  const foxA=record('fox_a','fox',traits(3.0,.65));
  const foxB=record('fox_b','fox',traits(2.4,.72));
  recordWildlifeHuntOutcome(foxA,'rabbit',true,true);
  recordWildlifeHuntOutcome(foxA,'rabbit',true,false);
  recordWildlifeHuntOutcome(foxB,'rabbit',false,false);

  const rabbitA=record('rabbit_a','rabbit',traits(2.8,.95));
  const rabbitB=record('rabbit_b','rabbit',traits(2.1,.55));
  recordWildlifeFleeOutcome(rabbitA,'fox',true);
  recordWildlifeFleeOutcome(rabbitB,'fox',false);
  recordWildlifeAttackReceived(rabbitA,'fox',true);
  recordWildlifeAttackReceived(rabbitB,'fox',false);

  const stats=computeEvolutionStatistics([foxA,foxB,rabbitA,rabbitB],200);
  const fox=stats.find(entry=>entry.species==='fox')!.realizedPredation;
  assert.equal(fox.huntAttempts,3);
  assert.equal(fox.huntHits,2);
  assert.equal(fox.kills,1);
  assert.equal(fox.huntHitRate,2/3);
  assert.equal(fox.huntKillRate,1/3);
  const foxRabbit=fox.pairs.find(pair=>pair.role==='predator'&&pair.counterpartSpecies==='rabbit')!;
  assert.equal(foxRabbit.observedIndividuals,2);
  assert.ok(foxRabbit.successTraitDifferential.speed>0);

  const rabbit=stats.find(entry=>entry.species==='rabbit')!.realizedPredation;
  assert.equal(rabbit.fleeAttempts,2);
  assert.equal(rabbit.successfulEscapes,1);
  assert.equal(rabbit.escapeRate,.5);
  assert.equal(rabbit.attacksReceived,2);
  assert.equal(rabbit.survivedAttacks,1);
  assert.equal(rabbit.attackSurvivalRate,.5);
  const rabbitFox=rabbit.pairs.find(pair=>pair.role==='prey'&&pair.counterpartSpecies==='fox')!;
  assert.ok(rabbitFox.successTraitDifferential.speed>0);
  assert.ok(rabbitFox.successTraitDifferential.wariness>0);
});


test('realized pair trait differential stays neutral when no individual succeeded',()=>{
  const fox=record('fox_fail','fox',traits(2.9,.68));
  recordWildlifeHuntOutcome(fox,'rabbit',false,false);
  const pair=computeEvolutionStatistics([fox],200)
    .find(entry=>entry.species==='fox')!.realizedPredation.pairs
    .find(entry=>entry.role==='predator'&&entry.counterpartSpecies==='rabbit')!;
  assert.equal(pair.huntAttempts,1);
  assert.equal(pair.huntHits,0);
  assert.equal(pair.successTraitDifferential.speed,0);
  assert.equal(pair.successTraitDifferential.size,0);
  assert.equal(pair.successTraitDifferential.fertility,0);
  assert.equal(pair.successTraitDifferential.wariness,0);
});


test('trait matching uses explicit paired-snapshot counts instead of legacy attempt totals',()=>{
  const fox=record('fox_mixed','fox',traits(3.0,.7));
  fox.generation=1;
  const rabbitTraits=traits(2.0,.9);

  // Legacy-style realized outcomes without counterpart trait snapshots.
  recordWildlifeHuntOutcome(fox,'rabbit',false,false);
  recordWildlifeHuntOutcome(fox,'rabbit',false,false);

  // New paired observation: predator speed advantage is exactly +1.0.
  recordWildlifeHuntOutcome(fox,'rabbit',true,true,fox.traitsAtBirth,rabbitTraits);

  const pair=computeEvolutionStatistics([fox],200)
    .find(entry=>entry.species==='fox')!.realizedPredation.pairs
    .find(entry=>entry.role==='predator'&&entry.counterpartSpecies==='rabbit')!;

  assert.equal(pair.huntAttempts,3);
  assert.equal(pair.traitMatchAttempts,1);
  assert.equal(pair.traitMatchSuccesses,1);
  assert.equal(pair.terminalTraitMatchSuccesses,1);
  assert.equal(pair.attemptTraitAdvantageMean.speed,1);
  assert.equal(pair.successTraitAdvantageMean.speed,1);
  assert.equal(pair.terminalTraitAdvantageMean.speed,1);
  assert.equal(pair.generationTrend[0]?.traitMatchAttempts,1);
  assert.equal(pair.generationTrend[0]?.attemptTraitAdvantageMean.speed,1);
});

test('prey attack-survival trait matching is recorded separately from flee matching',()=>{
  const rabbit=record('rabbit_survivor','rabbit',traits(2.8,.92));
  rabbit.generation=2;
  const foxTraits=traits(2.3,.65);

  recordWildlifeAttackReceived(rabbit,'fox',true,rabbit.traitsAtBirth,foxTraits);
  recordWildlifeAttackReceived(rabbit,'fox',false,rabbit.traitsAtBirth,foxTraits);

  const pair=computeEvolutionStatistics([rabbit],200)
    .find(entry=>entry.species==='rabbit')!.realizedPredation.pairs
    .find(entry=>entry.role==='prey'&&entry.counterpartSpecies==='fox')!;

  assert.equal(pair.fleeAttempts,0);
  assert.equal(pair.attacksReceived,2);
  assert.equal(pair.survivedAttacks,1);
  assert.equal(pair.traitMatchAttempts,0);
  assert.equal(pair.terminalTraitMatchSuccesses,1);
  assert.equal(pair.terminalTraitAdvantageMean.speed,.5);
  assert.ok(Math.abs(pair.terminalTraitAdvantageMean.wariness-.27)<1e-12);
  assert.equal(pair.generationTrend[0]?.generation,2);
  assert.equal(pair.generationTrend[0]?.terminalAttempts,2);
  assert.equal(pair.generationTrend[0]?.terminalSuccesses,1);
  assert.equal(pair.generationTrend[0]?.terminalTraitMatchSuccesses,1);
});
