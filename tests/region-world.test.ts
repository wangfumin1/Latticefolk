import test from 'node:test';
import assert from 'node:assert/strict';
import { fallbackRegionDecisions, fallbackWorldDecision } from '../server/decision/rules.js';
import type { RegionDecisionRequest, WorldDecisionRequest } from '../src/types.js';

test('regional fallback coordinates scarcity without mutating region state',()=>{
  const req:RegionDecisionRequest={
    day:5,gameTime:'10:00',weather:'clear',
    regions:[{
      id:'region_0_0',rx:0,rz:0,chunkIds:['a','b','c'],population:44,settlements:2,
      food:24,wood:68,water:28,ecology:55,danger:32,prosperity:45
    }]
  };
  const before=JSON.stringify(req);
  const out=fallbackRegionDecisions(req);
  assert.equal(out.decisions[0]?.priority,'food_security');
  assert.equal(out.decisions[0]?.movementPolicy,'stabilize');
  assert.equal(JSON.stringify(req),before);
});

test('world fallback produces bounded strategic posture from aggregate pressure',()=>{
  const req:WorldDecisionRequest={
    day:8,gameTime:'21:10',weather:'rain',
    summary:{population:180,settlements:11,food:68,wood:61,water:66,ecology:63,danger:22,prosperity:72,activeRegions:8},
    regions:[]
  };
  const out=fallbackWorldDecision(req);
  assert.equal(out.decision.priority,'prosperity');
  assert.equal(out.decision.connectivity,'trade_corridors');
  assert.equal(out.decision.growth,'steady');
});
