import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CoarseWorldRuntime } from '../src/world/coarseWorld.js';
import type { ChunkDecisionRequest, RegionDecisionRequest, WorldDecisionRequest } from '../src/types.js';

const context={day:4,gameTime:'11:30',weather:'clear',dt:0};
const channels=['chunks','regions','strategy'] as const;
type Channel=typeof channels[number];
type Body=ChunkDecisionRequest | RegionDecisionRequest | WorldDecisionRequest;
interface Internals {
  pending:boolean;
  regionPending:boolean;
  worldPending:boolean;
  nextDecisionAt:number;
  nextRegionDecisionAt:number;
  nextWorldDecisionAt:number;
  decisionContextController:AbortController;
  decisionBaselines:Map<string,unknown>;
  regionPolicies:Map<string,unknown>;
  worldPolicy:unknown;
  requestBatch(ctx:typeof context):Promise<void>;
  requestRegions(ctx:typeof context):Promise<void>;
  requestWorld(ctx:typeof context):Promise<void>;
}
const stateOf=(runtime:CoarseWorldRuntime)=>runtime as unknown as Internals;
const pendingOf=(state:Internals)=>[state.pending,state.regionPending,state.worldPending];
const retryAt=(state:Internals)=>[state.nextDecisionAt,state.nextRegionDecisionAt,state.nextWorldDecisionAt];
const requestAll=(state:Internals)=>Promise.all([
  state.requestBatch(context),state.requestRegions(context),state.requestWorld(context)
]);
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));

function deferred<T>() {
  let resolve!:(value:T)=>void;
  let reject!:(reason:unknown)=>void;
  const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}

function clock(t:TestContext) {
  let now=0,id=0;
  const active=new Map<number,{at:number;run:()=>void}>();
  const callbacks:Array<()=>void>=[];
  t.mock.method(performance,'now',()=>now);
  t.mock.method(globalThis,'setTimeout',(run:()=>void,ms:number)=>{
    callbacks.push(run);
    active.set(++id,{at:now+ms,run});
    return id;
  });
  t.mock.method(globalThis,'clearTimeout',(timer:number)=>{active.delete(timer);});
  return {
    active,callbacks,now:()=>now,
    advance(ms:number) {
      now+=ms;
      for(const [key,timer] of [...active])if(timer.at<=now){active.delete(key);timer.run();}
    }
  };
}

