import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import type {
  ChunkDecisionRequest, CoarseChunkState, RegionDecision, RegionDecisionRequest, WorldDecision, WorldDecisionRequest
} from '../src/types.js';
import type { ChunkDecisionSignal } from '../src/world/decisionScheduling.js';
import { CoarseWorldRuntime } from '../src/world/coarseWorld.js';

const context={day:4,gameTime:'11:30',weather:'clear',dt:0};

interface RequestInternals {
  pending:boolean;
  regionPending:boolean;
  worldPending:boolean;
  decisionBaselines:Map<string,ChunkDecisionSignal>;
  regionPolicies:Map<string,RegionDecision>;
  worldPolicy:WorldDecision;
  requestBatch(ctx:typeof context):Promise<void>;
  requestRegions(ctx:typeof context):Promise<void>;
  requestWorld(ctx:typeof context):Promise<void>;
}

function internals(runtime:CoarseWorldRuntime){
  return runtime as unknown as RequestInternals;
}

function deferred<T>(){
  let resolve!:(value:T)=>void;
  let reject!:(reason?:unknown)=>void;
  const promise=new Promise<T>((res,rej)=>{resolve=res;reject=rej;});
  return {promise,resolve,reject};
}

function jsonResponse(value:unknown,status=200){
  return new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
}

function legalChunkDecision(chunkId:string,overrides:Record<string,unknown>={}){
  return {
    chunkId,
    strategy:'conserve',
    migrationPolicy:'retain',
    ecologyPolicy:'protect',
    confidence:.8,
    reasonCode:'test_decision',
    source:'test-provider',
    ...overrides
  };
}

function legalRegionDecision(regionId:string,overrides:Record<string,unknown>={}){
  return {
    regionId,
    priority:'balanced',
    movementPolicy:'stabilize',
    ecologyPolicy:'balanced_use',
    confidence:.8,
    reasonCode:'test_region',
    source:'test-provider',
    ...overrides
  };
}

function legalWorldDecision(overrides:Record<string,unknown>={}){
  return {
    priority:'prosperity',
    connectivity:'balanced_networks',
    growth:'steady',
    confidence:.8,
    reasonCode:'test_world',
    source:'test-provider',
    ...overrides
  };
}

test('coarse decision requests bound fetch and JSON stalls, release pending state, and recover',async()=>{
  const originalFetch=globalThis.fetch;
  try{
    const signals:AbortSignal[]=[];
    globalThis.fetch=((_input:RequestInfo | URL,init?:RequestInit)=>{
      if(init?.signal)signals.push(init.signal);
      return new Promise<Response>(()=>{});
    }) as typeof fetch;

    const runtime=new CoarseWorldRuntime(new THREE.Scene(),'request-lifecycle-timeout',25);
    const state=internals(runtime);
    await Promise.all([
      state.requestBatch(context),
      state.requestRegions(context),
      state.requestWorld(context)
    ]);
    assert.equal(signals.length,3);
    assert.ok(signals.every(signal=>signal.aborted));
    assert.equal(state.pending,false);
    assert.equal(state.regionPending,false);
    assert.equal(state.worldPending,false);
    assert.equal(runtime.status().requestTimeouts,3);

    let jsonSignal:AbortSignal|undefined;
    globalThis.fetch=(async(_input:RequestInfo | URL,init?:RequestInit)=>{
      jsonSignal=init?.signal??undefined;
      return {ok:true,json:()=>new Promise<unknown>(()=>{})} as Response;
    }) as typeof fetch;
    await state.requestWorld(context);
    assert.equal(jsonSignal?.aborted,true,'deadline must also release a stalled response.json()');
    assert.equal(state.worldPending,false);
    assert.equal(runtime.status().requestTimeouts,4);

    let retryCalls=0;
    globalThis.fetch=(async(input:RequestInfo | URL,init?:RequestInit)=>{
      retryCalls++;
      const url=String(input);
      const parsed=JSON.parse(String(init?.body??'{}')) as ChunkDecisionRequest | RegionDecisionRequest | WorldDecisionRequest;
      if(url.endsWith('/api/world/chunks/decide')){
        const body=parsed as ChunkDecisionRequest;
        return jsonResponse({source:'timeout-retry',decisions:body.chunks.map(chunk=>legalChunkDecision(chunk.id,{source:'timeout-retry'}))});
      }
      if(url.endsWith('/api/world/regions/decide')){
        const body=parsed as RegionDecisionRequest;
        return jsonResponse({source:'timeout-retry',decisions:body.regions.map(region=>legalRegionDecision(region.id,{source:'timeout-retry'}))});
      }
      if(url.endsWith('/api/world/strategy/decide')){
        return jsonResponse({source:'timeout-retry',decision:legalWorldDecision({source:'timeout-retry'})});
      }
      throw new Error(`unexpected request ${url}`);
    }) as typeof fetch;

    await Promise.all([
      state.requestBatch(context),
      state.requestRegions(context),
      state.requestWorld(context)
    ]);
    assert.equal(retryCalls,3,'recovery must not create extra provider calls');
    assert.equal(state.pending,false);
    assert.equal(state.regionPending,false);
    assert.equal(state.worldPending,false);
    const status=runtime.status();
    assert.equal(status.requestTimeouts,4);
    assert.equal(status.lastSource,'timeout-retry');
    assert.ok(status.lastBatchSize>0);
    assert.ok(status.regionDecisions>0);
    assert.equal(status.worldPriority,'prosperity');
  }finally{
    globalThis.fetch=originalFetch;
  }
});

