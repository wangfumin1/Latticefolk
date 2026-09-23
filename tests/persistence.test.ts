import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
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
    homeNpcs:[],homeObjects:[],
    wildlifeLineage:[{
      entityId:'rabbit_ancestor',species:'rabbit',birthDay:1,deathDay:3.5,deathReason:'predation',generation:0,
      birthChunk:'chunk_2_-1',deathChunk:'chunk_2_-1',traitsAtBirth:{speed:2.1,size:.52,fertility:.82,wariness:.63},
      traitsAtDeath:{speed:2.1,size:.52,fertility:.82,wariness:.63},
      birthHabitat:{biome:'plains',ecology:66,food:61,water:70,danger:19,settlementLevel:2,plantBiomass:55},
      deathHabitat:{biome:'plains',ecology:62,food:58,water:67,danger:23,settlementLevel:2,plantBiomass:51},
      habitatExposure:{
        observedDays:1.5,habitatMean:{ecology:64,food:59,water:68,danger:21,settlementLevel:2,plantBiomass:53},
        predatorSourceMean:{fox:35,wolf:12},predatorSourceObservedDays:1.2,
        biomeDays:{plains:1.5},chunkDays:{'chunk_2_-1':1.5},observedTransitions:1,lastChunk:'chunk_3_-1',lastBiome:'forest'
      },
      migrationHistory:[{
        fromChunkId:'chunk_2_-1',toChunkId:'chunk_3_-1',day:2.5,fromBiome:'plains',toBiome:'forest',
        representedPopulation:2.5,reason:'behavioral_migration'
      }],
      origin:'founder',offspringCount:1,reproductiveSuccess:true
    }],
    wildlifeTransfers:[{
      entityId:'rabbit_migrant',
      state:{
        id:'rabbit_migrant',chunkId:'chunk_3_-1',species:'rabbit',position:{x:61,z:-24},ageDays:90,
        health:88,hunger:30,thirst:25,energy:65,sex:'male',generation:1,
        traits:{speed:2.3,size:.58,fertility:.75,wariness:.72},currentAction:'wander',lastDecisionAt:0,birthDay:2,diseaseLoad:3,
        representedPopulation:2.5
      },
      fromChunkId:'chunk_2_-1',toChunkId:'chunk_3_-1',representedPopulation:2.5,transferredDay:4.2
    }]
  };
  store.save(snapshot);
  const loaded=store.load();
  assert.ok(loaded);
  assert.equal(loaded.meta.day,4);
  assert.equal(loaded.coarseChunks[0]?.strategy,'trade_route');
  assert.equal(loaded.fineChunks[0]?.chunkId,'chunk_2_-1');
  assert.equal(loaded.fineChunks[0]?.wildlifeStates?.[0]?.species,'rabbit');
  assert.equal(loaded.wildlifeLineage?.[0]?.deathReason,'predation');
  assert.equal(loaded.wildlifeLineage?.[0]?.birthHabitat?.biome,'plains');
  assert.equal(loaded.wildlifeLineage?.[0]?.deathHabitat?.danger,23);
  assert.equal(loaded.wildlifeLineage?.[0]?.habitatExposure?.observedDays,1.5);
  assert.equal(loaded.wildlifeLineage?.[0]?.habitatExposure?.biomeDays.plains,1.5);
  assert.equal(loaded.wildlifeLineage?.[0]?.habitatExposure?.predatorSourceObservedDays,1.2);
  assert.equal(loaded.wildlifeLineage?.[0]?.habitatExposure?.predatorSourceMean?.fox,35);
  assert.equal(loaded.wildlifeLineage?.[0]?.habitatExposure?.predatorSourceMean?.wolf,12);
  assert.equal(loaded.wildlifeLineage?.[0]?.migrationHistory?.[0]?.toChunkId,'chunk_3_-1');
  assert.equal(loaded.wildlifeLineage?.[0]?.migrationHistory?.[0]?.representedPopulation,2.5);
  assert.equal(loaded.wildlifeTransfers?.[0]?.entityId,'rabbit_migrant');
  assert.equal(loaded.wildlifeTransfers?.[0]?.toChunkId,'chunk_3_-1');
  assert.equal(loaded.wildlifeTransfers?.[0]?.state.representedPopulation,2.5);
  assert.equal(store.stats().lineageRecords,1);
  assert.equal(store.stats().pendingWildlifeTransfers,1);
  assert.equal(store.evolutionStats().find(entry=>entry.species==='rabbit')?.deaths,1);

  store.save({...snapshot,wildlifeLineage:[],wildlifeTransfers:[]});
  const afterSparseSave=store.load();
  assert.equal(afterSparseSave?.wildlifeLineage?.length,1,'lineage archive must not be pruned by later sparse snapshots');
  assert.equal(afterSparseSave?.wildlifeTransfers?.length,0,'completed transfer queue entries should be pruned');
  assert.equal(store.stats().pendingWildlifeTransfers,0);
  assert.equal(store.stats().hasSave,true);
  store.close();
  fs.rmSync(dir,{recursive:true,force:true});
});


