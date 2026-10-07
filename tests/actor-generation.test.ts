import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {projectFineActors,readActorGenerationVersion} from '../src/world/actorGeneration.js';
import {CoarseWorldRuntime} from '../src/world/coarseWorld.js';
import {createStreamedLayout} from '../src/world/streamedLayouts.js';
import {streamedUnitOwnerCells} from '../src/world/streamedUnits.js';
import {fineResidentCount,fineWildlifeCount} from '../src/world/materialization.js';

function fixture(seed='latticefolk-default'){
  const world=new CoarseWorldRuntime(new THREE.Scene(),seed);
  const cells=streamedUnitOwnerCells(1,0).map(owner=>world.ensureChunk(owner.cx,owner.cz)!);
  const layout=createStreamedLayout(1,0,cells,[],seed).layout;
  const chunk=structuredClone(cells[4]);chunk.population=12;chunk.settlementLevel=2;
  chunk.wildlife=[{species:'rabbit',count:8,carryingCapacity:12,health:80},{species:'deer',count:5,carryingCapacity:8,health:80}];
  return {chunk,layout,randomness:{version:1 as const,seed}};
}

test('missing generation metadata means v1 and unknown versions are rejected',()=>{
  assert.equal(readActorGenerationVersion(undefined),1);assert.equal(readActorGenerationVersion(1),1);
  for(const value of [null,0,2,'1',{},NaN])assert.throws(()=>readActorGenerationVersion(value));
});

test('coarse ecology, strategy, prosperity and species order do not reroll surviving actor slots',()=>{
  const {chunk,layout,randomness}=fixture(),before=projectFineActors(chunk,layout,randomness);
  Object.assign(chunk,{ecology:66.001,strategy:'fortify',danger:99,prosperity:1,wood:0,biome:'forest'});
  chunk.wildlife!.reverse();
  assert.deepEqual(projectFineActors(chunk,layout,randomness),before);
});

test('population and settlement changes retain exact prefixes and original membership formulas',()=>{
  const {chunk,layout,randomness}=fixture(),largest=projectFineActors(chunk,layout,randomness);
  for(const population of [0,.4,1,4,12,100])for(const settlementLevel of [0,1,2]){
    Object.assign(chunk,{population,settlementLevel});
    const current=projectFineActors(chunk,layout,randomness);
    assert.equal(current.residents.length,fineResidentCount(chunk));
    assert.deepEqual(current.residents,largest.residents.slice(0,current.residents.length));
  }
  for(const count of [0,.34,.35,1,4,8]){
    chunk.wildlife![0].count=count;
    const current=projectFineActors(chunk,layout,randomness).wildlife.filter(x=>x.species==='rabbit');
    assert.equal(current.length,fineWildlifeCount(chunk.wildlife![0]));
    assert.deepEqual(current,largest.wildlife.filter(x=>x.species==='rabbit').slice(0,current.length));
  }
});

test('projection changes no state or ambient RNG and survives layout JSON round trips',()=>{
  const input=fixture(),before=structuredClone(input),ambient=Math.random;
  try{
    Math.random=()=>{throw new Error('ambient draw');};
    const one=projectFineActors(input.chunk,input.layout,input.randomness);
    const two=projectFineActors(input.chunk,JSON.parse(JSON.stringify(input.layout)),input.randomness);
    assert.deepEqual(two,one);assert.deepEqual(input,before);
  }finally{Math.random=ambient;}
});

test('wrong world, owner, coordinates or version fails even for an empty roster',()=>{
  const {chunk,layout,randomness}=fixture();
  assert.throws(()=>projectFineActors(chunk,layout,{...randomness,seed:'another-world'}));
  assert.throws(()=>projectFineActors({...chunk,id:'chunk_8_8'},layout,randomness));
  assert.throws(()=>projectFineActors({...chunk,cx:99},layout,randomness));
  assert.throws(()=>projectFineActors({...chunk,population:0,wildlife:[]},layout,{...randomness,version:2} as any));
  const other=fixture('another-world');
  assert.notDeepEqual(projectFineActors(other.chunk,other.layout,other.randomness).residents,
    projectFineActors(chunk,layout,randomness).residents);
});