function result(channel:Channel,body:Body,source:string) {
  const shared={confidence:.8,reasonCode:'cancellation_contract',source};
  if(channel==='chunks')return {
    source,decisions:(body as ChunkDecisionRequest).chunks.map(chunk=>({
      chunkId:chunk.id,strategy:source==='stale'?'extract_resources':'fortify',
      migrationPolicy:'retain',ecologyPolicy:'protect',...shared
    }))
  };
  if(channel==='regions')return {
    source,decisions:(body as RegionDecisionRequest).regions.map(region=>({
      regionId:region.id,priority:source==='stale'?'security_coordination':'food_security',
      movementPolicy:'stabilize',ecologyPolicy:'balanced_use',...shared
    }))
  };
  return {
    source,decision:{priority:source==='stale'?'security':'prosperity',connectivity:'balanced_networks',growth:'steady',...shared}
  };
}
function response(value:unknown) {return {ok:true,json:async()=>value} as Response;}
function requestInfo(input:RequestInfo | URL,init?:RequestInit) {
  const channel=channels.find(channel=>String(input).endsWith(`/api/world/${channel}/decide`));
  assert.ok(channel,`unexpected URL ${String(input)}`);
  assert.ok(init?.signal);
  return {channel,body:JSON.parse(String(init.body)) as Body,signal:init.signal};
}
function holdRequests(t:TestContext,stage:'fetch'|'json') {
  const held:Array<ReturnType<typeof requestInfo> & {
    fetchGate:ReturnType<typeof deferred<Response>>;
    jsonGate:ReturnType<typeof deferred<unknown>>;
    enteredJson:boolean;
  }>=[];
  t.mock.method(globalThis,'fetch',(input:RequestInfo | URL,init?:RequestInit)=>{
    const entry={...requestInfo(input,init),fetchGate:deferred<Response>(),jsonGate:deferred<unknown>(),enteredJson:false};
    held.push(entry);
    if(stage==='fetch')return entry.fetchGate.promise;
    return Promise.resolve({ok:true,json:()=>{entry.enteredJson=true;return entry.jsonGate.promise;}} as Response);
  });
  return {
    held,
    resolve(source:string) {
      for(const entry of held){
        const value=result(entry.channel,entry.body,source);
        if(stage==='fetch')entry.fetchGate.resolve({ok:true,json:async()=>{entry.enteredJson=true;return value;}} as Response);
        else entry.jsonGate.resolve(value);
      }
    }
  };
}
async function seed(t:TestContext,runtime:CoarseWorldRuntime) {
  t.mock.method(globalThis,'fetch',async(input:RequestInfo | URL,init?:RequestInit)=>{
    const {channel,body}=requestInfo(input,init);
    return response(result(channel,body,'seed-provider'));
  });
  await requestAll(stateOf(runtime));
  assert.equal(runtime.status().lastSource,'seed-provider');
}
function authority(runtime:CoarseWorldRuntime) {
  const state=stateOf(runtime);
  const {lastSource,lastBatchSize,requestTimeouts}=runtime.status();
  return structuredClone({
    chunks:[...runtime.chunks],baselines:[...state.decisionBaselines],
    regions:[...state.regionPolicies],world:state.worldPolicy,lastSource,lastBatchSize,requestTimeouts
  });
}

for(const stage of ['fetch','json'] as const)for(const transition of ['materialize-unload','restore'] as const){
  test(`${transition} cancels all three ${stage} stalls and late work cannot own a retry`,async t=>{
    const timer=clock(t);
    const runtime=new CoarseWorldRuntime(new THREE.Scene(),`cancel-${stage}-${transition}`);
    const state=stateOf(runtime);
    await seed(t,runtime);
    assert.equal(timer.active.size,0,'success cleans up its deadlines');
    const old=holdRequests(t,stage);
    let finished=false;
    const cancelled=requestAll(state).then(()=>{finished=true;});
    await flush();
    assert.equal(old.held.length,3);
    if(stage==='json')assert.ok(old.held.every(entry=>entry.enteredJson));
    const requestedIds=new Set((old.held.find(entry=>entry.channel==='chunks')!.body as ChunkDecisionRequest).chunks.map(chunk=>chunk.id));
    const outsideBatch=[...runtime.chunks.values()].find(chunk=>!requestedIds.has(chunk.id))!;
    assert.ok(outsideBatch,'invalidate using a chunk outside the captured batch');
    const oldContext=state.decisionContextController?.signal;
    const remove=oldContext?t.mock.method(oldContext,'removeEventListener'):undefined;
    const oldCallbacks=timer.callbacks.slice(-3);
    timer.advance(7_999);
    if(transition==='materialize-unload'){
      runtime.setMaterialized(outsideBatch.id,true);
      runtime.setMaterialized(outsideBatch.id,false);
    }else{
      runtime.restoreKnownChunks([{...structuredClone(outsideBatch),food:33,decisionVersion:7}]);
    }
    const afterTransition=authority(runtime);
    assert.ok(old.held.every(entry=>entry.signal.aborted),'every channel aborts synchronously');
    assert.equal(timer.active.size,0,'obsolete deadlines are removed before 8 seconds');
    assert.deepEqual(pendingOf(state),[true,true,true],'pending stays owned until the old finally');
    runtime.update(context);
    assert.equal(old.held.length,3,'update cannot start a replacement before old finally');
    await flush();
    assert.equal(finished,true,'abort-ignoring fetch/json must settle without its deadline');
    await cancelled;
    assert.deepEqual(pendingOf(state),[false,false,false]);
    assert.equal(remove?.mock.callCount(),3,'each cancelled request removes its context listener');
    assert.deepEqual(retryAt(state),[timer.now()+15_000,timer.now()+45_000,timer.now()+120_000]);
    timer.advance(1);
    for(const run of oldCallbacks)run();
    assert.deepEqual(authority(runtime),afterTransition,'cancellation is not an offline/network result');
    runtime.update(context);
    assert.equal(old.held.length,3,'cancellation does not trigger immediate replacement requests');
    timer.advance(120_000);
    const fresh=holdRequests(t,stage);
    runtime.update(context);
    await flush();
    assert.equal(fresh.held.length,3,'normal schedules permit one retry per channel');
    assert.deepEqual(pendingOf(state),[true,true,true]);
    const nextBefore=retryAt(state);
    old.resolve('stale');
    await flush();
    if(stage==='fetch')assert.ok(old.held.every(entry=>!entry.enteredJson),'cancelled late responses must not parse their body');
    assert.deepEqual(pendingOf(state),[true,true,true],'late old work cannot clear new pending flags');
    assert.deepEqual(retryAt(state),nextBefore,'late old work cannot reschedule a new owner');
    assert.deepEqual(authority(runtime),afterTransition,'late old bodies cannot mutate any authority');
    assert.equal(timer.active.size,3,'late old cleanup cannot clear new deadlines');
    fresh.resolve('fresh-provider');
    await flush();
    assert.deepEqual(pendingOf(state),[false,false,false]);
    assert.equal(runtime.status().lastSource,'fresh-provider');
    assert.ok(runtime.status().lastBatchSize>0);
    assert.ok([...state.regionPolicies.values()].some(policy=>(policy as {source:string}).source==='fresh-provider'));
    assert.equal((state.worldPolicy as {source:string}).source,'fresh-provider');
    assert.equal(runtime.status().requestTimeouts,0);
    assert.equal(timer.active.size,0);
  });
}

