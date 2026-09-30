import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

import Database from 'better-sqlite3';
import express from 'express';
import { WorldPersistence, WorldPersistenceConflictError } from '../server/worldPersistence.js';
import { registerWorldStateRoutes } from '../server/worldStateRoutes.js';
import { validateWorldPersistenceSnapshot, WorldSnapshotValidationError, WORLD_SNAPSHOT_LIMITS } from '../server/worldSnapshotValidation.js';
import type { WorldPersistenceSnapshot } from '../src/types.js';

const saveCurrent=(store:WorldPersistence,snapshot:WorldPersistenceSnapshot)=>store.save(snapshot,store.revision());

const inventory={apple:1,bread:1,wood:2,coin:8,flower:0,grain:0,flour:0,water:1,stone:0,plank:0,tool:1};

function validSnapshot():WorldPersistenceSnapshot {
  return {
    version:1,
    meta:{day:8,minuteOfDay:615,weather:'cloudy',playerPosition:{x:48,z:0},playerInventory:{...inventory}},
    coarseChunks:[
      {
        id:'chunk_2_0',cx:2,cz:0,biome:'plains',settlementLevel:1,population:12.25,
        food:62.5,wood:58.25,water:71.75,ecology:69.5,danger:18,prosperity:55,
        strategy:'sustain',migrationPolicy:'retain',ecologyPolicy:'balance',lastDecisionAt:100,decisionVersion:2,
        wildlife:[{species:'rabbit',count:6.5,carryingCapacity:18,health:82,diseaseLoad:3}]
      },
      {
        id:'chunk_3_0',cx:3,cz:0,biome:'forest',settlementLevel:0,population:3,
        food:72,wood:83,water:66,ecology:84,danger:22,prosperity:28,
        strategy:'conserve',migrationPolicy:'attract',ecologyPolicy:'protect',lastDecisionAt:0,decisionVersion:0
      }
    ],
    fineChunks:[{
      chunkId:'chunk_2_0',
      npcStates:[{
        id:'npc_fine',chunkId:'chunk_2_0',name:'Fine',role:'farmer',position:{x:48,z:1},home:{x:47,z:1},
        mood:'calm',hunger:20,energy:80,social:55,money:4,inventory:[],relationships:{},memories:[],
        currentAction:'work',goal:'farm',lastDecisionAt:10
      }],
      objectStates:[{
        id:'fine_crate',chunkId:'chunk_2_0',kind:'crate',name:'Fine crate',position:{x:49,z:1},tags:['storage'],
        usable:true,pickupable:false,capabilities:['inspect','store','take'],storage:[]
      }],
      wildlifeStates:[{
        id:'fine_rabbit',chunkId:'chunk_2_0',species:'rabbit',position:{x:47,z:2},ageDays:45,
        health:90,hunger:20,thirst:18,energy:75,sex:'female',generation:1,
        traits:{speed:2.1,size:.55,fertility:.8,wariness:.7},currentAction:'forage',lastDecisionAt:9,birthDay:4
      }]
    }],
    homeNpcs:[{
      id:'npc_home',name:'Home',role:'resident',position:{x:0,z:2},home:{x:0,z:2},mood:'neutral',
      hunger:15,energy:90,social:60,money:10,inventory:[{kind:'bread',count:1}],relationships:{},memories:[],
      currentAction:'idle',goal:'live',lastDecisionAt:5
    }],
    homeObjects:[{
      id:'home_cart',kind:'cart',name:'Cart',position:{x:0,z:4},tags:['transport'],usable:true,pickupable:false,
      rigidBodyArchetype:'cart',capabilities:['inspect','load','unload'],storage:[]
    }],
    wildlifeLineage:[{
      entityId:'ancestor_rabbit',species:'rabbit',birthDay:1,generation:0,birthChunk:'chunk_2_0',
      traitsAtBirth:{speed:2,size:.5,fertility:.75,wariness:.65},origin:'founder',offspringCount:1,reproductiveSuccess:true
    }],
    wildlifeTransfers:[{
      entityId:'migrant_rabbit',
      state:{
        id:'migrant_rabbit',chunkId:'chunk_3_0',species:'rabbit',position:{x:72,z:1},ageDays:60,
        health:88,hunger:30,thirst:24,energy:68,sex:'male',generation:1,
        traits:{speed:2.2,size:.57,fertility:.78,wariness:.72},currentAction:'migrate',lastDecisionAt:11,birthDay:3,
        representedPopulation:1.25
      },
      fromChunkId:'chunk_2_0',toChunkId:'chunk_3_0',representedPopulation:1.25,transferredDay:8.2
    }]
  };
}

