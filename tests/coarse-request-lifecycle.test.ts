import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import type {
  ChunkDecisionRequest, RegionDecisionRequest, WorldDecisionRequest
} from '../src/types.js';
import { CoarseWorldRuntime } from '../src/world/coarseWorld.js';

const context={day:4,gameTime:'11:30',weather:'clear',dt:0};

interface RequestInternals {
  pending:boolean;
  regionPending:boolean;
  worldPending:boolean;
  requestBatch(ctx:typeof context):Promise<void>;
  requestRegions(ctx:typeof context):Promise<void>;
  requestWorld(ctx:typeof context):Promise<void>;
}

test('coarse decision requests time out, abort and recover without locking pending state',async()=>{
  const originalFetch=globalThis.fetch;
  try{
    const signals:AbortSignal[]=[];
    let blockedCalls=0;
    globalThis.fetch=((_input:RequestInfo | URL,init?:RequestInit)=>{
      blockedCalls++;
      if(init?.signal)signals.push(init.signal);
      return new Promise<Response>(()=>{});
    }) as typeof fetch;

    const runtime=new CoarseWorldRuntime(new THREE.Scene(),'request-lifecycle-timeout',25);
    const internals=runtime as unknown as RequestInternals;
    const started=Date.now();
    await Promise.all([
      internals.requestBatch(context),
      internals.requestRegions(context),
      internals.requestWorld(context)
    ]);
    assert.ok(Date.now()-started<1_000,'bounded request deadline should release callers promptly');
    assert.equal(blockedCalls,3);
    assert.equal(signals.length,3);
    assert.ok(signals.every(signal=>signal.aborted),'deadline must abort every in-flight request');
    assert.equal(internals.pending,false);
    assert.equal(internals.regionPending,false);
    assert.equal(internals.worldPending,false);
    assert.equal(runtime.status().requestTimeouts,3);

    let retryCalls=0;
    globalThis.fetch=(async(input:RequestInfo | URL,init?:RequestInit)=>{
      retryCalls++;
      const url=String(input);
      const parsed=JSON.parse(String(init?.body??'{}')) as ChunkDecisionRequest | RegionDecisionRequest | WorldDecisionRequest;
      let payload:unknown;
      if(url.endsWith('/api/world/chunks/decide')){
        const body=parsed as ChunkDecisionRequest;
        payload={
          source:'timeout-retry',
          decisions:body.chunks.map(chunk=>({
            chunkId:chunk.id,
            strategy:'sustain',
            migrationPolicy:'retain',
            ecologyPolicy:'balance',
            confidence:.8,
            reasonCode:'timeout_retry',
            source:'timeout-retry'
          }))
        };
      }else if(url.endsWith('/api/world/regions/decide')){
        const body=parsed as RegionDecisionRequest;
        payload={
          source:'timeout-retry',
          decisions:body.regions.map(region=>({
            regionId:region.id,
            priority:'balanced',
            movementPolicy:'stabilize',
            ecologyPolicy:'balanced_use',
            confidence:.8,
            reasonCode:'timeout_retry',
            source:'timeout-retry'
          }))
        };
      }else if(url.endsWith('/api/world/strategy/decide')){
        payload={
          source:'timeout-retry',
          decision:{
            priority:'prosperity',
            connectivity:'balanced_networks',
            growth:'steady',
            confidence:.8,
            reasonCode:'timeout_retry',
            source:'timeout-retry'
          }
        };
      }else{
        throw new Error(`unexpected request ${url}`);
      }
      return new Response(JSON.stringify(payload),{status:200,headers:{'content-type':'application/json'}});
    }) as typeof fetch;

    await Promise.all([
      internals.requestBatch(context),
      internals.requestRegions(context),
      internals.requestWorld(context)
    ]);
    assert.equal(retryCalls,3,'one legal retry per request layer is sufficient');
    assert.equal(internals.pending,false);
    assert.equal(internals.regionPending,false);
    assert.equal(internals.worldPending,false);
    const status=runtime.status();
    assert.equal(status.requestTimeouts,3);
    assert.equal(status.lastSource,'timeout-retry');
    assert.ok(status.lastBatchSize>0);
    assert.ok(status.regionDecisions>0);
    assert.equal(status.worldPriority,'prosperity');
  }finally{
    globalThis.fetch=originalFetch;
  }
});