test('SQLite migrates pre-origin lineage tables without losing ancestry',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'latticefolk-lineage-migration-'));
  const file=path.join(dir,'world.sqlite');
  const legacy=new Database(file);
  legacy.exec(`
    CREATE TABLE wildlife_lineage (
      entity_id TEXT PRIMARY KEY,
      species TEXT NOT NULL,
      mother_id TEXT,
      father_id TEXT,
      birth_day REAL NOT NULL,
      death_day REAL,
      death_reason TEXT,
      generation INTEGER NOT NULL,
      birth_chunk TEXT NOT NULL,
      death_chunk TEXT,
      traits_at_birth_json TEXT NOT NULL,
      traits_at_death_json TEXT,
      offspring_count INTEGER NOT NULL DEFAULT 0,
      reproductive_success INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
  `);
  legacy.close();

  const store=new WorldPersistence(file);
  const snapshot:WorldPersistenceSnapshot={
    version:1,
    meta:{day:1,minuteOfDay:480,weather:'clear',playerPosition:{x:0,z:0},playerInventory:{apple:0,bread:0,wood:0,coin:0,flower:0,grain:0,flour:0,water:0,stone:0,plank:0,tool:0}},
    coarseChunks:[],fineChunks:[],homeNpcs:[],homeObjects:[],
    wildlifeLineage:[{
      entityId:'rabbit_child',species:'rabbit',motherId:'rabbit_mother',fatherId:'rabbit_father',
      birthDay:2,generation:1,birthChunk:'chunk_0_0',traitsAtBirth:{speed:2,size:.6,fertility:.8,wariness:.7},
      birthHabitat:{biome:'forest',ecology:80,food:65,water:72,danger:20,settlementLevel:0,plantBiomass:76},
      habitatExposure:{
        observedDays:.5,habitatMean:{ecology:80,food:65,water:72,danger:20,settlementLevel:0,plantBiomass:76},
        biomeDays:{forest:.5},chunkDays:{chunk_0_0:.5},observedTransitions:1,lastChunk:'chunk_1_0',lastBiome:'plains'
      },
      migrationHistory:[{
        fromChunkId:'chunk_0_0',toChunkId:'chunk_1_0',day:2.25,fromBiome:'forest',toBiome:'plains',
        representedPopulation:1,reason:'behavioral_migration'
      }],
      origin:'reproduction',offspringCount:0,reproductiveSuccess:false
    }]
  };
  store.save(snapshot);
  const migrated=store.load()?.wildlifeLineage?.[0];
  assert.equal(migrated?.origin,'reproduction');
  assert.equal(migrated?.birthHabitat?.biome,'forest');
  assert.equal(migrated?.habitatExposure?.observedDays,.5);
  assert.equal(migrated?.habitatExposure?.lastBiome,'plains');
  assert.equal(migrated?.migrationHistory?.[0]?.fromChunkId,'chunk_0_0');
  store.close();
  fs.rmSync(dir,{recursive:true,force:true});
});


test('server evolution stats use persisted world time for living fitness eligibility',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'latticefolk-fitness-time-'));
  const file=path.join(dir,'world.sqlite');
  const store=new WorldPersistence(file);
  const exposure=(pressure:number)=>({
    observedDays:1,
    habitatMean:{ecology:80,food:70,water:72,danger:20,settlementLevel:0,plantBiomass:74,competitionPressure:20,seasonalSuitability:78,diseasePressure:pressure},
    biomeDays:{forest:1},
    chunkDays:{chunk_0_0:1},
    observedTransitions:0
  });
  const snapshot:WorldPersistenceSnapshot={
    version:1,
    meta:{day:200,minuteOfDay:720,weather:'clear',playerPosition:{x:0,z:0},playerInventory:{apple:0,bread:0,wood:0,coin:0,flower:0,grain:0,flour:0,water:0,stone:0,plank:0,tool:0}},
    coarseChunks:[],fineChunks:[],homeNpcs:[],homeObjects:[],
    wildlifeLineage:[
      {
        entityId:'adult_living',species:'rabbit',birthDay:1,generation:0,birthChunk:'chunk_0_0',
        traitsAtBirth:{speed:2,size:.6,fertility:.8,wariness:.7},habitatExposure:exposure(20),
        origin:'founder',offspringCount:1,reproductiveSuccess:true
      },
      {
        entityId:'juvenile_living',species:'rabbit',birthDay:150,generation:1,birthChunk:'chunk_0_0',
        traitsAtBirth:{speed:2,size:.6,fertility:.8,wariness:.7},habitatExposure:exposure(80),
        origin:'reproduction',offspringCount:0,reproductiveSuccess:false
      },
      {
        entityId:'juvenile_dead',species:'rabbit',birthDay:150,deathDay:170,deathReason:'disease',generation:1,birthChunk:'chunk_0_0',
        traitsAtBirth:{speed:2,size:.6,fertility:.8,wariness:.7},habitatExposure:exposure(90),
        origin:'reproduction',offspringCount:0,reproductiveSuccess:false
      }
    ]
  };
  store.save(snapshot);
  const disease=store.evolutionStats().find(entry=>entry.species==='rabbit')?.exposureFitness
    .find(entry=>entry.dimension==='diseasePressure');
  assert.equal(disease?.sampleSize,3);
  assert.equal(disease?.reproductionEligibleSamples,2);
  assert.equal(disease?.lifespanSamples,1);
  store.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
