import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { JevDecisionProvider } from '../server/decision/providers/jev.js';
import { JevBudgetController, type JevBudgetConfig, type JevCallKind } from '../server/decision/budget.js';
import type { DialogueStore } from '../server/dialogueStore.js';

const kinds:JevCallKind[]=['npc','dialogue','chunk','region','world','wildlife'];
const unlimited:Partial<JevBudgetConfig>={
  enabled:true,maxCallsPerMinute:0,maxInputTokensPerMinute:0,maxInputTokensPerHour:0,
  maxInputTokensPerDay:0,maxUsdPerDay:0,cacheTtlMs:0,
  npcWeight:1,dialogueWeight:1,chunkWeight:1,regionWeight:1,worldWeight:1,wildlifeWeight:1,
};

function provider(t:TestContext,patch:Partial<JevBudgetConfig>={}) {
  // Install the offline transport before constructing a provider with a dummy key.
  const transport=t.mock.method(globalThis,'fetch',async()=>{throw new Error('unexpected offline request');});
  const key=process.env.TYPESAFE_API_KEY,model=process.env.JEV_MODEL;
  process.env.TYPESAFE_API_KEY='offline-test-only';process.env.JEV_MODEL='offline-test';
  let p:JevDecisionProvider;
  try{p=new JevDecisionProvider({retrieve:()=>[]} as unknown as DialogueStore);}
  finally{
    if(key===undefined)delete process.env.TYPESAFE_API_KEY;else process.env.TYPESAFE_API_KEY=key;
    if(model===undefined)delete process.env.JEV_MODEL;else process.env.JEV_MODEL=model;
  }
  p.updateBudget({...unlimited,...patch});
  // Exercise the actual common transport boundary used by all six adapters.
  const call=(p as unknown as {call:(kind:JevCallKind,state:unknown,questions:Record<string,unknown>)=>Promise<unknown>}).call.bind(p);
  return {p,call,transport};
}

function deferred<T>() {
  let resolve!:(value:T)=>void;
  const promise=new Promise<T>(r=>{resolve=r;});
  return {promise,resolve};
}

const response=(tokens:unknown=10)=>new Response(JSON.stringify({usage:{input_tokens:tokens},answers:{}}),{status:200});
const estimate=(state:unknown)=>new JevBudgetController().estimateTokens({model:'offline-test',state,questions:{}});

const defaultWeights:Partial<JevBudgetConfig>={npcWeight:1,dialogueWeight:1,chunkWeight:.65,regionWeight:.5,worldWeight:.35,wildlifeWeight:.3};
const zeroWeights:Partial<JevBudgetConfig>={npcWeight:0,dialogueWeight:0,chunkWeight:0,regionWeight:0,worldWeight:0,wildlifeWeight:0};

for(const [policy,weights] of [['default',defaultWeights],['zero',zeroWeights]] as const){
  for(const kind of kinds){
    for(const window of ['minute','hour','day','USD'] as const){
      test(`${policy} ${kind} weight cannot discount raw ${window} cost during concurrent admission`,async t=>{
        const tokens=estimate({id:0});
        const limit:Partial<JevBudgetConfig>=window==='minute'?{maxInputTokensPerMinute:tokens}:
          window==='hour'?{maxInputTokensPerHour:tokens}:window==='day'?{maxInputTokensPerDay:tokens}:
          {maxUsdPerDay:tokens*42/1e9};
        const {p,call,transport}=provider(t,{...weights,...limit}),pending=deferred<Response>();
        transport.mock.mockImplementation(()=>pending.promise);
        const results=Promise.allSettled([call(kind,{id:0},{}),call(kind,{id:1},{})]);
        try{
          assert.equal(transport.mock.callCount(),1,'accurate raw estimates must not be discounted by class weight');
          assert.equal(p.status().budget!.inputTokens[window==='USD'?'day':window],tokens);
        }finally{pending.resolve(response(tokens));}
        const settled=await results;
        assert.deepEqual(settled.map(x=>x.status),['fulfilled','rejected']);
        assert.equal(p.status().budget!.inputTokens.lifetime,tokens,'actual usage equals the accurate raw estimate');
        assert.equal(p.status().budget!.estimatedUsd.day,tokens*42/1e9);
        assert.equal(p.status().budget!.calls.lifetime,1);
      });
    }
  }
}

