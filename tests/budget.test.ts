import test from 'node:test';
import assert from 'node:assert/strict';
import { JevBudgetController } from '../server/decision/budget.js';

test('budget controller blocks calls that exceed runtime token budget', () => {
  const budget=new JevBudgetController();
  budget.update({enabled:true,maxCallsPerMinute:100,maxInputTokensPerMinute:100,maxInputTokensPerHour:1000,maxInputTokensPerDay:1000,maxUsdPerDay:10});
  assert.equal(budget.canCall('npc',80).ok,true);
  budget.record('npc',80);
  const blocked=budget.canCall('npc',30);
  assert.equal(blocked.ok,false);
  if(!blocked.ok) assert.equal(blocked.reason,'tokens_per_minute');
});

test('budget controller tracks call classes and cache/low confidence counters', () => {
  const budget=new JevBudgetController();
  budget.update({enabled:false});
  budget.record('npc',120);
  budget.record('dialogue',80);
  budget.record('chunk',50);
  budget.recordCacheHit();
  budget.recordLowConfidence();
  const s=budget.snapshot();
  assert.equal(s.calls.npc,1);
  assert.equal(s.calls.dialogue,1);
  assert.equal(s.calls.chunk,1);
  assert.equal(s.inputTokens.lifetime,250);
  assert.equal(s.cacheHits,1);
  assert.equal(s.lowConfidenceFallbacks,1);
});
