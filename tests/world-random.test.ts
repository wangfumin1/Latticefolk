import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import * as THREE from 'three';
import {CoarseWorldRuntime} from '../src/world/coarseWorld.js';
import {planFineChunk} from '../src/world/materialization.js';
import {beginRandomEvent,DEFAULT_WORLD_SEED,fineLayoutKey,hashText,keyedRandom,randomEventCursor,randomFromKey,readWorldRandomness} from '../src/world/worldRandom.js';

const randomness=readWorldRandomness(undefined);
const draws=(random:()=>number)=>Array.from({length:4},random);
test('FNV-1a and Mulberry32 retain fixed vectors',()=>{
  assert.equal(hashText(''),2166136261);assert.equal(hashText('latticefolk-default'),2464132743);assert.equal(hashText('雪'),1847958269);
  assert.deepEqual(draws(randomFromKey('chunk_2_-1')),[.1493847754318267,.2601802428252995,.22306380048394203,.2865996777545661]);
});
test('keyed streams distinguish seed, domain, actor and tuple boundaries',()=>{
  const base=draws(keyedRandom(randomness,'work','a',3));
  assert.deepEqual(draws(keyedRandom(randomness,'work','a',3)),base);
  for(const random of [keyedRandom({...randomness,seed:'other'},'work','a',3),keyedRandom(randomness,'harvest','a',3),keyedRandom(randomness,'work','b',3),keyedRandom(randomness,'work','a',4)])assert.notDeepEqual(draws(random),base);
  assert.notDeepEqual(draws(keyedRandom(randomness,'a:b','c')),draws(keyedRandom(randomness,'a','b:c')));
  const random=keyedRandom(randomness,'range');for(let i=0;i<10000;i++){const value=random();assert.ok(value>=0&&value<1);}
});
test('event-local rejection draws and unrelated actors cannot shift the next event',()=>{
  const a={id:'a',randomEventCursor:7},b={...a};
  const first=beginRandomEvent(randomness,a,'path');for(let i=0;i<120;i++)first();
  beginRandomEvent(randomness,b,'path')();
  const unrelated={id:'b'};for(let i=0;i<20;i++)beginRandomEvent(randomness,unrelated,'path')();
  assert.equal(a.randomEventCursor,8);assert.deepEqual(draws(beginRandomEvent(randomness,a,'work')),draws(beginRandomEvent(randomness,b,'work')));
});
for(const value of [null,'0',-1,.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])test(`invalid cursor ${String(value)} is rejected without mutation`,()=>{
  const state={id:'a',randomEventCursor:value as number};assert.throws(()=>beginRandomEvent(randomness,state,'work'));assert.equal(state.randomEventCursor,value);
});
test('legacy default and exhausted cursor are explicit',()=>{
  assert.equal(randomEventCursor(undefined),0);assert.deepEqual(randomness,{version:1,seed:DEFAULT_WORLD_SEED});
  const state={id:'a',randomEventCursor:Number.MAX_SAFE_INTEGER};assert.throws(()=>beginRandomEvent(randomness,state,'work'));assert.equal(state.randomEventCursor,Number.MAX_SAFE_INTEGER);
});
for(const value of [null,{},[],{version:2,seed:'s'},{version:'1',seed:'s'},{version:1,seed:17},{version:1,seed:''},{version:1,seed:' '},{version:1,seed:'x'.repeat(257)}])test(`invalid random metadata ${JSON.stringify(value)} is rejected`,()=>assert.throws(()=>readWorldRandomness(value)));
test('default coarse states and every fine plan match the pre-RNG source values',()=>{
  // Compare in the historical coordinate order; 72m streaming now inserts by unit.
  // Digests of the 72 complete states/plans from 91f61f7b86f06f84203d4dee7cb12b61155b1922.
  const world=new CoarseWorldRuntime(new THREE.Scene());const chunks=[...world.chunks.values()].sort((a,b)=>a.cz-b.cz||a.cx-b.cx);
  const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  assert.equal(chunks.length,72);
  assert.equal(digest(chunks),'43cc40fc21e0e50a5f7ec1cec0d3ca71ce8465437fb97132b2f68b3a80770a16');
  assert.equal(digest(chunks.map(chunk=>planFineChunk(chunk,world.chunkSize))),'404f61b4d1c6485c3c9f98004000afcfb04802ef8d43ae4e3d29dd1903719c8f');
  assert.equal(fineLayoutKey(DEFAULT_WORLD_SEED,'chunk_2_-1'),'chunk_2_-1');
  const alternate=new CoarseWorldRuntime(new THREE.Scene(),'other');assert.notDeepEqual([...alternate.chunks.values()],chunks);
  const chunk=chunks.find(chunk=>chunk.settlementLevel>0)!;
  assert.deepEqual(planFineChunk(chunk,24,'other'),planFineChunk(chunk,24,'other'));assert.notDeepEqual(planFineChunk(chunk,24,'other'),planFineChunk(chunk,24));
});

test('alternate seeds preserve the existing road axes at both supported layout scales',()=>{
 const world=new CoarseWorldRuntime(new THREE.Scene());
 for(const chunk of world.chunks.values())for(const size of [24,72]){
  const roads=planFineChunk(chunk,size).roads;
  for(const seed of ['a','world-2','custom','saved-alternate','other'])assert.deepEqual(planFineChunk(chunk,size,seed).roads,roads);
 }
});