test('one discounted call is rejected when its raw estimate already exceeds the budget',async t=>{
  const tokens=estimate({id:0}),{p,call,transport}=provider(t,{...defaultWeights,maxInputTokensPerMinute:tokens-1});
  await assert.rejects(call('world',{id:0},{}),/tokens_per_minute/);
  assert.equal(transport.mock.callCount(),0);assert.equal(p.status().budget!.calls.lifetime,0);
});

for(const limit of ['calls_per_minute','tokens_per_minute','tokens_per_hour','tokens_per_day','usd_per_day'] as const){
  test(`one shared ${limit} admission includes all six in-flight provider classes`,async t=>{
    const tokens=estimate({id:0});
    const patch:Partial<JevBudgetConfig>=limit==='calls_per_minute'?{maxCallsPerMinute:1}:
      limit==='tokens_per_minute'?{maxInputTokensPerMinute:tokens}:
      limit==='tokens_per_hour'?{maxInputTokensPerHour:tokens}:
      limit==='tokens_per_day'?{maxInputTokensPerDay:tokens}:{maxUsdPerDay:tokens*42/1e9};
    const {p,call,transport}=provider(t,patch),pending=deferred<Response>();
    transport.mock.mockImplementation(()=>pending.promise);
    const results=Promise.allSettled(kinds.map((kind,id)=>call(kind,{id},{})));
    try{
      assert.equal(transport.mock.callCount(),1,'only one cache miss may reach the provider before settlement');
      assert.equal(p.status().budget!.calls.minute,1);
      assert.equal(p.status().budget!.inputTokens.minute,tokens);
    }finally{pending.resolve(response(tokens));}
    const settled=await results;
    assert.equal(settled.filter(x=>x.status==='fulfilled').length,1);
    for(const r of settled.slice(1)){
      assert.equal(r.status,'rejected');
      if(r.status==='rejected')assert.match(String(r.reason),new RegExp(limit));
    }
    assert.equal(p.status().budget!.calls.lifetime,1);
  });
}

test('a valid cache hit remains usable when the shared provider allowance is exhausted',async t=>{
  const {p,call,transport}=provider(t,{maxCallsPerMinute:1,cacheTtlMs:1000});
  transport.mock.mockImplementation(async()=>response(12));
  await call('npc',{id:0},{});
  await call('npc',{id:0},{});
  assert.equal(transport.mock.callCount(),1);
  assert.equal(p.status().budget!.cacheHits,1);
  assert.equal(p.status().budget!.calls.lifetime,1);
  await assert.rejects(call('world',{id:1},{}),/calls_per_minute/);
});

test('expired cache entries require a newly admitted provider attempt',async t=>{
  let now=1000;t.mock.method(Date,'now',()=>now);
  const {p,call,transport}=provider(t,{maxCallsPerMinute:1,cacheTtlMs:100});
  transport.mock.mockImplementation(async()=>response());
  await call('npc',{id:0},{});
  now+=100;
  await assert.rejects(call('npc',{id:0},{}),/calls_per_minute/);
  now+=60_001;
  await call('npc',{id:0},{});
  assert.equal(transport.mock.callCount(),2);
  assert.equal(p.status().budget!.cacheHits,0);
});

test('duplicate simultaneous cache misses still require separate reservations',async t=>{
  const {call,transport}=provider(t,{maxCallsPerMinute:1,cacheTtlMs:1000});
  const pending=deferred<Response>();transport.mock.mockImplementation(()=>pending.promise);
  const first=call('npc',{id:0},{});
  try{await assert.rejects(call('npc',{id:0},{}),/calls_per_minute/);}
  finally{pending.resolve(response());}
  await first;await call('npc',{id:0},{});
  assert.equal(transport.mock.callCount(),1);
});