for(const stage of ['fetch','json'] as const)for(const invalidateAfterTimeout of [false,true]){
  test(`current ${stage} stalls count real 8 s deadlines${invalidateAfterTimeout?' before same-turn invalidation':''}`,async t=>{
    const timer=clock(t);
    const runtime=new CoarseWorldRuntime(new THREE.Scene(),`timeout-${stage}-${invalidateAfterTimeout}`);
    const state=stateOf(runtime);
    await seed(t,runtime);
    const before=authority(runtime);
    const stalled=holdRequests(t,stage);
    const pending=requestAll(state);
    await flush();
    timer.advance(7_999);
    assert.equal(runtime.status().requestTimeouts,0);
    assert.ok(stalled.held.every(entry=>!entry.signal.aborted));
    timer.advance(1);
    assert.equal(runtime.status().requestTimeouts,3,'deadline must count when it wins, before its continuation');
    assert.ok(stalled.held.every(entry=>entry.signal.aborted));
    if(invalidateAfterTimeout)runtime.setMaterialized([...runtime.chunks.keys()][0]!,true);
    await pending;
    assert.deepEqual(pendingOf(state),[false,false,false]);
    assert.equal(runtime.status().requestTimeouts,3);
    assert.equal(runtime.status().lastSource,invalidateAfterTimeout?'seed-provider':'offline');
    assert.equal(runtime.status().lastBatchSize,invalidateAfterTimeout?before.lastBatchSize:0);
    const after=authority(runtime);
    assert.deepEqual(after.chunks,before.chunks);
    assert.deepEqual(after.baselines,before.baselines);
    assert.deepEqual(after.regions,before.regions);
    assert.deepEqual(after.world,before.world);
    assert.deepEqual(retryAt(state),[23_000,53_000,128_000]);
    assert.equal(timer.active.size,0);
    stalled.resolve('stale');
    await flush();
    if(stage==='fetch')assert.ok(stalled.held.every(entry=>!entry.enteredJson),'timed-out late responses must not parse their body');
    assert.deepEqual(authority(runtime),after,'responses after real timeout cannot later apply');
  });
}