function logicalTables(file:string){
  const db=new Database(file,{readonly:true});
  try{
    return {
      world_control:db.prepare('SELECT * FROM world_control ORDER BY slot').all(),
      world_meta:db.prepare('SELECT * FROM world_meta ORDER BY slot').all(),
      coarse_chunks:db.prepare('SELECT * FROM coarse_chunks ORDER BY id').all(),
      fine_chunks:db.prepare('SELECT * FROM fine_chunks ORDER BY chunk_id').all(),
      home_state:db.prepare('SELECT * FROM home_state ORDER BY slot').all(),
      wildlife_lineage:db.prepare('SELECT * FROM wildlife_lineage ORDER BY entity_id').all(),
      wildlife_transfers:db.prepare('SELECT * FROM wildlife_transfers ORDER BY entity_id').all()
    };
  }finally{db.close();}
}

function invalidCases(){
  return [
    ['missing required homeObjects',(s:any)=>{delete s.homeObjects;}],
    ['nonfinite meta day',(s:any)=>{s.meta.day=Number.NaN;}],
    ['unsupported weather',(s:any)=>{s.meta.weather='hail';}],
    ['negative inventory',(s:any)=>{s.meta.playerInventory.coin=-1;}],
    ['duplicate coarse coordinate',(s:any)=>{s.coarseChunks[1].cx=s.coarseChunks[0].cx;s.coarseChunks[1].cz=s.coarseChunks[0].cz;}],
    ['unsupported coarse enum',(s:any)=>{s.coarseChunks[0].strategy='teleport';}],
    ['out-of-range coarse resource',(s:any)=>{s.coarseChunks[0].food=101;}],
    ['fine entity chunk mismatch',(s:any)=>{s.fineChunks[0].npcStates[0].chunkId='chunk_9_9';}],
    ['invalid NPC role',(s:any)=>{s.fineChunks[0].npcStates[0].role='wizard';}],
    ['invalid object kind',(s:any)=>{s.homeObjects[0].kind='portal';}],
    ['invalid wildlife species',(s:any)=>{s.fineChunks[0].wildlifeStates[0].species='dragon';}],
    ['lineage self-parent',(s:any)=>{s.wildlifeLineage[0].motherId=s.wildlifeLineage[0].entityId;}],
    ['lineage death before birth',(s:any)=>{s.wildlifeLineage[0].deathDay=.5;}],
    ['transfer state id mismatch',(s:any)=>{s.wildlifeTransfers[0].state.id='other';}],
    ['transfer destination mismatch',(s:any)=>{s.wildlifeTransfers[0].state.chunkId='chunk_2_0';}],
    ['transfer same endpoint',(s:any)=>{s.wildlifeTransfers[0].toChunkId=s.wildlifeTransfers[0].fromChunkId;s.wildlifeTransfers[0].state.chunkId=s.wildlifeTransfers[0].fromChunkId;}],
    ['duplicate wildlife identity',(s:any)=>{s.wildlifeTransfers[0].entityId='fine_rabbit';s.wildlifeTransfers[0].state.id='fine_rabbit';}]
  ] as Array<[string,(snapshot:any)=>void]>;
}

test('validator accepts current snapshots and additive legacy omissions',()=>{
  const current=validSnapshot();
  assert.equal(validateWorldPersistenceSnapshot(current),current);

  const legacy=structuredClone(current) as any;
  delete legacy.wildlifeLineage;
  delete legacy.wildlifeTransfers;
  delete legacy.fineChunks[0].wildlifeStates;
  delete legacy.homeObjects[0].rigidBodyArchetype;
  legacy.homeObjects[0].movable=true;
  legacy.homeObjects[0].physicsRadius=.8;
  assert.equal(validateWorldPersistenceSnapshot(legacy),legacy);
});

test('additive legacy version-1 omissions still persist and load without reset',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'latticefolk-validation-legacy-'));
  const file=path.join(dir,'world.sqlite');
  const store=new WorldPersistence(file);
  try{
    const legacy=structuredClone(validSnapshot()) as any;
    delete legacy.wildlifeLineage;
    delete legacy.wildlifeTransfers;
    delete legacy.fineChunks[0].wildlifeStates;
    delete legacy.homeObjects[0].rigidBodyArchetype;
    legacy.homeObjects[0].movable=true;
    legacy.homeObjects[0].physicsRadius=.8;
    saveCurrent(store,legacy);
    const loaded=store.load();
    assert.ok(loaded);
    assert.equal(loaded.version,1);
    assert.equal(loaded.fineChunks[0]?.wildlifeStates?.length,0);
    assert.deepEqual(loaded.wildlifeLineage,[]);
    assert.deepEqual(loaded.wildlifeTransfers,[]);
    assert.equal(loaded.homeObjects[0]?.movable,true);
    assert.equal(loaded.homeObjects[0]?.physicsRadius,.8);
  }finally{
    store.close();
    fs.rmSync(dir,{recursive:true,force:true});
  }
});