test('late resolution after timeout cannot overwrite a later successful retry',async()=>{
  const originalFetch=globalThis.fetch;
  try{
    const firstFetch=deferred<Response>();
    let captured:ChunkDecisionRequest|undefined;
    globalThis.fetch=((_input:RequestInfo | URL,init?:RequestInit)=>{
      captured=JSON.parse(String(init?.body??'{}')) as ChunkDecisionRequest;
      return firstFetch.promise;
    }) as typeof fetch;
    const runtime=new CoarseWorldRuntime(new THREE.Scene(),'late-timeout',20);
    const state=internals(runtime);
    await state.requestBatch(context);
    assert.ok(captured);
    assert.equal(state.pending,false);
    assert.equal(runtime.status().requestTimeouts,1);
    const targetId=captured!.chunks[0]!.id;

    globalThis.fetch=(async(_input:RequestInfo | URL,init?:RequestInit)=>{
      const body=JSON.parse(String(init?.body??'{}')) as ChunkDecisionRequest;
      return jsonResponse({
        source:'fresh-retry',
        decisions:body.chunks.map(chunk=>legalChunkDecision(chunk.id,{strategy:'fortify',source:'fresh-retry'}))
      });
    }) as typeof fetch;
    await state.requestBatch(context);
    const afterRetry=runtime.chunks.get(targetId);
    assert.ok(afterRetry);
    assert.equal(afterRetry.strategy,'fortify');
    const versionAfterRetry=afterRetry.decisionVersion;

    firstFetch.resolve(jsonResponse({
      source:'too-late',
      decisions:captured!.chunks.map(chunk=>legalChunkDecision(chunk.id,{strategy:'extract_resources',source:'too-late'}))
    }));
    await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(runtime.chunks.get(targetId)?.strategy,'fortify');
    assert.equal(runtime.chunks.get(targetId)?.decisionVersion,versionAfterRetry);
    assert.equal(runtime.status().lastSource,'fresh-retry');
  }finally{
    globalThis.fetch=originalFetch;
  }
});