for(const failure of ['network','abort','http','http_body','json'] as const){
  test(`${failure} failure releases pending state but retains one estimated attempt`,async t=>{
    let now=1000;t.mock.method(Date,'now',()=>now);
    const {p,call,transport}=provider(t,{maxCallsPerMinute:1});
    transport.mock.mockImplementation(async()=>{
      if(failure==='network')throw new Error('offline network failure');
      if(failure==='abort')throw new DOMException('offline deadline','TimeoutError');
      if(failure==='http')return new Response('offline unavailable',{status:503});
      if(failure==='http_body'){
        const result=new Response('',{status:503});
        t.mock.method(result,'text',async()=>{throw new Error('offline body failure');});
        return result;
      }
      return new Response('{invalid',{status:200});
    });
    await assert.rejects(call('npc',{id:0},{}));
    assert.equal(p.status().budget!.calls.lifetime,1);
    assert.equal(p.status().budget!.inputTokens.lifetime,estimate({id:0}));
    assert.equal(p.status().inputTokens,estimate({id:0}));
    await assert.rejects(call('world',{id:1},{}),/calls_per_minute/);
    now+=60_001;
    transport.mock.mockImplementation(async()=>response(7));
    await call('world',{id:1},{});
    assert.equal(transport.mock.callCount(),2);
    assert.equal(p.status().budget!.calls.minute,1,'failed reservation must not remain pending forever');
    assert.equal(p.status().budget!.calls.lifetime,2);
  });
}

test('local serialization and signal preparation failures consume no allowance',async t=>{
  const {p,call,transport}=provider(t,{maxCallsPerMinute:1});
  const circular:Record<string,unknown>={};circular.self=circular;
  await assert.rejects(call('npc',circular,{}),/circular/i);
  const signal=t.mock.method(AbortSignal,'timeout',()=>{throw new Error('offline signal preparation failure');});
  await assert.rejects(call('npc',{id:0},{}),/signal preparation failure/);
  signal.mock.restore();
  assert.equal(transport.mock.callCount(),0);
  assert.equal(p.status().budget!.calls.lifetime,0);
  transport.mock.mockImplementation(async()=>response());
  await call('npc',{id:0},{});
  assert.equal(transport.mock.callCount(),1);
});

for(const tokens of [0,5,100,null,-1,'3','Infinity'] as const){
  test(`usage ${String(tokens)} reconciles without corrupting the shared budget`,async t=>{
    const {p,call,transport}=provider(t);
    transport.mock.mockImplementation(async()=>response(tokens));
    await call('npc',{id:0},{});
    const actual=typeof tokens==='number'&&tokens>=0?tokens:estimate({id:0});
    assert.equal(p.status().budget!.inputTokens.lifetime,actual);
    assert.equal(p.status().inputTokens,actual);
    assert.equal(p.status().budget!.estimatedUsd.day,actual*42/1e9);
    assert.equal(p.status().budget!.calls.lifetime,1);
  });
}

test('missing and nonfinite usage reconcile to the local estimate',async t=>{
  const {p,call,transport}=provider(t);
  for(const value of [{answers:{}},{usage:{input_tokens:NaN}},{usage:{input_tokens:Infinity}}]){
    transport.mock.mockImplementation(async()=>({ok:true,json:async()=>value}) as Response);
    await call('npc',{id:0},{});
  }
  assert.equal(p.status().budget!.inputTokens.lifetime,3*estimate({id:0}));
  assert.equal(p.status().budget!.calls.lifetime,3);
});

test('actual usage below the reservation frees token capacity for later calls',async t=>{
  const {p,call,transport}=provider(t,{maxInputTokensPerMinute:estimate({id:0})+5});
  transport.mock.mockImplementation(async()=>response(5));
  await call('npc',{id:0},{});await call('world',{id:1},{});
  assert.equal(transport.mock.callCount(),2);
  assert.equal(p.status().budget!.inputTokens.minute,10);
});

test('actual usage above the estimate blocks later requests at the reconciled cost',async t=>{
  const {p,call,transport}=provider(t,{maxInputTokensPerMinute:2*estimate({id:0})});
  transport.mock.mockImplementation(async()=>response(100));
  await call('npc',{id:0},{});
  await assert.rejects(call('world',{id:1},{}),/tokens_per_minute/);
  assert.equal(transport.mock.callCount(),1);
  assert.equal(p.status().budget!.inputTokens.minute,100);
});

test('JSON body decoding retains the reservation until settlement',async t=>{
  const {p,call,transport}=provider(t,{maxCallsPerMinute:1});
  const body=deferred<unknown>(),reading=deferred<void>();
  transport.mock.mockImplementation(async()=>({ok:true,json:()=>{reading.resolve();return body.promise;}}) as Response);
  const first=call('npc',{id:0},{});
  await reading.promise;
  try{await assert.rejects(call('world',{id:1},{}),/calls_per_minute/);}
  finally{body.resolve({usage:{input_tokens:7}});}
  await first;
  assert.equal(p.status().budget!.inputTokens.minute,7);
  assert.equal(p.status().budget!.calls.lifetime,1);
});

