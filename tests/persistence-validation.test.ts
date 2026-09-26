import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import Database from 'better-sqlite3';
import { WorldPersistence } from '../server/worldPersistence.js';
import { createWorldStateSaveHandler } from '../server/worldStateSaveHandler.js';
import { WORLD_SNAPSHOT_LIMITS, WorldSnapshotValidationError } from '../server/worldSnapshotValidation.js';
import type { WorldPersistenceSnapshot, WildlifeState } from '../src/types.js';

const inventory={apple:1,bread:1,wood:0,coin:10,flower:0,grain:0,flour:0,water:0,stone:0,plank:0,tool:0};

const rabbit=(id='rabbit_fine',chunkId='chunk_0_0'):WildlifeState=>({
  id,chunkId,species:'rabbit',position:{x:2,z:3},ageDays:20,health:90,hunger:10,thirst:11,energy:80,
  sex:'female',generation:0,traits:{speed:2,size:.6,fertility:.8,wariness:.7},
  currentAction:'forage',lastDecisionAt:0,birthDay:1
});

const validSnapshot=():WorldPersistenceSnapshot=>({
  version:1,
  meta:{day:3,minuteOfDay:600,weather:'clear',playerPosition:{x:0,z:0},playerInventory:{...inventory}},
  coarseChunks:[{
    id:'chunk_0_0',cx:0,cz:0,biome:'plains',settlementLevel:1,population:12,food:30,wood:20,water:40,
    ecology:70,danger:10,prosperity:25,strategy:'sustain',migrationPolicy:'retain',ecologyPolicy:'balance',
    lastDecisionAt:0,decisionVersion:1,wildlife:[{species:'rabbit',count:6,carryingCapacity:12,health:90}]
  }],
  fineChunks:[{chunkId:'chunk_0_0',npcStates:[],objectStates:[],wildlifeStates:[rabbit()]}],
  homeNpcs:[],
  homeObjects:[{
    id:'legacy_cart',kind:'cart',name:'Cart',position:{x:1,z:1},tags:['transport'],usable:true,pickupable:false,
    movable:true,physicsRadius:.8,capabilities:['inspect']
  }]
});

const clone=<T>(value:T):T=>structuredClone(value);

const logicalTables=(file:string)=>{
  const db=new Database(file,{readonly:true});
  try{
    return {
      meta:db.prepare('SELECT slot,version,meta_json,saved_at FROM world_meta ORDER BY slot').all(),
      coarse:db.prepare('SELECT id,state_json,updated_at FROM coarse_chunks ORDER BY id').all(),
      fine:db.prepare('SELECT chunk_id,npc_json,object_json,wildlife_json,updated_at FROM fine_chunks ORDER BY chunk_id').all(),
      home:db.prepare('SELECT slot,npc_json,object_json,updated_at FROM home_state ORDER BY slot').all(),
      lineage:db.prepare('SELECT * FROM wildlife_lineage ORDER BY entity_id').all(),
      transfers:db.prepare('SELECT * FROM wildlife_transfers ORDER BY entity_id').all()
    };
  }finally{db.close();}
};