test('validator reports actionable failures across authoritative snapshot domains',()=>{
  for(const [name,mutate] of invalidCases()){
    const candidate=structuredClone(validSnapshot()) as any;
    mutate(candidate);
    assert.throws(
      ()=>validateWorldPersistenceSnapshot(candidate),
      error=>error instanceof WorldSnapshotValidationError&&error.issues.length>0,
      name
    );
  }
});

test('oversized snapshot collections are rejected before per-entry traversal',()=>{
  const candidate=validSnapshot() as any;
  candidate.homeNpcs=new Array(WORLD_SNAPSHOT_LIMITS.homeNpcs+1).fill(null);
  assert.throws(
    ()=>validateWorldPersistenceSnapshot(candidate),
    error=>error instanceof WorldSnapshotValidationError&&error.issues.some(issue=>issue.includes('too many entries'))
  );
});

test('WorldPersistence rejects malformed direct writes without changing any logical table',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'latticefolk-validation-store-'));
  const file=path.join(dir,'world.sqlite');
  const store=new WorldPersistence(file);
  try{
    saveCurrent(store,validSnapshot());
    const before=logicalTables(file);
    for(const [name,mutate] of invalidCases()){
      const candidate=structuredClone(validSnapshot()) as any;
      mutate(candidate);
      assert.throws(()=>saveCurrent(store,candidate),WorldSnapshotValidationError,name);
      assert.deepEqual(logicalTables(file),before,`${name} mutated SQLite state`);
    }
  }finally{
    store.close();
    fs.rmSync(dir,{recursive:true,force:true});
  }
});

test('HTTP world-state route accepts valid writes and rejects malformed writes without mutation',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'latticefolk-validation-http-'));
  const file=path.join(dir,'world.sqlite');
  const store=new WorldPersistence(file);
  const app=express();
  app.use(express.json({limit:'2mb'}));
  registerWorldStateRoutes(app,store);
  const server=app.listen(0,'127.0.0.1');
  await new Promise<void>((resolve,reject)=>{server.once('listening',()=>resolve());server.once('error',reject);});
  const address=server.address() as AddressInfo;
  const base=`http://127.0.0.1:${address.port}`;

  try{
    const valid=validSnapshot();
    const saved=await fetch(`${base}/api/world/state`,{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({snapshot:valid,expectedRevision:store.revision()})
    });
    assert.equal(saved.status,200);
    const before=logicalTables(file);

    const malformed=structuredClone(valid) as any;
    malformed.coarseChunks[0].biome='ocean';
    malformed.homeObjects[0].position.x=null;
    const rejected=await fetch(`${base}/api/world/state`,{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({snapshot:malformed,expectedRevision:store.revision()})
    });
    assert.equal(rejected.status,400);
    const body=await rejected.json() as {error?:string;details?:string[]};
    assert.equal(body.error,'Invalid world persistence payload');
    assert.ok(body.details?.some(detail=>detail.includes('coarseChunks[0].biome')));
    assert.ok(body.details?.some(detail=>detail.includes('homeObjects[0].position.x')));
    assert.deepEqual(logicalTables(file),before);

    const missingRevision=await fetch(`${base}/api/world/state`,{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({snapshot:valid})
    });
    assert.equal(missingRevision.status,400);

    const stale=structuredClone(valid);
    stale.meta.day=99;
    const staleWrite=await fetch(`${base}/api/world/state`,{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({snapshot:stale,expectedRevision:0})
    });
    assert.equal(staleWrite.status,409);
    const conflict=await staleWrite.json() as {expectedRevision?:number;currentRevision?:number};
    assert.equal(conflict.expectedRevision,0);
    assert.equal(conflict.currentRevision,1);
    assert.deepEqual(logicalTables(file),before);

    const loaded=await fetch(`${base}/api/world/state`);
    assert.equal(loaded.status,200);
    const response=await loaded.json() as {snapshot?:WorldPersistenceSnapshot|null;revision?:number};
    assert.equal(response.revision,1);
    assert.equal(response.snapshot?.coarseChunks[0]?.id,'chunk_2_0');
    assert.equal(response.snapshot?.homeObjects[0]?.id,'home_cart');
  }finally{
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    store.close();
    fs.rmSync(dir,{recursive:true,force:true});
  }
});