test('chunk replies require request membership, unique legal rows, live object identity and request-time baselines',async()=>{
  const originalFetch=globalThis.fetch;
  try{
    const gate=deferred<Response>();
    let captured:ChunkDecisionRequest|undefined;
    globalThis.fetch=((input:RequestInfo | URL,init?:RequestInit)=>{
      assert.ok(String(input).endsWith('/api/world/chunks/decide'));
      captured=JSON.parse(String(init?.body??'{}')) as ChunkDecisionRequest;
      return gate.promise;
    }) as typeof fetch;

    const runtime=new CoarseWorldRuntime(new THREE.Scene(),'membership-validation',1_000);
    const state=internals(runtime);
    const pending=state.requestBatch(context);
    assert.ok(captured);
    assert.ok(captured!.chunks.length>=4);
    const [duplicate,validBaseline,invalid,validOutOfOrder]=captured!.chunks;
    const requestedIds=new Set(captured!.chunks.map(chunk=>chunk.id));
    const unexpected=[...runtime.chunks.keys()].find(id=>!requestedIds.has(id));
    assert.ok(unexpected);

    const baselineFood=validBaseline!.food;
    runtime.chunks.get(validBaseline!.id)!.food=baselineFood+9;

    gate.resolve(jsonResponse({
      source:'validated-provider',
      decisions:[
        legalChunkDecision(validOutOfOrder!.id,{strategy:'trade_route'}),
        legalChunkDecision(duplicate!.id,{strategy:'fortify'}),
        legalChunkDecision(unexpected!,{strategy:'grow_settlement'}),
        legalChunkDecision(invalid!.id,{strategy:'not-a-strategy'}),
        legalChunkDecision(duplicate!.id,{strategy:'conserve'}),
        legalChunkDecision(validBaseline!.id,{strategy:'extract_resources'})
      ]
    }));
    await pending;

    assert.equal(runtime.chunks.get(duplicate!.id)?.decisionVersion,0,'duplicate membership must be rejected as a whole');
    assert.equal(runtime.chunks.get(invalid!.id)?.decisionVersion,0,'invalid enum must not mutate state');
    assert.equal(runtime.chunks.get(unexpected!)?.decisionVersion,0,'out-of-batch existing IDs must not mutate state');
    assert.equal(runtime.chunks.get(validOutOfOrder!.id)?.strategy,'trade_route');
    assert.equal(runtime.chunks.get(validBaseline!.id)?.strategy,'extract_resources');
    assert.equal(runtime.chunks.get(validBaseline!.id)?.food,baselineFood+9,'deterministic state changes during the request must survive');
    assert.equal(state.decisionBaselines.get(validBaseline!.id)?.food,baselineFood,'baseline must represent request-time state, not erase in-flight simulation changes');
    assert.equal(runtime.status().lastBatchSize,2);
    assert.equal(runtime.status().lastSource,'validated-provider');
  }finally{
    globalThis.fetch=originalFetch;
  }
});

test('restore while a chunk request is pending invalidates the reply and its baseline',async()=>{
  const originalFetch=globalThis.fetch;
  try{
    const gate=deferred<Response>();
    let captured:ChunkDecisionRequest|undefined;
    globalThis.fetch=((_input:RequestInfo | URL,init?:RequestInit)=>{
      captured=JSON.parse(String(init?.body??'{}')) as ChunkDecisionRequest;
      return gate.promise;
    }) as typeof fetch;
    const runtime=new CoarseWorldRuntime(new THREE.Scene(),'restore-generation',1_000);
    const state=internals(runtime);
    const pending=state.requestBatch(context);
    assert.ok(captured);
    const targetId=captured!.chunks[0]!.id;
    const before=runtime.chunks.get(targetId)!;
    const restored:CoarseChunkState={...structuredClone(before),strategy:'grow_settlement',food:33,decisionVersion:7,lastDecisionAt:123};
    runtime.restoreKnownChunks([restored]);
    assert.notEqual(runtime.chunks.get(targetId),before);

    gate.resolve(jsonResponse({source:'stale-restore',decisions:[legalChunkDecision(targetId,{strategy:'fortify'})]}));
    await pending;
    const after=runtime.chunks.get(targetId)!;
    assert.equal(after.strategy,'grow_settlement');
    assert.equal(after.food,33);
    assert.equal(after.decisionVersion,7);
    assert.equal(state.decisionBaselines.has(targetId),false);
    assert.equal(runtime.status().lastBatchSize,0);
  }finally{
    globalThis.fetch=originalFetch;
  }
});

test('materialize then unload while a request is pending still invalidates the stale reply',async()=>{
  const originalFetch=globalThis.fetch;
  try{
    const gate=deferred<Response>();
    let captured:ChunkDecisionRequest|undefined;
    globalThis.fetch=((_input:RequestInfo | URL,init?:RequestInit)=>{
      captured=JSON.parse(String(init?.body??'{}')) as ChunkDecisionRequest;
      return gate.promise;
    }) as typeof fetch;
    const runtime=new CoarseWorldRuntime(new THREE.Scene(),'materialize-generation',1_000);
    const state=internals(runtime);
    const pending=state.requestBatch(context);
    assert.ok(captured);
    const targetId=captured!.chunks[0]!.id;
    runtime.setMaterialized(targetId,true);
    runtime.setMaterialized(targetId,false);
    assert.equal(runtime.materialized.has(targetId),false);

    gate.resolve(jsonResponse({source:'stale-materialize',decisions:[legalChunkDecision(targetId,{strategy:'fortify'})]}));
    await pending;
    assert.equal(runtime.chunks.get(targetId)?.decisionVersion,0);
    assert.equal(runtime.chunks.get(targetId)?.strategy,'sustain');
    assert.equal(state.decisionBaselines.has(targetId),false);
  }finally{
    globalThis.fetch=originalFetch;
  }
});

