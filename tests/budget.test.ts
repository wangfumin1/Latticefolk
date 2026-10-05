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

test('reservation settlement is idempotent and does not discount known input cost',()=>{
  const budget=new JevBudgetController();
  budget.update({enabled:true,chunkWeight:0.5,maxInputTokensPerMinute:100,maxCallsPerMinute:1});
  const reserved=budget.reserve('chunk',80);
  assert.equal(reserved.ok,true);
  if(!reserved.ok)throw new Error('expected admission');
  assert.equal(budget.snapshot().inputTokens.minute,80);
  assert.equal(budget.snapshot().calls.chunk,1);
  assert.equal(budget.reserve('npc',1).ok,false);
  assert.equal(reserved.settle(60),60);
  assert.equal(reserved.settle(999),60);
  assert.equal(budget.snapshot().inputTokens.lifetime,60);
  assert.equal(budget.snapshot().calls.lifetime,1);
  assert.equal(budget.getConfig().chunkWeight,0.5);
});

test('class weights above one retain their conservative admission headroom',()=>{
  const budget=new JevBudgetController();
  budget.update({enabled:true,worldWeight:2,maxCallsPerMinute:0,maxInputTokensPerMinute:150,
    maxInputTokensPerHour:0,maxInputTokensPerDay:0,maxUsdPerDay:0});
  assert.equal(budget.reserve('world',80).ok,false);
  const reserved=budget.reserve('world',70);if(!reserved.ok)throw new Error(reserved.reason);
  assert.equal(budget.snapshot().inputTokens.minute,140);
  assert.equal(budget.reserve('npc',11).ok,false);
  reserved.settle(70);
  assert.equal(budget.snapshot().inputTokens.minute,70);
  assert.equal(budget.getConfig().worldWeight,2);
});

for(const window of [60_000,3_600_000,86_400_000]){
  test(`unsettled usage survives ${window}ms rollover, settled usage eventually expires`,t=>{
    let now=1000;t.mock.method(Date,'now',()=>now);
    const budget=new JevBudgetController();
    budget.update({enabled:true,maxCallsPerMinute:0,maxInputTokensPerMinute:0,maxInputTokensPerHour:0,
      maxInputTokensPerDay:0,maxUsdPerDay:0});
    budget.update(window===60_000?{maxInputTokensPerMinute:80}:
      window===3_600_000?{maxInputTokensPerHour:80}:{maxInputTokensPerDay:80});
    const reserved=budget.reserve('npc',80);
    if(!reserved.ok)throw new Error(reserved.reason);
    now+=86_400_001;
    assert.equal(budget.snapshot().calls.minute,1);
    assert.equal(budget.reserve('npc',1).ok,false);
    reserved.settle(80);
    assert.equal(budget.reserve('npc',1).ok,false);
    now+=window;
    assert.equal(budget.reserve('npc',1).ok,false,'cutoff remains inclusive');
    now+=1;
    const next=budget.reserve('npc',1);
    assert.equal(next.ok,true);
    if(next.ok)next.settle(1);
    assert.equal(budget.snapshot().inputTokens.lifetime,81);
  });
}

test('call and USD limits retain in-flight usage across their windows',t=>{
  let now=1000;t.mock.method(Date,'now',()=>now);
  for(const patch of [{maxCallsPerMinute:1,maxUsdPerDay:0},{maxCallsPerMinute:0,maxUsdPerDay:80*42/1e9}]){
    const budget=new JevBudgetController();
    budget.update({enabled:true,maxInputTokensPerMinute:0,maxInputTokensPerHour:0,maxInputTokensPerDay:0,...patch});
    const reserved=budget.reserve('npc',80);if(!reserved.ok)throw new Error(reserved.reason);
    now+=86_400_001;
    assert.equal(budget.reserve('npc',1).ok,false);
    reserved.settle();
    assert.equal(budget.reserve('npc',1).ok,false);
    now+=86_400_001;
    assert.equal(budget.canCall('npc',1).ok,true);
  }
});

test('disabled budgets still account attempts when runtime enforcement is restored',()=>{
  const budget=new JevBudgetController();budget.update({enabled:false,maxCallsPerMinute:1});
  const reserved=budget.reserve('npc',80);if(!reserved.ok)throw new Error(reserved.reason);
  budget.update({enabled:true});
  assert.equal(budget.reserve('world',1).ok,false);
  reserved.settle();
  assert.equal(budget.snapshot().inputTokens.lifetime,80);
  assert.equal(budget.snapshot().calls.lifetime,1);
});