test('snapshot validator blocks malformed authoritative writes without changing logical SQLite state',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'latticefolk-validation-'));
  const file=path.join(dir,'world.sqlite');
  const store=new WorldPersistence(file);
  const base=validSnapshot();
  store.save(base);
  assert.deepEqual(store.load()?.meta.playerInventory,base.meta.playerInventory);

  const reject=(value:unknown,pathFragment:string)=>{
    const before=logicalTables(file);
    assert.throws(
      ()=>store.save(value),
      (error:unknown)=>error instanceof WorldSnapshotValidationError&&error.issues.some(issue=>issue.path.includes(pathFragment)),
      'expected validation error containing '+pathFragment
    );
    assert.deepEqual(logicalTables(file),before,'invalid payload must not mutate any logical persistence table');
  };

  const missingHome=clone(base) as unknown as Record<string,unknown>;
  missingHome.homeNpcs=null;
  reject(missingHome,'$.homeNpcs');

  const negativeBalance=clone(base);
  negativeBalance.meta.playerInventory.coin=-1;
  reject(negativeBalance,'playerInventory.coin');

  const duplicateCoordinate=clone(base);
  duplicateCoordinate.coarseChunks.push({...duplicateCoordinate.coarseChunks[0]!,id:'chunk_duplicate',strategy:'invalid' as never});
  reject(duplicateCoordinate,'coarseChunks[1]');

  const nonFiniteWildlife=clone(base);
  nonFiniteWildlife.fineChunks[0]!.wildlifeStates![0]!.health=Number.NaN;
  reject(nonFiniteWildlife,'wildlifeStates[0].health');

  const badLineage=clone(base);
  badLineage.wildlifeLineage=[{
    entityId:'lineage_self',species:'rabbit',motherId:'lineage_self',birthDay:5,deathDay:4,generation:0,
    birthChunk:'chunk_0_0',traitsAtBirth:{speed:2,size:.6,fertility:.8,wariness:.7},
    origin:'founder',offspringCount:0,reproductiveSuccess:false
  }];
  reject(badLineage,'wildlifeLineage[0]');

  const badTransfer=clone(base);
  const transferState=rabbit('transfer_state','chunk_0_0');
  transferState.representedPopulation=2;
  badTransfer.wildlifeTransfers=[{
    entityId:'transfer_other',state:transferState,fromChunkId:'chunk_0_0',toChunkId:'chunk_0_0',
    representedPopulation:3,transferredDay:3
  }];
  reject(badTransfer,'wildlifeTransfers[0]');

  const overLimit=clone(base);
  overLimit.fineChunks=Array.from({length:WORLD_SNAPSHOT_LIMITS.fineChunks+1},(_,i)=>({
    chunkId:'bounded_'+i,npcStates:[],objectStates:[],wildlifeStates:[]
  }));
  reject(overLimit,'$.fineChunks');

  store.close();
  fs.rmSync(dir,{recursive:true,force:true});
});

test('validator preserves supported legacy optional persistence fields',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'latticefolk-validation-legacy-'));
  const file=path.join(dir,'world.sqlite');
  const store=new WorldPersistence(file);
  const legacy=validSnapshot() as unknown as Record<string,unknown>;
  const fine=(legacy.fineChunks as Array<Record<string,unknown>>)[0]!;
  delete fine.wildlifeStates;
  legacy.wildlifeLineage=[{
    entityId:'legacy_lineage',species:'rabbit',birthDay:1,generation:0,birthChunk:'chunk_0_0',
    traitsAtBirth:{speed:2,size:.6,fertility:.8,wariness:.7},offspringCount:0,reproductiveSuccess:false
  }];
  store.save(legacy);
  const loaded=store.load();
  assert.ok(loaded);
  assert.deepEqual(loaded.fineChunks[0]?.wildlifeStates,[]);
  assert.equal(loaded.homeObjects[0]?.movable,true);
  assert.equal(loaded.homeObjects[0]?.physicsRadius,.8);
  assert.equal(loaded.wildlifeLineage?.[0]?.origin,'founder');
  store.close();
  fs.rmSync(dir,{recursive:true,force:true});
});

test('HTTP world-state save returns actionable validation errors and preserves the prior database state',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'latticefolk-validation-http-'));
  const file=path.join(dir,'world.sqlite');
  const store=new WorldPersistence(file);
  const app=express();
  app.use(express.json({limit:'64mb'}));
  app.post('/api/world/state',createWorldStateSaveHandler(store));
  const server=app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',()=>resolve()));
  const address=server.address();
  assert.ok(address&&typeof address==='object');
  const url='http://127.0.0.1:'+address.port+'/api/world/state';

  try{
    const accepted=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(validSnapshot())});
    assert.equal(accepted.status,200);
    const before=logicalTables(file);

    const invalid=validSnapshot();
    invalid.meta.playerInventory.coin=-5;
    const rejected=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(invalid)});
    assert.equal(rejected.status,400);
    const body=await rejected.json() as {error?:string;issues?:Array<{path:string;message:string}>};
    assert.equal(body.error,'Invalid world persistence payload');
    assert.ok(body.issues?.some(issue=>issue.path==='$.meta.playerInventory.coin'));
    assert.deepEqual(logicalTables(file),before);
    assert.equal(store.load()?.meta.playerInventory.coin,10);
  }finally{
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    store.close();
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
