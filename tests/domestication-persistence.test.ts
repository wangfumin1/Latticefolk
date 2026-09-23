import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WorldPersistence } from '../server/worldPersistence.js';
import type { WildlifeDomesticationState, WildlifeState, WorldPersistenceSnapshot } from '../src/types.js';

const inventory={apple:0,bread:0,wood:0,coin:0,flower:0,grain:0,flour:0,water:0,stone:0,plank:0,tool:0};

const domestication:WildlifeDomesticationState={
  tameProgress:100,
  ownerId:'player',
  command:'follow',
  breedingAllowed:true,
  claimedDay:3.25,
  lastInteractionDay:4.5
};

const sheepState=(id:string,command:WildlifeDomesticationState['command']='follow'):WildlifeState=>({
  id,chunkId:'chunk_0_0',species:'sheep',position:{x:2,z:3},ageDays:600,
  health:91,hunger:28,thirst:22,energy:79,sex:'female',generation:2,
  traits:{speed:2.1,size:.9,fertility:.61,wariness:.62},
  currentAction:'graze',lastDecisionAt:0,birthDay:2,
  domestication:{...domestication,command}
});

test('domestication state persists through fine chunks transfers and durable lineage',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'latticefolk-domestication-'));
  const file=path.join(dir,'world.sqlite');
  const store=new WorldPersistence(file);

  const living=sheepState('sheep_owned');
  const transferring=sheepState('sheep_transfer','stay');
  transferring.chunkId='chunk_1_0';
  transferring.representedPopulation=1.5;

  const snapshot:WorldPersistenceSnapshot={
    version:1,
    meta:{day:5,minuteOfDay:600,weather:'clear',playerPosition:{x:0,z:0},playerInventory:{...inventory}},
    coarseChunks:[],
    fineChunks:[{chunkId:'chunk_0_0',npcStates:[],objectStates:[],wildlifeStates:[living]}],
    homeNpcs:[],
    homeObjects:[],
    wildlifeTransfers:[{
      entityId:transferring.id,
      state:transferring,
      fromChunkId:'chunk_0_0',
      toChunkId:'chunk_1_0',
      representedPopulation:1.5,
      transferredDay:4.75
    }],
    wildlifeLineage:[{
      entityId:'sheep_dead',
      species:'sheep',
      motherId:'sheep_mother',
      fatherId:'sheep_father',
      birthDay:1,
      deathDay:5,
      deathReason:'senescence',
      generation:3,
      birthChunk:'chunk_0_0',
      deathChunk:'chunk_1_0',
      traitsAtBirth:{speed:2,size:.85,fertility:.58,wariness:.6},
      traitsAtDeath:{speed:2,size:.85,fertility:.58,wariness:.6},
      domesticationAtBirth:{
        tameProgress:100,ownerId:'player',command:'none',breedingAllowed:false,claimedDay:1
      },
      domesticationAtDeath:{
        tameProgress:100,ownerId:'player',command:'stay',breedingAllowed:true,claimedDay:1,lastInteractionDay:4.9
      },
      origin:'reproduction',
      offspringCount:2,
      reproductiveSuccess:true
    }]
  };

  store.save(snapshot);
  const loaded=store.load();
  assert.ok(loaded);
  assert.equal(loaded.fineChunks[0]?.wildlifeStates?.[0]?.domestication?.ownerId,'player');
  assert.equal(loaded.fineChunks[0]?.wildlifeStates?.[0]?.domestication?.command,'follow');
  assert.equal(loaded.fineChunks[0]?.wildlifeStates?.[0]?.domestication?.breedingAllowed,true);

  assert.equal(loaded.wildlifeTransfers?.[0]?.state.domestication?.ownerId,'player');
  assert.equal(loaded.wildlifeTransfers?.[0]?.state.domestication?.command,'stay');
  assert.equal(loaded.wildlifeTransfers?.[0]?.state.representedPopulation,1.5);

  assert.equal(loaded.wildlifeLineage?.[0]?.domesticationAtBirth?.ownerId,'player');
  assert.equal(loaded.wildlifeLineage?.[0]?.domesticationAtBirth?.command,'none');
  assert.equal(loaded.wildlifeLineage?.[0]?.domesticationAtDeath?.command,'stay');
  assert.equal(loaded.wildlifeLineage?.[0]?.domesticationAtDeath?.breedingAllowed,true);
  assert.equal(loaded.wildlifeLineage?.[0]?.domesticationAtDeath?.lastInteractionDay,4.9);

  store.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
