import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WorldPersistence } from '../server/worldPersistence.js';
import type { WorldPersistenceSnapshot } from '../src/types.js';

test('SQLite persistence round-trips coarse, fine and home state',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'latticefolk-'));
  const file=path.join(dir,'world.sqlite');
  const store=new WorldPersistence(file);
  const snapshot:WorldPersistenceSnapshot={
    version:1,
    meta:{
      day:4,minuteOfDay:777,weather:'rain',playerPosition:{x:51,z:-22},
      playerInventory:{apple:2,bread:1,wood:3,coin:9,flower:0,grain:4,flour:0,water:1,stone:2,plank:0,tool:1}
    },
    coarseChunks:[{
      id:'chunk_2_-1',cx:2,cz:-1,biome:'plains',settlementLevel:2,population:18,
      food:61,wood:44,water:70,ecology:66,danger:19,prosperity:57,
      strategy:'trade_route',migrationPolicy:'retain',ecologyPolicy:'balance',
      lastDecisionAt:123,decisionVersion:4
    }],
    fineChunks:[{chunkId:'chunk_2_-1',npcStates:[],objectStates:[],wildlifeStates:[{
      id:'rabbit_1',chunkId:'chunk_2_-1',species:'rabbit',position:{x:48,z:-24},ageDays:120,health:82,hunger:31,thirst:27,energy:74,
      sex:'female',generation:1,traits:{speed:2.4,size:.55,fertility:.9,wariness:.8},currentAction:'forage',lastDecisionAt:10,birthDay:3
    }]}],
    homeNpcs:[],homeObjects:[]
  };
  store.save(snapshot);
  const loaded=store.load();
  assert.ok(loaded);
  assert.equal(loaded.meta.day,4);
  assert.equal(loaded.coarseChunks[0]?.strategy,'trade_route');
  assert.equal(loaded.fineChunks[0]?.chunkId,'chunk_2_-1');
  assert.equal(loaded.fineChunks[0]?.wildlifeStates?.[0]?.species,'rabbit');
  assert.equal(store.stats().hasSave,true);
  store.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
