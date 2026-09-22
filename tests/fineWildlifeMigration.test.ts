import test from 'node:test';
import assert from 'node:assert/strict';
import type { CoarseChunkState, CoarseWildlifePopulation, WildlifeState } from '../src/types.js';
import {
  applyFineWildlifePopulationTransfer, areAdjacentChunks,
  fineMigrationEntryPoint, fineMigrationRepresentativeWeight
} from '../src/world/fineWildlifeMigration.js';

const chunk=(id:string,cx:number,cz:number):CoarseChunkState=>({
  id,cx,cz,biome:'plains',settlementLevel:0,population:0,food:70,wood:50,water:70,ecology:75,danger:20,prosperity:30,
  strategy:'sustain',migrationPolicy:'retain',ecologyPolicy:'balance',lastDecisionAt:0,decisionVersion:0
});

const population=(count:number,health=70,diseaseLoad=10):CoarseWildlifePopulation=>({
  species:'rabbit',count,carryingCapacity:20,health,diseaseLoad
});

const animal:WildlifeState={
  id:'rabbit_named',chunkId:'chunk_0_0',species:'rabbit',position:{x:10,z:0},
  ageDays:180,health:90,hunger:30,thirst:25,energy:70,sex:'female',generation:2,
  traits:{speed:2.2,size:.6,fertility:.8,wariness:.7},currentAction:'migrate',
  lastDecisionAt:0,birthDay:1,diseaseLoad:30
};

test('fine migration only accepts cardinal adjacent chunks',()=>{
  const source=chunk('source',0,0);
  assert.equal(areAdjacentChunks(source,chunk('east',1,0)),true);
  assert.equal(areAdjacentChunks(source,chunk('north',0,-1)),true);
  assert.equal(areAdjacentChunks(source,chunk('diag',1,1)),false);
  assert.equal(areAdjacentChunks(source,chunk('far',2,0)),false);
});

test('fine migration entry point lands inside the adjacent destination',()=>{
  const source=chunk('source',0,0),east=chunk('east',1,0);
  const point=fineMigrationEntryPoint(source,east,24,{x:10,z:4});
  assert.ok(point);
  assert.ok(point!.x>12&&point!.x<36);
  assert.ok(point!.z>-12&&point!.z<12);
});

test('representative migration conserves coarse population and weighted health/disease',()=>{
  const source=population(20,70,10);
  const target=population(5,60,4);
  const before=source.count+target.count;
  assert.equal(fineMigrationRepresentativeWeight(source,5),4);
  const moved=applyFineWildlifePopulationTransfer(source,target,animal,5);
  assert.equal(moved,4);
  assert.equal(source.count,16);
  assert.equal(target.count,9);
  assert.equal(source.count+target.count,before);
  assert.ok(source.health<70);
  assert.ok(target.health>60);
  assert.ok((source.diseaseLoad||0)<10);
  assert.ok((target.diseaseLoad||0)>4);
});

test('migration transfer never removes more population than the source owns',()=>{
  const source=population(.4),target=population(8);
  const moved=applyFineWildlifePopulationTransfer(source,target,animal,3);
  assert.equal(moved,.4);
  assert.equal(source.count,0);
  assert.equal(target.count,8.4);
});
