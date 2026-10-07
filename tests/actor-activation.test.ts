import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CoarseWorldRuntime} from '../src/world/coarseWorld.js';
import {createStreamedLayout} from '../src/world/streamedLayouts.js';
import {streamedUnitOwnerCells} from '../src/world/streamedUnits.js';
import {projectFineActors} from '../src/world/actorGeneration.js';
import {prepareFirstActors,selectPendingActors} from '../src/world/actorActivation.js';
import {WorldPersistence} from '../server/worldPersistence.js';
import type {ActorContact} from '../src/world/actorPlacement.js';
import type {PersistedWildlifeTransfer,WildlifeLineageRecord} from '../src/types.js';

function input(){
  const world=new CoarseWorldRuntime(new THREE.Scene()),cells=streamedUnitOwnerCells(1,0).map(c=>world.ensureChunk(c.cx,c.cz)!);
  const chunk=structuredClone(cells[4]);Object.assign(chunk,{population:6,settlementLevel:1,wildlife:[{species:'sheep',count:8,carryingCapacity:12,health:90}]});
  const layout=createStreamedLayout(1,0,cells,[]).layout,randomness={version:1 as const,seed:'latticefolk-default'};
  const contact:ActorContact={blocked:()=>false,static:[],dynamic:[],player:{x:0,z:7}};
  const transfer:PersistedWildlifeTransfer={entityId:'incoming',fromChunkId:'chunk_2_0',toChunkId:chunk.id,representedPopulation:1,transferredDay:4,
    state:{id:'incoming',chunkId:chunk.id,species:'sheep',position:{x:chunk.cx*24,z:chunk.cz*24},ageDays:20,health:90,hunger:20,thirst:20,energy:80,
      sex:'female',generation:0,traits:{size:2.8,speed:2,fertility:.7,wariness:.5},currentAction:'migrate',lastDecisionAt:0,birthDay:1,randomEventCursor:17}};
  return {chunk,layout,randomness,contact,transfer,lineage:new Map<string,WildlifeLineageRecord>()};
}
test('first-owner preflight is repeatable and leaves all input, population, lineage and cursors untouched',()=>{
  const f=input(),before=structuredClone({chunk:f.chunk,layout:f.layout,transfer:f.transfer,lineage:f.lineage});
  const ambient=Math.random;Math.random=()=>{throw Error('ambient draw');};
  try{
    const left=prepareFirstActors(f.chunk,f.layout,f.randomness,4,[f.transfer],f.lineage,f.contact);
    const right=prepareFirstActors(f.chunk,f.layout,f.randomness,4,[f.transfer],f.lineage,f.contact);
    assert.ok(left);assert.deepEqual(left,right);assert.equal(left.pending.length,1);
    for(const actor of [...left.npcs.map(n=>n.state),...left.wildlife])assert.equal(actor.randomEventCursor,undefined);
    assert.equal(left.pending[0].transfer.state.randomEventCursor,17);
    assert.deepEqual({chunk:f.chunk,layout:f.layout,transfer:f.transfer,lineage:f.lineage},before);
  }finally{Math.random=ambient;}
});
test('a last pending member without space defers the whole otherwise-placeable founding batch',()=>{
  const f=input(),radii:number[]=[],before=structuredClone(f.transfer);
  f.contact.blocked=(_x,_z,radius)=>{radii.push(radius);return radius>=.48-1e-12;};
  assert.equal(prepareFirstActors(f.chunk,f.layout,f.randomness,4,[f.transfer],f.lineage,f.contact),undefined);
  assert.ok(radii.includes(.32));assert.equal(radii.filter(r=>r>=.48-1e-12).length,60);
  assert.deepEqual(f.transfer,before);assert.equal(f.lineage.size,0);assert.equal(f.chunk.wildlife![0].count,8);
  f.contact.blocked=()=>false;assert.ok(prepareFirstActors(f.chunk,f.layout,f.randomness,4,[f.transfer],f.lineage,f.contact));
});
test('numeric NPC slot reservations preserve prior members when a later slot joins',()=>{
  const f=input();f.contact.blocked=()=>false;
  f.chunk.population=4;const smaller=prepareFirstActors(f.chunk,f.layout,f.randomness,4,[],f.lineage,f.contact)!;
  f.chunk.population=6;const larger=prepareFirstActors(f.chunk,f.layout,f.randomness,4,[],f.lineage,f.contact)!;
  assert.deepEqual(larger.npcs.slice(0,4),smaller.npcs);assert.deepEqual(larger.wildlife,smaller.wildlife);
  for(let i=0;i<larger.npcs.length;i++)for(let j=i+1;j<larger.npcs.length;j++)assert.ok(Math.hypot(
    larger.npcs[i].state.position.x-larger.npcs[j].state.position.x,larger.npcs[i].state.position.z-larger.npcs[j].state.position.z)>=.64-1e-12);
});
test('queued authoritative identity replaces its exact founder slot once without settling population',()=>{
  const f=input(),plan=projectFineActors(f.chunk,f.layout,f.randomness),id=plan.wildlife[0].id;
  f.transfer.entityId=id;f.transfer.state.id=id;
  const result=prepareFirstActors(f.chunk,f.layout,f.randomness,4,[f.transfer],f.lineage,f.contact)!;
  assert.equal(result.pending.length,1);assert.equal(result.pending[0].transfer.entityId,id);
  assert.equal(result.wildlife.some(a=>a.id===id),false);assert.equal(result.wildlife.length,plan.wildlife.length-1);
  assert.equal(f.chunk.wildlife![0].count,8);assert.equal(f.transfer.state.randomEventCursor,17);
});
for(const reason of ['tiny-weight','quota-exhausted','other-destination'])test(`${reason}: every valid queued identity is reserved even when not selected for this owner`,()=>{
  const f=input(),plan=projectFineActors(f.chunk,f.layout,f.randomness),id=plan.wildlife[0].id;
  f.transfer.entityId=id;f.transfer.state.id=id;
  const transfers=[f.transfer];
  if(reason==='tiny-weight')f.transfer.representedPopulation=.005;
  if(reason==='quota-exhausted'){
    f.chunk.wildlife![0].count=1;const earlier=structuredClone(f.transfer);earlier.entityId='earlier';earlier.state.id='earlier';earlier.transferredDay=3;transfers.push(earlier);
  }
  if(reason==='other-destination'){
    f.transfer.fromChunkId=f.chunk.id;f.transfer.toChunkId='chunk_4_0';f.transfer.state.chunkId='chunk_4_0';
  }
  const before=structuredClone(transfers),store=new WorldPersistence(':memory:');
  try{
    store.save({version:1,meta:{day:4,minuteOfDay:400,weather:'clear',playerPosition:{x:0,z:7},playerInventory:{apple:0,bread:0,wood:0,coin:0,flower:0,grain:0,flour:0,water:0,stone:0,plank:0,tool:0}},
      coarseChunks:[f.chunk],fineChunks:[],homeNpcs:[],homeObjects:[],wildlifeTransfers:transfers},0);
    assert.equal(store.load()!.wildlifeTransfers!.find(t=>t.entityId===id)!.state.randomEventCursor,17);
    const result=prepareFirstActors(f.chunk,f.layout,f.randomness,4,transfers,f.lineage,f.contact)!;
    assert.ok(result);assert.equal(result.wildlife.some(a=>a.id===id),false);assert.equal(result.pending.some(a=>a.transfer.entityId===id),false);
    assert.deepEqual(transfers,before);
  }finally{store.close();}
});
test('pending selection honors dead records, fixed represented population and stable queue order',()=>{
  const f=input(),later=structuredClone(f.transfer);later.entityId='later';later.state.id='later';later.transferredDay=5;
  f.chunk.wildlife![0].count=1.5;
  assert.deepEqual(selectPendingActors(f.chunk,[later,f.transfer],f.lineage).map(x=>[x.transfer.entityId,x.weight]),[['incoming',1],['later',.5]]);
  f.lineage.set('fixed',{entityId:'fixed',species:'sheep'} as any);
  assert.deepEqual(selectPendingActors(f.chunk,[later,f.transfer],f.lineage,new Map([['fixed',1]])).map(x=>[x.transfer.entityId,x.weight]),[['incoming',.5]]);
  f.lineage.set('incoming',{entityId:'incoming',species:'sheep',deathDay:4} as any);
  assert.deepEqual(selectPendingActors(f.chunk,[later,f.transfer],f.lineage).map(x=>x.transfer.entityId),['later']);
});
test('an exhausted incoming cursor rejects before any accepted owner state exists',()=>{
  const f=input();f.transfer.state.randomEventCursor=Number.MAX_SAFE_INTEGER;const before=structuredClone(f.transfer);
  assert.throws(()=>prepareFirstActors(f.chunk,f.layout,f.randomness,4,[f.transfer],f.lineage,f.contact),/cursor exhausted/);
  assert.deepEqual(f.transfer,before);assert.equal(f.lineage.size,0);
});
