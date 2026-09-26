import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { WorldPersistence } from '../server/worldPersistence.js';
import type { WorldPersistenceSnapshot } from '../src/types.js';

test('partial saves preserve omitted discovered rows and omitted transit queues',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'latticefolk-partial-save-'));
  const file=path.join(dir,'world.sqlite');
  const store=new WorldPersistence(file);
  const initial:WorldPersistenceSnapshot={
    version:1,
    meta:{
      day:2,minuteOfDay:600,weather:'clear',playerPosition:{x:0,z:0},
      playerInventory:{apple:0,bread:0,wood:0,coin:0,flower:0,grain:0,flour:0,water:0,stone:0,plank:0,tool:0}
    },
    coarseChunks:[
      {id:'chunk_0_0',cx:0,cz:0,biome:'plains',settlementLevel:1,population:8,food:50,wood:40,water:60,ecology:70,danger:10,prosperity:45,strategy:'sustain',migrationPolicy:'retain',ecologyPolicy:'balance',lastDecisionAt:0,decisionVersion:1},
      {id:'chunk_1_0',cx:1,cz:0,biome:'forest',settlementLevel:0,population:3,food:65,wood:80,water:55,ecology:85,danger:18,prosperity:25,strategy:'conserve',migrationPolicy:'retain',ecologyPolicy:'protect',lastDecisionAt:0,decisionVersion:1}
    ],
    fineChunks:[
      {chunkId:'chunk_0_0',npcStates:[],objectStates:[],wildlifeStates:[]},
      {chunkId:'chunk_1_0',npcStates:[],objectStates:[{
        id:'remote_crate',chunkId:'chunk_1_0',kind:'crate',name:'Remote crate',
        position:{x:34,z:2},tags:['storage'],usable:true,pickupable:false
      }],wildlifeStates:[]}
    ],
    homeNpcs:[],homeObjects:[]
  };
  store.save(initial);

  const seedDb=new Database(file);
  seedDb.prepare('INSERT INTO wildlife_transfers(entity_id,transfer_json,updated_at) VALUES(?,?,?)')
    .run('rabbit_transit','{}',Date.now());
  seedDb.close();

  const partial:WorldPersistenceSnapshot={
    ...initial,
    meta:{...initial.meta,minuteOfDay:601},
    coarseChunks:[{...initial.coarseChunks[0]!,food:73}],
    fineChunks:[initial.fineChunks[0]!]
  };
  store.save(partial);

  const preserved=store.load();
  assert.ok(preserved);
  assert.equal(preserved.meta.minuteOfDay,601);
  assert.equal(preserved.coarseChunks.find(chunk=>chunk.id==='chunk_0_0')?.food,73);
  assert.equal(preserved.coarseChunks.find(chunk=>chunk.id==='chunk_1_0')?.food,65);
  assert.equal(
    preserved.fineChunks.find(chunk=>chunk.chunkId==='chunk_1_0')?.objectStates[0]?.id,
    'remote_crate'
  );
  assert.equal(store.stats().pendingWildlifeTransfers,1);

  store.save({...partial,wildlifeTransfers:[]});
  assert.equal(store.stats().pendingWildlifeTransfers,0);
  assert.equal(store.load()?.coarseChunks.some(chunk=>chunk.id==='chunk_1_0'),true);
  assert.equal(store.load()?.fineChunks.some(chunk=>chunk.chunkId==='chunk_1_0'),true);

  store.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
