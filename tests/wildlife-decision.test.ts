import test from 'node:test';
import assert from 'node:assert/strict';
import { fallbackWildlifeDecisions } from '../server/decision/rules.js';
import type { WildlifeDecisionBatchRequest, WildlifeMigrationCandidate, WildlifeState } from '../src/types.js';

const habitat=(patch:Partial<WildlifeMigrationCandidate>={}):WildlifeMigrationCandidate=>({
  id:'chunk_2_2',biome:'plains',distance:0,ecology:70,food:65,water:70,danger:20,settlementLevel:0,
  population:8,carryingCapacity:20,density:.4,competitionPressure:10,seasonalSuitability:70,...patch
});
const world=(patch:Partial<WildlifeDecisionBatchRequest['requests'][number]['world']>={})=>({
  gameTime:'09:00',minuteOfDay:540,weather:'clear',currentHabitat:habitat(),nearbyChunks:[],
  nearbyResources:[],nearbyWildlife:[],...patch
});

const animal=(patch:Partial<WildlifeState>={}):WildlifeState=>({
  id:'rabbit_1',chunkId:'chunk_2_2',species:'rabbit',position:{x:0,z:0},ageDays:140,health:80,hunger:30,thirst:30,energy:70,
  sex:'female',generation:0,traits:{speed:2.4,size:.55,fertility:.9,wariness:.9},currentAction:'wander',lastDecisionAt:0,birthDay:1,...patch
});

test('wildlife fallback prioritizes nearby predator escape',()=>{
  const req:WildlifeDecisionBatchRequest={requests:[{
    wildlife:animal(),
    world:world({nearbyWildlife:[
      {id:'fox_1',species:'fox',sex:'male',ageDays:500,distance:3,health:80,currentAction:'hunt',mateAvailable:true}
    ]}),
    allowedActions:['flee','wander','graze','rest']
  }]};
  assert.equal(fallbackWildlifeDecisions(req).decisions[0]?.action,'flee');
});

test('wildlife fallback prioritizes water under severe thirst',()=>{
  const req:WildlifeDecisionBatchRequest={requests:[{
    wildlife:animal({thirst:85}),
    world:world({gameTime:'12:00',minuteOfDay:720,nearbyResources:[
      {id:'pond',tags:['water','nature'],distance:5,resourceAmount:10}
    ]}),
    allowedActions:['drink','wander','rest']
  }]};
  const d=fallbackWildlifeDecisions(req).decisions[0]!;
  assert.equal(d.action,'drink');
  assert.equal(d.targetObjectId,'pond');
});


test('wildlife fallback avoids mating with unavailable partners',()=>{
  const req:WildlifeDecisionBatchRequest={requests:[{
    wildlife:animal({hunger:20,thirst:20,energy:80}),
    world:world({gameTime:'14:00',minuteOfDay:840,nearbyWildlife:[
      {id:'rabbit_m',species:'rabbit',sex:'male',ageDays:180,distance:2,health:85,currentAction:'wander',mateAvailable:false}
    ]}),
    allowedActions:['seek_mate','wander','rest']
  }]};
  assert.notEqual(fallbackWildlifeDecisions(req).decisions[0]?.action,'seek_mate');
});

test('disease pressure prefers recovery when no emergency need dominates',()=>{
  const req:WildlifeDecisionBatchRequest={requests:[{
    wildlife:animal({diseaseLoad:82,hunger:35,thirst:35,energy:60}),
    world:world({gameTime:'08:00',minuteOfDay:480,weather:'rain'}),
    allowedActions:['rest','wander']
  }]};
  const d=fallbackWildlifeDecisions(req).decisions[0]!;
  assert.equal(d.action,'rest');
  assert.equal(d.reasonCode,'disease_recovery');
});


test('wildlife fallback chooses bounded adjacent migration target under habitat pressure',()=>{
  const req:WildlifeDecisionBatchRequest={requests:[{
    wildlife:animal({hunger:25,thirst:25,energy:75,health:85,ageDays:160}),
    world:world({
      currentHabitat:habitat({population:19,carryingCapacity:20,density:.95,ecology:32,food:30,water:28,danger:72}),
      nearbyChunks:[
        habitat({id:'chunk_3_2',distance:24,biome:'forest',population:7,carryingCapacity:22,density:.32,ecology:82,food:72,water:70,danger:18}),
        habitat({id:'chunk_2_3',distance:24,biome:'dryland',population:14,carryingCapacity:18,density:.78,ecology:42,food:38,water:28,danger:45})
      ]
    }),
    allowedActions:['migrate','wander','rest']
  }]};
  const d=fallbackWildlifeDecisions(req).decisions[0]!;
  assert.equal(d.action,'migrate');
  assert.equal(d.targetChunkId,'chunk_3_2');
});


test('wildlife fallback can migrate away from severe niche competition',()=>{
  const req:WildlifeDecisionBatchRequest={requests:[{
    wildlife:animal({hunger:25,thirst:25,energy:75,health:85,ageDays:160}),
    world:world({
      currentHabitat:habitat({density:.55,competitionPressure:78,ecology:70,food:68,water:72,danger:20}),
      nearbyChunks:[
        habitat({id:'chunk_3_2',distance:24,biome:'forest',density:.35,competitionPressure:12,ecology:76,food:70,water:72,danger:18})
      ]
    }),
    allowedActions:['migrate','wander','rest']
  }]};
  const d=fallbackWildlifeDecisions(req).decisions[0]!;
  assert.equal(d.action,'migrate');
  assert.equal(d.targetChunkId,'chunk_3_2');
});


test('wildlife fallback can migrate toward seasonally suitable adjacent habitat',()=>{
  const req:WildlifeDecisionBatchRequest={requests:[{
    wildlife:animal({hunger:20,thirst:20,energy:80,health:90,ageDays:180}),
    world:world({
      currentHabitat:habitat({density:.45,competitionPressure:10,seasonalSuitability:10,ecology:72,food:70,water:70,danger:18}),
      nearbyChunks:[
        habitat({id:'chunk_3_2',distance:24,biome:'forest',density:.45,competitionPressure:10,seasonalSuitability:90,ecology:72,food:70,water:70,danger:18})
      ]
    }),
    allowedActions:['migrate','wander','rest']
  }]};
  const d=fallbackWildlifeDecisions(req).decisions[0]!;
  assert.equal(d.action,'migrate');
  assert.equal(d.targetChunkId,'chunk_3_2');
});