test('revision CAS rejects stale snapshots atomically and survives explicit reset without ABA',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'latticefolk-revision-cas-'));
  const file=path.join(dir,'world.sqlite');
  const store=new WorldPersistence(file);
  try{
    const initial=validSnapshot();
    const first=store.save(initial,0);
    assert.equal(first.revision,1);

    const newer=structuredClone(initial);
    newer.meta.day=9;
    newer.coarseChunks[0]!.food=77.25;
    newer.fineChunks[0]!.objectStates[0]!.name='Newer crate';
    newer.wildlifeLineage![0]!.habitatExposure={
      observedDays:4,
      habitatMean:{ecology:70,food:64,water:72,danger:17,settlementLevel:1,plantBiomass:68},
      biomeDays:{plains:4},
      chunkDays:{chunk_2_0:4},
      observedTransitions:0
    };
    newer.wildlifeTransfers![0]!.state.health=93;
    const second=store.save(newer,1);
    assert.equal(second.revision,2);

    const beforeStale=logicalTables(file);
    const stale=structuredClone(initial);
    stale.meta.day=3;
    stale.coarseChunks.splice(1,1);
    stale.fineChunks[0]!.objectStates[0]!.name='Stale crate';
    stale.wildlifeLineage![0]!.habitatExposure={
      observedDays:1,
      habitatMean:{ecology:20,food:10,water:20,danger:90,settlementLevel:1,plantBiomass:15},
      biomeDays:{plains:1},
      chunkDays:{chunk_2_0:1},
      observedTransitions:0
    };
    stale.wildlifeTransfers=[];
    assert.throws(
      ()=>store.save(stale,1),
      error=>error instanceof WorldPersistenceConflictError
        &&error.expectedRevision===1&&error.currentRevision===2
    );
    assert.deepEqual(logicalTables(file),beforeStale,'stale conflict mutated authoritative SQLite tables');
    assert.equal(store.load()?.meta.day,9);
    assert.equal(store.load()?.coarseChunks.some(chunk=>chunk.id==='chunk_3_0'),true);
    assert.equal(store.load()?.fineChunks[0]?.objectStates[0]?.name,'Newer crate');
    assert.equal(store.load()?.wildlifeLineage?.[0]?.habitatExposure?.observedDays,4);
    assert.equal(store.load()?.wildlifeTransfers?.[0]?.state.health,93);

    const cleared=store.clear();
    assert.equal(cleared.revision,3);
    assert.equal(store.load(),null);
    assert.throws(
      ()=>store.save(newer,2),
      error=>error instanceof WorldPersistenceConflictError
        &&error.expectedRevision===2&&error.currentRevision===3
    );
    assert.equal(store.load(),null,'pre-reset writer resurrected a cleared world');
    assert.equal(store.revision(),3);
  }finally{
    store.close();
  }

  const reopened=new WorldPersistence(file);
  try{
    assert.equal(reopened.revision(),3,'revision must survive process/store reopen');
    assert.equal(reopened.load(),null);
  }finally{
    reopened.close();
    fs.rmSync(dir,{recursive:true,force:true});
  }
});

test('pre-revision version-1 SQLite data gains revision zero without resetting the save',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'latticefolk-revision-upgrade-'));
  const file=path.join(dir,'world.sqlite');
  const legacy=new Database(file);
  const meta=validSnapshot().meta;
  legacy.exec(`
    CREATE TABLE world_meta (
      slot TEXT PRIMARY KEY,
      version INTEGER NOT NULL,
      meta_json TEXT NOT NULL,
      saved_at INTEGER NOT NULL
    );
  `);
  legacy.prepare('INSERT INTO world_meta(slot,version,meta_json,saved_at) VALUES(?,?,?,?)')
    .run('default',1,JSON.stringify(meta),123456);
  legacy.close();

  const store=new WorldPersistence(file);
  try{
    assert.equal(store.revision(),0);
    const loaded=store.load();
    assert.ok(loaded);
    assert.equal(loaded.meta.day,meta.day);
    assert.equal(loaded.savedAt,123456);
    const saved=store.save(loaded,0);
    assert.equal(saved.revision,1);
    assert.equal(store.load()?.meta.day,meta.day);
  }finally{
    store.close();
    fs.rmSync(dir,{recursive:true,force:true});
  }
});


test('additive NPC heading persists for home/fine characters and rejects nonfinite orientation',()=>{
  const store=new WorldPersistence(':memory:');
  try {
    const legacy=validSnapshot();saveCurrent(store,legacy);
    assert.equal(store.load()!.homeNpcs![0].heading,undefined);
    const current=validSnapshot();current.homeNpcs![0].heading=-1.83;current.fineChunks[0].npcStates[0].heading=2.1;
    saveCurrent(store,current);
    assert.equal(store.load()!.homeNpcs![0].heading,-1.83);
    assert.equal(store.load()!.fineChunks[0].npcStates[0].heading,2.1);
    const revision=store.revision();
    for(const heading of [NaN,Infinity,-Infinity,'east',null]) {
      const invalid=structuredClone(current);(invalid.homeNpcs![0] as unknown as {heading:unknown}).heading=heading;
      assert.throws(()=>saveCurrent(store,invalid),WorldSnapshotValidationError);
      assert.equal(store.revision(),revision);assert.equal(store.load()!.homeNpcs![0].heading,-1.83);
    }
  } finally {store.close();}
});
