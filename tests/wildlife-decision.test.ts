import test from 'node:test';
import assert from 'node:assert/strict';
import { fallbackWildlifeDecisions } from '../server/decision/rules.js';
import type { WildlifeDecisionBatchRequest, WildlifeState } from '../src/types.js';

const animal=(patch:Partial<WildlifeState>={}):WildlifeState=>({
  id:'rabbit_1',chunkId:'chunk_2_2',species:'rabbit',position:{x:0,z:0},ageDays:140,health:80,hunger:30,thirst:30,energy:70,
  sex:'female',generation:0,traits:{speed:2.4,size:.55,fertility:.9,wariness:.9},currentAction:'wander',lastDecisionAt:0,birthDay:1,...patch
});

test('wildlife fallback prioritizes nearby predator escape',()=>{
  const req:WildlifeDecisionBatchRequest={requests:[{
    wildlife:animal(),
    world:{gameTime:'09:00',minuteOfDay:540,weather:'clear',nearbyResources:[],nearbyWildlife:[
      {id:'fox_1',species:'fox',sex:'male',ageDays:500,distance:3,health:80,currentAction:'hunt',mateAvailable:true}
    ]},
    allowedActions:['flee','wander','graze','rest']
  }]};
  assert.equal(fallbackWildlifeDecisions(req).decisions[0]?.action,'flee');
});

test('wildlife fallback prioritizes water under severe thirst',()=>{
  const req:WildlifeDecisionBatchRequest={requests:[{
    wildlife:animal({thirst:85}),
    world:{gameTime:'12:00',minuteOfDay:720,weather:'clear',nearbyResources:[
      {id:'pond',tags:['water','nature'],distance:5,resourceAmount:10}
    ],nearbyWildlife:[]},
    allowedActions:['drink','wander','rest']
  }]};
  const d=fallbackWildlifeDecisions(req).decisions[0]!;
  assert.equal(d.action,'drink');
  assert.equal(d.targetObjectId,'pond');
});


test('wildlife fallback avoids mating with unavailable partners',()=>{
  const req:WildlifeDecisionBatchRequest={requests:[{
    wildlife:animal({hunger:20,thirst:20,energy:80}),
    world:{gameTime:'14:00',minuteOfDay:840,weather:'clear',nearbyResources:[],nearbyWildlife:[
      {id:'rabbit_m',species:'rabbit',sex:'male',ageDays:180,distance:2,health:85,currentAction:'wander',mateAvailable:false}
    ]},
    allowedActions:['seek_mate','wander','rest']
  }]};
  assert.notEqual(fallbackWildlifeDecisions(req).decisions[0]?.action,'seek_mate');
});

test('disease pressure prefers recovery when no emergency need dominates',()=>{
  const req:WildlifeDecisionBatchRequest={requests:[{
    wildlife:animal({diseaseLoad:82,hunger:35,thirst:35,energy:60}),
    world:{gameTime:'08:00',minuteOfDay:480,weather:'rain',nearbyResources:[],nearbyWildlife:[]},
    allowedActions:['rest','wander']
  }]};
  const d=fallbackWildlifeDecisions(req).decisions[0]!;
  assert.equal(d.action,'rest');
  assert.equal(d.reasonCode,'disease_recovery');
});
