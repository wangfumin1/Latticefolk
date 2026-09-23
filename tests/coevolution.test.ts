import test from 'node:test';
import assert from 'node:assert/strict';
import type { WildlifeLineageRecord, WildlifeSpecies, WildlifeTraits } from '../src/types.js';
import { computeWildlifeCoevolutionEvidence } from '../src/world/evolution.js';
import {
  recordWildlifeAttackReceived, recordWildlifeFleeOutcome, recordWildlifeHuntOutcome
} from '../src/world/predationOutcomes.js';

const traits=(speed:number,size:number,wariness:number):WildlifeTraits=>({speed,size,fertility:.7,wariness});
const record=(id:string,species:WildlifeSpecies,generation:number,t:WildlifeTraits,offspringCount:number):WildlifeLineageRecord=>({
  entityId:id,species,birthDay:1,generation,birthChunk:'chunk_0_0',traitsAtBirth:t,
  origin:generation>0?'reproduction':'founder',offspringCount,reproductiveSuccess:offspringCount>0
});

test('coevolution evidence keeps predator and prey generation series independent',()=>{
  const foxes=[
    record('fox_g0','fox',0,traits(2.2,.65,.62),0),
    record('fox_g2','fox',2,traits(2.8,.72,.66),1),
    record('fox_g4','fox',4,traits(3.4,.80,.70),2)
  ];
  const rabbits=[
    record('rabbit_g1','rabbit',1,traits(2.0,.52,.50),0),
    record('rabbit_g3','rabbit',3,traits(2.5,.55,.70),1),
    record('rabbit_g5','rabbit',5,traits(3.0,.58,.90),2)
  ];

  const foxSuccess=[0,1,2];
  for(let i=0;i<foxes.length;i++){
    const fox=foxes[i]!,rabbit=rabbits[i]!;
    for(let attempt=0;attempt<2;attempt++){
      const hit=attempt<foxSuccess[i]!;
      recordWildlifeHuntOutcome(fox,'rabbit',hit,hit&&attempt===0,fox.traitsAtBirth,rabbit.traitsAtBirth);
    }
  }

  const rabbitSuccess=[0,1,2];
  for(let i=0;i<rabbits.length;i++){
    const rabbit=rabbits[i]!,fox=foxes[i]!;
    for(let attempt=0;attempt<2;attempt++){
      const escaped=attempt<rabbitSuccess[i]!;
      recordWildlifeFleeOutcome(rabbit,'fox',escaped,rabbit.traitsAtBirth,fox.traitsAtBirth);
      const survived=attempt<rabbitSuccess[i]!;
      recordWildlifeAttackReceived(rabbit,'fox',survived,rabbit.traitsAtBirth,fox.traitsAtBirth);
    }
  }

  const pair=computeWildlifeCoevolutionEvidence([...foxes,...rabbits],1000)
    .find(entry=>entry.predatorSpecies==='fox'&&entry.preySpecies==='rabbit')!;

  assert.equal(pair.bothSidesObserved,true);
  assert.deepEqual(pair.predator.generations.map(g=>g.generation),[0,2,4]);
  assert.deepEqual(pair.prey.generations.map(g=>g.generation),[1,3,5]);
  assert.deepEqual(pair.predator.generations.map(g=>g.successRate),[0,.5,1]);
  assert.deepEqual(pair.prey.generations.map(g=>g.successRate),[0,.5,1]);
  assert.ok((pair.predator.performanceTrendPerGeneration||0)>0);
  assert.ok((pair.prey.performanceTrendPerGeneration||0)>0);
  assert.ok((pair.predator.performanceOffspringAssociation||0)>.9);
  assert.ok((pair.prey.performanceOffspringAssociation||0)>.9);
  assert.ok((pair.predator.performanceTraitAssociation.speed||0)>.9);
  assert.ok((pair.prey.performanceTraitAssociation.wariness||0)>.9);
  assert.ok((pair.predator.traitTrendPerGeneration.speed||0)>0);
  assert.ok((pair.prey.traitTrendPerGeneration.wariness||0)>0);
});

test('coevolution evidence preserves one-sided partial observations and missing associations',()=>{
  const fox=record('fox_partial','fox',0,traits(2.8,.72,.7),0);
  const rabbitTraits=traits(2.4,.55,.8);
  recordWildlifeHuntOutcome(fox,'rabbit',false,false,fox.traitsAtBirth,rabbitTraits);

  const pair=computeWildlifeCoevolutionEvidence([fox],1000)
    .find(entry=>entry.predatorSpecies==='fox'&&entry.preySpecies==='rabbit')!;

  assert.equal(pair.bothSidesObserved,false);
  assert.equal(pair.predator.generationsObserved,1);
  assert.equal(pair.prey.generationsObserved,0);
  assert.equal(pair.predator.performanceBreederAssociation,null);
  assert.equal(pair.predator.performanceOffspringAssociation,null);
  assert.equal(pair.predator.performanceTrendPerGeneration,null);
});
