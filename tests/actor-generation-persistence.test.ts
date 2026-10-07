import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import * as THREE from 'three';
import * as generation from '../src/world/actorGeneration.js';
import * as random from '../src/world/worldRandom.js';
import * as layouts from '../src/world/streamedLayouts.js';
import {restoredPlayerPosition} from '../src/world/portableObjects.js';
import {WorldPersistence,WorldPersistenceConflictError} from '../server/worldPersistence.js';
import {WorldSnapshotValidationError} from '../server/worldSnapshotValidation.js';

const source=fs.readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
const game=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='TownGame') as ts.ClassDeclaration;
const names=['buildWorldSnapshot','buildFinalWorldSnapshot','restoreWorldState'];
const methods=names.map(name=>game.members.find(n=>n.name?.getText(ast)===name)!.getText(ast));
// These exact method hashes come from published main b16af25579a2f9810ba8974c76afe3293c34b247.
// Reversing only the new source lines must recover that writer byte for byte.
const oldHashes=['dff4dd35a9076ae2dc3a24a0aff649f63cc868eac311e613661d8d4ef28ec31c',
  'a3a22893d4badde7b77a4875de116dd798a3e3a2c194a899224bb624602b72b1',
  '9b60406b4f0301212f6916f9d5871999b5aedb4607e0ebe242ddfd0f810afa2f'];
function runtime(old=false){
  const selected=methods.map((method,index)=>{
    if(!old)return method;
    const prior=method.replace('\n        actorGenerationVersion:ACTOR_GENERATION_VERSION,','')
      .replace('\n    readActorGenerationVersion(snapshot.meta.actorGenerationVersion);','');
    assert.equal(createHash('sha256').update(prior).digest('hex'),oldHashes[index]);return prior;
  });
  const deps={...generation,...random,...layouts,restoredPlayerPosition,now:()=>1000};
  const code=ts.transpileModule(`return class {${selected.join('\n')}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const Runtime=new Function(...Object.keys(deps),code)(...Object.values(deps)),r=new Runtime();
  Object.assign(r,{day:4,minuteOfDay:720,weather:'rain',weatherEpoch:2,randomness:random.readWorldRandomness(undefined),
    playerPosition:{x:0,z:7},playerInventory:{apple:0,bread:1,wood:7,coin:10,flower:0,grain:0,flour:0,water:0,stone:0,plank:0,tool:0},
    camera:new THREE.PerspectiveCamera(),coarseWorld:{chunks:new Map(),restoreKnownChunks(){},ensureWindowAround(){}},
    streamedLayouts:new layouts.StreamedLayoutRegistry(random.DEFAULT_WORLD_SEED),fineChunkCache:new Map(),materializedChunks:new Map(),
    npcs:new Map(),objects:new Map(),wildlifeLineage:new Map(),wildlifeTransfers:new Map(),lineageEpoch:0,
    groundHeightAt:()=>0,reconcileLineageOffspring(){},portables:{restoreHome:()=>false}});
  return r;
}
const json=(x:any)=>JSON.parse(JSON.stringify(x));
function rows(store:WorldPersistence){
  const db=(store as any).db;
  return ['world_meta','world_control','coarse_chunks','fine_chunks','home_state','wildlife_lineage','wildlife_transfers','streamed_layouts']
    .map(table=>db.prepare(`SELECT * FROM ${table}`).all());
}

for(const serializer of ['buildWorldSnapshot','buildFinalWorldSnapshot'])test(`${serializer}: the real previous reader/writer cannot downgrade the stored generation contract`,()=>{
  const store=new WorldPersistence(':memory:');
  try{
    const current=runtime(),first=json(current.buildWorldSnapshot());store.save(first,0);
    const legacy=runtime(true);legacy.restoreWorldState(store.load()!);
    assert.equal(legacy.day,4);assert.equal(legacy.playerInventory.wood,7);
    legacy.playerInventory.wood=99;
    const outgoing=json(legacy[serializer]());assert.equal(outgoing.meta.actorGenerationVersion,undefined);
    const before=rows(store),revision=store.revision();
    assert.throws(()=>store.save(outgoing,revision-1),WorldPersistenceConflictError);assert.deepEqual(rows(store),before);
    assert.throws(()=>store.save(outgoing,revision),WorldSnapshotValidationError);assert.deepEqual(rows(store),before);
    assert.equal(store.load()!.meta.playerInventory.wood,7);
  }finally{store.close();}
});

test('legacy saves upgrade through real restore and both current serializers preserve v1',()=>{
  const store=new WorldPersistence(':memory:');
  try{
    const old=runtime(true);store.save(json(old.buildWorldSnapshot()),0);
    assert.equal(store.load()!.meta.actorGenerationVersion,undefined);
    const current=runtime();current.restoreWorldState(store.load()!);
    for(const method of ['buildWorldSnapshot','buildFinalWorldSnapshot']){
      const snapshot=json(current[method]());assert.equal(snapshot.meta.actorGenerationVersion,1);
      store.save(snapshot,store.revision());assert.equal(store.load()!.meta.actorGenerationVersion,1);
      assert.equal(store.load()!.meta.playerInventory.wood,7);
    }
  }finally{store.close();}
});

test('unsupported generation metadata rejects before restore mutation and leaves SQLite unchanged',()=>{
  const store=new WorldPersistence(':memory:');
  try{
    const r=runtime();store.save(json(r.buildWorldSnapshot()),0);const before=rows(store);
    for(const version of [null,0,2,'1']){
      const bad=json(r.buildWorldSnapshot());bad.meta.actorGenerationVersion=version;bad.meta.day=99;
      assert.throws(()=>r.restoreWorldState(bad),/Unsupported actor generation/);assert.equal(r.day,4);
      assert.throws(()=>store.save(bad,store.revision()),WorldSnapshotValidationError);assert.deepEqual(rows(store),before);
    }
  }finally{store.close();}
});

test('a future stored generation contract cannot be overwritten by this writer',()=>{
  const store=new WorldPersistence(':memory:');
  try{
    const snapshot=json(runtime().buildWorldSnapshot());store.save(snapshot,0);
    (store as any).db.prepare("UPDATE world_meta SET meta_json=? WHERE slot='default'")
      .run(JSON.stringify({...snapshot.meta,actorGenerationVersion:2}));
    const before=rows(store);
    assert.throws(()=>store.save(snapshot,store.revision()-1),WorldPersistenceConflictError);
    assert.throws(()=>store.save(snapshot,store.revision()),WorldSnapshotValidationError);
    assert.deepEqual(rows(store),before);
  }finally{store.close();}
});
