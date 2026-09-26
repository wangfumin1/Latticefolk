import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import type { ChunkMigrationPolicy } from '../src/types.js';
import { CoarseWorldRuntime } from '../src/world/coarseWorld.js';

function world() {
  const runtime=new CoarseWorldRuntime(new THREE.Scene(),'population-conservation');
  // Keep external policy IO out of deterministic simulation tests; do not stub the tick or flows.
  const requests=runtime as unknown as {pending:boolean;regionPending:boolean;worldPending:boolean};
  requests.pending=true;
  requests.regionPending=true;
  requests.worldPending=true;
  return runtime;
}
const context={day:3,gameTime:'10:30',weather:'clear',dt:1};
const close=(actual:number,expected:number)=>
  assert.ok(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);

for(const policy of ['retain','attract','release','evacuate'] satisfies ChunkMigrationPolicy[]){
  test(`${policy}: isolated coarse ticks cannot create or remove residents`,()=>{
    const runtime=world();
    const fixtures=[0,1.1234,130.1234].flatMap((population,i)=>[true,false].map((viable,j)=>{
      const chunk=runtime.ensureChunk(100+i*3,100+j*3)!;
      Object.assign(chunk,{population,migrationPolicy:policy,strategy:'sustain',
        food:viable?90:5,water:viable?90:5,danger:viable?0:90,prosperity:40});
      return {chunk,population,water:chunk.water};
    }));
    for(let i=0;i<6;i++)runtime.update(context);
    for(const {chunk,population,water} of fixtures){
      assert.equal(chunk.population,population,`${policy} without a neighbor changed population`);
      assert.notEqual(chunk.water,water,'actual coarse simulation must still execute');
      assert.ok(!runtime.flowHistory(120).some(flow=>flow.fromChunkId===chunk.id||flow.toChunkId===chunk.id));
    }
  });
}

test('runtime policy-driven migration changes only paired balances with matching provenance',()=>{
  const runtime=world();
  const source=runtime.ensureChunk(100,100)!;
  const target=runtime.ensureChunk(101,100)!;
  Object.assign(source,{population:30.1234,migrationPolicy:'evacuate',food:20,water:20,danger:80,prosperity:15,strategy:'sustain'});
  Object.assign(target,{population:10.4321,migrationPolicy:'attract',food:90,water:90,danger:0,prosperity:80,strategy:'sustain'});
  const beforeSource=source.population,beforeTarget=target.population;
  runtime.update({...context,dt:5});
  const receipts=runtime.flowHistory(120).filter(flow=>flow.kind==='migration'&&flow.fromChunkId===source.id&&flow.toChunkId===target.id);
  assert.equal(receipts.length,1);
  const amount=receipts[0]!.amount;
  assert.ok(amount>0);
  assert.equal(receipts[0]!.day,3);
  assert.equal(receipts[0]!.minuteOfDay,630);
  assert.equal(receipts[0]!.reason,'evacuate_to_attract');
  close(source.population+target.population,beforeSource+beforeTarget);
  close(beforeSource-source.population,amount);
  close(target.population-beforeTarget,amount);
});

test('materialized neighbors are excluded from coarse migration without a local population sink',()=>{
  const runtime=world();
  const source=runtime.ensureChunk(100,100)!;
  const target=runtime.ensureChunk(101,100)!;
  Object.assign(source,{population:30.1234,migrationPolicy:'evacuate',food:20,water:20,danger:80,prosperity:15,strategy:'sustain'});
  Object.assign(target,{population:10.4321,migrationPolicy:'attract',food:90,water:90,danger:0,prosperity:80,strategy:'sustain'});
  runtime.setMaterialized(target.id,true);
  for(let i=0;i<10;i++)runtime.update(context);
  assert.equal(source.population,30.1234);
  assert.equal(target.population,10.4321);
  assert.ok(!runtime.flowHistory(120).some(flow=>flow.fromChunkId===source.id||flow.toChunkId===source.id));
});