function publicCalls(p:JevDecisionProvider):Record<JevCallKind,()=>Promise<{source:string}>> {
  const time={day:1,gameTime:'12:00',weather:'clear'};
  const stocks={population:20,settlements:1,food:60,wood:60,water:60,ecology:60,danger:20,prosperity:50};
  return {
    npc:()=>p.decide({
      npc:{id:'n',name:'N',role:'resident',position:{x:0,z:0},home:{x:0,z:0},mood:'neutral',
        hunger:20,energy:80,social:80,money:5,inventory:[],relationships:{},memories:[],
        currentAction:'idle',goal:'rest',lastDecisionAt:0},
      allowedActions:['idle'],world:{...time,minuteOfDay:720,nearbyNpcs:[],nearbyObjects:[],recentEvents:[]},
    }),
    dialogue:()=>p.dialogueDecision({
      speaker:{id:'n',name:'N',role:'resident',mood:'neutral'},
      listener:{id:'m',name:'M',role:'resident',mood:'neutral'},situation:'greeting',intent:'greet',
      world:{...time,nearbyTags:[]},recentLines:[],
    }),
    chunk:()=>p.decideChunks({...time,chunks:[{
      ...stocks,id:'chunk_0_0',cx:0,cz:0,biome:'plains',settlementLevel:1,
      strategy:'sustain',migrationPolicy:'retain',ecologyPolicy:'balance',lastDecisionAt:0,decisionVersion:0,
    }]}),
    region:()=>p.decideRegions({...time,regions:[{...stocks,id:'region_0_0',rx:0,rz:0,chunkIds:['chunk_0_0']}]}),
    world:()=>p.decideWorld({...time,summary:{...stocks,activeRegions:1},regions:[]}),
    wildlife:()=>p.decideWildlife({requests:[{
      wildlife:{id:'rabbit',chunkId:'chunk_0_0',species:'rabbit',position:{x:0,z:0},ageDays:140,
        health:80,hunger:30,thirst:30,energy:70,sex:'female',generation:0,traits:{speed:2.4,size:.55,fertility:.9,wariness:.9},
        currentAction:'wander',lastDecisionAt:0,birthDay:1},
      world:{...time,minuteOfDay:720,currentHabitat:{
        ...stocks,id:'chunk_0_0',biome:'plains',distance:0,settlementLevel:1,carryingCapacity:40,
        density:.5,competitionPressure:10,seasonalSuitability:70,diseasePressure:8,
      },nearbyChunks:[],nearbyResources:[],nearbyWildlife:[]},allowedActions:['wander'],
    }]}),
  };
}

for(const firstKind of kinds){
  test(`${firstKind} public adapter shares admission and other adapters retain fallback semantics`,async t=>{
    const {p,transport}=provider(t,{maxCallsPerMinute:1}),pending=deferred<Response>();
    transport.mock.mockImplementation(()=>pending.promise);
    const methods=publicCalls(p),order=[firstKind,...kinds.filter(kind=>kind!==firstKind)];
    const replies=Promise.all(order.map(kind=>methods[kind]()));
    try{assert.equal(transport.mock.callCount(),1);}
    finally{pending.resolve(response());}
    const results=await replies;
    assert.equal(results[0].source,'jev');
    assert.deepEqual(results.slice(1).map(x=>x.source),Array(5).fill('fallback'));
    assert.equal(p.status().budget!.calls[firstKind],1);
    assert.equal(p.status().budget!.calls.lifetime,1);
    assert.equal(p.status().failures,5);
  });
}

test('emergency hunger remains a free bounded rule guard',async t=>{
  const {p,transport}=provider(t,{maxCallsPerMinute:1});
  const result=await p.decide({
    npc:{id:'n',name:'N',role:'resident',position:{x:0,z:0},home:{x:0,z:0},mood:'neutral',
      hunger:99,energy:80,social:80,money:5,inventory:[],relationships:{},memories:[],
      currentAction:'idle',goal:'eat',lastDecisionAt:0},
    allowedActions:['eat'],world:{gameTime:'12:00',minuteOfDay:720,weather:'clear',nearbyNpcs:[],nearbyObjects:[],recentEvents:[]},
  });
  assert.equal(result.source,'rule_guard');assert.equal(result.action,'eat');
  assert.equal(transport.mock.callCount(),0);assert.equal(p.status().budget!.calls.lifetime,0);
});