test('no-op transitions preserve live requests and successful work detaches cancellation listeners',async t=>{
  const timer=clock(t);
  const runtime=new CoarseWorldRuntime(new THREE.Scene(),'no-op-cancellation');
  const state=stateOf(runtime);
  const oldContext=state.decisionContextController.signal;
  const remove=t.mock.method(oldContext,'removeEventListener');
  const live=holdRequests(t,'json');
  const pending=requestAll(state);
  await flush();
  runtime.setMaterialized('missing-chunk',true);
  runtime.setMaterialized([...runtime.chunks.keys()][0]!,false);
  runtime.restoreKnownChunks([]);
  assert.equal(state.decisionContextController.signal,oldContext);
  assert.ok(live.held.every(entry=>!entry.signal.aborted));
  assert.equal(timer.active.size,3);
  live.resolve('fresh-provider');
  await pending;
  assert.equal(runtime.status().lastSource,'fresh-provider');
  assert.equal(remove.mock.callCount(),3);
  assert.equal(timer.active.size,0);
  runtime.setMaterialized([...runtime.chunks.keys()][0]!,true);
  assert.ok(live.held.every(entry=>!entry.signal.aborted),'settled requests no longer listen to context abort');
  for(const run of timer.callbacks)run();
  assert.equal(runtime.status().requestTimeouts,0,'settled deadlines cannot become timeouts');
});

for(const failure of ['network','http','json'] as const){
  test(`current ${failure} failures retain offline fallback without counting a timeout`,async t=>{
    const timer=clock(t);
    const runtime=new CoarseWorldRuntime(new THREE.Scene(),`failure-${failure}`);
    const state=stateOf(runtime);
    await seed(t,runtime);
    const before=authority(runtime);
    t.mock.method(globalThis,'fetch',async()=>{
      if(failure==='network')throw new Error('network failure');
      return {ok:failure!=='http',json:async()=>{throw new Error('JSON failure');}} as unknown as Response;
    });
    await requestAll(state);
    const after=authority(runtime);
    assert.deepEqual(pendingOf(state),[false,false,false]);
    assert.equal(after.lastSource,'offline');
    assert.equal(after.lastBatchSize,0);
    assert.equal(after.requestTimeouts,0);
    assert.deepEqual(after.chunks,before.chunks);
    assert.deepEqual(after.baselines,before.baselines);
    assert.deepEqual(after.regions,before.regions);
    assert.deepEqual(after.world,before.world);
    assert.deepEqual(retryAt(state),[15_000,45_000,120_000]);
    assert.equal(timer.active.size,0);
  });
}

for(const stage of ['fetch','json'] as const){
  test(`late cancelled ${stage} rejection cannot overwrite a successful retry`,async t=>{
    const timer=clock(t);
    const runtime=new CoarseWorldRuntime(new THREE.Scene(),`late-rejection-${stage}`);
    const state=stateOf(runtime);
    const old=holdRequests(t,stage);
    const cancelled=requestAll(state);
    await flush();
    runtime.setMaterialized([...runtime.chunks.keys()][0]!,true);
    await flush();
    assert.deepEqual(pendingOf(state),[false,false,false]);
    await cancelled;
    timer.advance(120_000);
    const fresh=holdRequests(t,stage);
    runtime.update(context);
    await flush();
    assert.equal(fresh.held.length,3);
    fresh.resolve('fresh-provider');
    await flush();
    assert.equal(runtime.status().lastSource,'fresh-provider');
    const before=authority(runtime),nextBefore=retryAt(state);
    for(const entry of old.held){
      if(stage==='fetch')entry.fetchGate.reject(new Error('late stale network failure'));
      else entry.jsonGate.reject(new Error('late stale JSON failure'));
    }
    await flush();
    assert.deepEqual(authority(runtime),before);
    assert.deepEqual(retryAt(state),nextBefore);
    assert.deepEqual(pendingOf(state),[false,false,false]);
    assert.equal(timer.active.size,0);
  });
}