test('region and world policies reject duplicate, unexpected and invalid replies and stale generations',async()=>{
  const originalFetch=globalThis.fetch;
  try{
    const runtime=new CoarseWorldRuntime(new THREE.Scene(),'region-world-validation',1_000);
    const state=internals(runtime);
    let capturedRegions:RegionDecisionRequest|undefined;
    globalThis.fetch=(async(input:RequestInfo | URL,init?:RequestInit)=>{
      assert.ok(String(input).endsWith('/api/world/regions/decide'));
      capturedRegions=JSON.parse(String(init?.body??'{}')) as RegionDecisionRequest;
      const ids=capturedRegions.regions.map(region=>region.id);
      assert.ok(ids.length>=3);
      return jsonResponse({
        source:'region-validation',
        decisions:[
          legalRegionDecision(ids[2]!),
          legalRegionDecision(ids[0]!,{priority:'not-a-priority'}),
          legalRegionDecision(ids[1]!,{priority:'food_security'}),
          legalRegionDecision(ids[1]!,{priority:'trade_network'}),
          legalRegionDecision('region_999_999')
        ]
      });
    }) as typeof fetch;
    await state.requestRegions(context);
    const ids=capturedRegions!.regions.map(region=>region.id);
    assert.equal(state.regionPolicies.has(ids[2]!),true);
    assert.equal(state.regionPolicies.has(ids[0]!),false);
    assert.equal(state.regionPolicies.has(ids[1]!),false,'duplicate region IDs must be rejected');
    assert.equal(state.regionPolicies.has('region_999_999'),false);

    const worldBefore=structuredClone(state.worldPolicy);
    globalThis.fetch=(async()=>jsonResponse({
      source:'world-invalid',
      decision:legalWorldDecision({growth:'not-a-growth-policy'})
    })) as typeof fetch;
    await state.requestWorld(context);
    assert.deepEqual(state.worldPolicy,worldBefore);

    globalThis.fetch=(async()=>jsonResponse({
      source:'world-valid',
      decision:legalWorldDecision({priority:'ecology',growth:'conserve'})
    })) as typeof fetch;
    await state.requestWorld(context);
    assert.equal(state.worldPolicy.priority,'ecology');
    assert.equal(state.worldPolicy.growth,'conserve');

    const regionGate=deferred<Response>();
    globalThis.fetch=((_input:RequestInfo | URL,init?:RequestInit)=>{
      capturedRegions=JSON.parse(String(init?.body??'{}')) as RegionDecisionRequest;
      return regionGate.promise;
    }) as typeof fetch;
    const staleRegion=state.requestRegions(context);
    const staleId=capturedRegions!.regions[0]!.id;
    const stalePrevious=state.regionPolicies.get(staleId);
    const anyChunk=[...runtime.chunks.values()][0]!;
    runtime.setMaterialized(anyChunk.id,true);
    runtime.setMaterialized(anyChunk.id,false);
    regionGate.resolve(jsonResponse({source:'stale-region',decisions:[legalRegionDecision(staleId,{priority:'security_coordination'})]}));
    await staleRegion;
    assert.deepEqual(state.regionPolicies.get(staleId),stalePrevious);

    const worldGate=deferred<Response>();
    globalThis.fetch=(()=>worldGate.promise) as typeof fetch;
    const staleWorld=state.requestWorld(context);
    const worldAtRequest=structuredClone(state.worldPolicy);
    runtime.restoreKnownChunks([structuredClone(anyChunk)]);
    worldGate.resolve(jsonResponse({source:'stale-world',decision:legalWorldDecision({priority:'security'})}));
    await staleWorld;
    assert.deepEqual(state.worldPolicy,worldAtRequest);
  }finally{
    globalThis.fetch=originalFetch;
  }
});

test('network rejection clears pending state without mutating chunk decisions or baselines',async()=>{
  const originalFetch=globalThis.fetch;
  try{
    globalThis.fetch=(async()=>{throw new Error('injected rejection');}) as typeof fetch;
    const runtime=new CoarseWorldRuntime(new THREE.Scene(),'request-rejection',1_000);
    const state=internals(runtime);
    const versions=new Map([...runtime.chunks].map(([id,chunk])=>[id,chunk.decisionVersion]));
    await state.requestBatch(context);
    assert.equal(state.pending,false);
    assert.equal(runtime.status().lastSource,'offline');
    assert.equal(runtime.status().lastBatchSize,0);
    assert.equal(state.decisionBaselines.size,0);
    for(const [id,version] of versions)assert.equal(runtime.chunks.get(id)?.decisionVersion,version);
  }finally{
    globalThis.fetch=originalFetch;
  }
});
