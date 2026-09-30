import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { InventoryItem, ItemKind, WorldObjectState, WorldPersistenceSnapshot } from '../src/types.js';
import { WorldPersistence } from '../server/worldPersistence.js';
import { advancePickupRespawn, droppedItemCount, ItemTransferCheckpoint, pickupWorldItem, planInventoryDrop, portableItemMetrics, restoreDroppedItem, restoredPlayerPosition } from '../src/world/portableObjects.js';

const kinds: ItemKind[] = ['apple','bread','wood','coin','flower','grain','flour','water','stone','plank','tool'];
const parcel = (overrides: Partial<WorldObjectState> = {}): WorldObjectState => ({
  id:'drop_ren_one', kind:'dropped_item', name:'Bread parcel', position:{x:48,z:0},
  tags:['dropped','parcel','bread'], usable:false, pickupable:true, item:'bread', ...overrides
});

for (const kind of kinds) {
  test(`${kind}: drop and competing pickups conserve one inventory unit without respawn`, () => {
    const source: InventoryItem[] = [{kind,count:2}];
    const planned = planInventoryDrop(source,`drop_${kind}`,'Parcel',{x:48,z:0},'chunk_2_0')!;
    assert.equal(source[0].count,2,'planning must not debit before registration');
    assert.equal(planned.object.chunkId,'chunk_2_0');
    assert.deepEqual(planned.object.position,{x:48,z:0});
    planned.source.count--;
    const first: InventoryItem[] = [], second: InventoryItem[] = [];
    assert.deepEqual(pickupWorldItem(planned.object,first,1_000),{kind,count:1});
    assert.equal(pickupWorldItem(planned.object,second,1_000),undefined);
    assert.equal(advancePickupRespawn(planned.object,1_000_000),false);
    assert.equal(pickupWorldItem(planned.object,second,1_000_000),undefined);
    assert.equal(source[0].count+first[0].count+second.reduce((n,s)=>n+s.count,0),2);
    assert.equal(droppedItemCount(planned.object),0);
    assert.equal(restoreDroppedItem(planned.object,'chunk_2_0'),undefined);
    assert.equal(planned.object.respawnAt,undefined);
    assert.equal(planned.object.resourceCapacity,undefined);
  });
}

test('legacy available parcels restore once; expired consumed parcels never resurrect', () => {
  const available = parcel({respawnAt:1});
  const original = structuredClone(available);
  const restored = restoreDroppedItem(available,'chunk_2_0')!;
  assert.deepEqual(available,original,'restore must not mutate the decoded snapshot');
  assert.equal(restored.id,available.id);
  assert.equal(restored.resourceAmount,1);
  assert.equal(restored.respawnAt,undefined);
  assert.equal(restored.chunkId,'chunk_2_0');
  assert.deepEqual(restored.capabilities,['inspect','pickup']);
  assert.equal(restoreDroppedItem(parcel({pickupable:false,respawnAt:1})),undefined);
  assert.equal(advancePickupRespawn(parcel({pickupable:false,respawnAt:1}),90_000),false);
  for (const count of [0,-1,.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]) {
    assert.equal(restoreDroppedItem(parcel({resourceAmount:count})),undefined);
  }
  assert.equal(restoreDroppedItem(parcel({item:undefined})),undefined);
});

test('drop planning rejects invalid inputs and cannot make fractional stock negative', () => {
  for (const count of [0,.25,-1,NaN,Infinity]) {
    const inventory: InventoryItem[] = [{kind:'bread',count}];
    assert.equal(planInventoryDrop(inventory,'drop','Parcel',{x:0,z:0}),undefined);
    assert.ok(Object.is(inventory[0].count,count));
  }
  const inventory: InventoryItem[] = [{kind:'bread',count:1.25}];
  const plan = planInventoryDrop(inventory,'drop','Parcel',{x:0,z:0})!;
  plan.source.count--;
  assert.equal(inventory[0].count,.25);
  assert.equal(planInventoryDrop(inventory,'drop2','Parcel',{x:0,z:0}),undefined);
  for (const point of [{x:NaN,z:0},{x:0,z:Infinity}]) {
    assert.equal(planInventoryDrop([{kind:'wood',count:1}],'drop','Parcel',point),undefined);
  }
});

test('pickup validates the recipient before changing either side and transfers explicit quantity once', () => {
  for (const count of [NaN,Infinity,-1,Number.MAX_SAFE_INTEGER]) {
    const object = parcel(), before = structuredClone(object);
    const recipient: InventoryItem[] = [{kind:'bread',count}];
    assert.equal(pickupWorldItem(object,recipient,1_000),undefined);
    assert.deepEqual(object,before);
    assert.ok(Object.is(recipient[0].count,count));
  }
  const object = parcel({resourceAmount:3});
  const recipient: InventoryItem[] = [{kind:'bread',count:2}];
  assert.deepEqual(pickupWorldItem(object,recipient,1_000),{kind:'bread',count:3});
  assert.equal(recipient[0].count,5);
  assert.equal(pickupWorldItem(object,recipient,1_001),undefined);
  const duplicate: InventoryItem[] = [{kind:'bread',count:1},{kind:'bread',count:1}];
  assert.equal(pickupWorldItem(parcel(),duplicate,1_000),undefined);
});

test('the existing authored pickup source respawns, but only after its own timer', () => {
  const source = parcel({id:'crate_wood',kind:'crate',item:'wood'});
  const inventory: InventoryItem[] = [];
  pickupWorldItem(source,inventory,1_000);
  assert.equal(source.respawnAt,46_000);
  assert.equal(advancePickupRespawn(source,45_999),false);
  assert.equal(advancePickupRespawn(source,46_000),true);
  assert.equal(advancePickupRespawn(source,46_001),false);
  assert.equal(source.pickupable,true);
});

test('moving inventory into a parcel does not change fold-back metrics', () => {
  for (const kind of kinds) {
    const before = portableItemMetrics(kind,4);
    const kept = portableItemMetrics(kind,3), dropped = portableItemMetrics(kind,1);
    for (const key of ['food','wood','prosperity'] as const) {
      assert.ok(Math.abs(before[key]-kept[key]-dropped[key])<1e-12,`${kind}/${key}`);
    }
  }
});

test('absolute zero, negative positions and independent fallback axes survive restore', () => {
  assert.deepEqual(restoredPlayerPosition({x:0,z:0}),{x:0,z:0});
  assert.deepEqual(restoredPlayerPosition({x:-48,z:-24}),{x:-48,z:-24});
  assert.deepEqual(restoredPlayerPosition({x:5,z:NaN}),{x:5,z:7});
  assert.deepEqual(restoredPlayerPosition({x:Infinity,z:0}),{x:0,z:0});
  assert.deepEqual(restoredPlayerPosition(undefined),{x:0,z:7});
});

test('an older full-save acknowledgement cannot authorize a later half-transfer beacon', () => {
  const checkpoint = new ItemTransferCheckpoint();
  assert.equal(checkpoint.pending,false);
  checkpoint.markFineChange();
  const held = checkpoint.capture();
  checkpoint.markFineChange();
  checkpoint.acknowledge(held);
  assert.equal(checkpoint.pending,true);
  checkpoint.acknowledge(checkpoint.capture());
  assert.equal(checkpoint.pending,false);
  checkpoint.acknowledge(held);
  assert.equal(checkpoint.pending,false,'late older acknowledgements cannot regress durability');
  assert.throws(()=>checkpoint.acknowledge(99),/Invalid/);
});

test('SQLite reopen keeps home/fine drops and atomically removes a consumed fine parcel', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'latticefolk-parcel-'));
  const file = path.join(directory,'world.sqlite');
  let store = new WorldPersistence(file);
  const inventory = Object.fromEntries(kinds.map(kind=>[kind,0])) as Record<ItemKind,number>;
  const snapshot: WorldPersistenceSnapshot = {
    version:1, meta:{day:1,minuteOfDay:495,weather:'clear',playerPosition:{x:10,z:0},playerInventory:inventory},
    coarseChunks:[{id:'chunk_2_0',cx:2,cz:0,biome:'plains',settlementLevel:0,population:0,
      food:50,wood:50,water:50,ecology:50,danger:0,prosperity:10,
      strategy:'sustain',migrationPolicy:'retain',ecologyPolicy:'balance',lastDecisionAt:0,decisionVersion:0}],
    fineChunks:[{chunkId:'chunk_2_0',npcStates:[],objectStates:[parcel({id:'fine_drop',chunkId:'chunk_2_0'})],wildlifeStates:[]}],
    homeNpcs:[],homeObjects:[parcel({id:'home_drop',position:{x:10,z:0}})]
  };
  try {
    store.save(snapshot,store.revision());
    store.close(); store = new WorldPersistence(file);
    const restored = store.load()!;
    assert.deepEqual(restoredPlayerPosition(restored.meta.playerPosition),{x:10,z:0});
    assert.equal(restoreDroppedItem(restored.homeObjects[0])!.id,'home_drop');
    const drop = restoreDroppedItem(restored.fineChunks[0].objectStates[0],'chunk_2_0')!;
    const recipient: InventoryItem[] = [];
    pickupWorldItem(drop,recipient,1_000);
    restored.meta.playerInventory.bread=recipient[0].count;
    restored.fineChunks[0].objectStates=[];
    store.save(restored,store.revision());
    store.close(); store = new WorldPersistence(file);
    const consumed = store.load()!;
    assert.equal(consumed.meta.playerInventory.bread,1);
    assert.equal(consumed.fineChunks[0].objectStates.length,0);
    assert.equal(consumed.homeObjects.length,1);
    // The normal compact checkpoint omits, not deletes, the already-updated fine row.
    store.save({...consumed,fineChunks:[],coarseChunks:[]},store.revision());
    assert.equal(store.load()!.fineChunks[0].objectStates.length,0);
    assert.equal(store.load()!.meta.playerInventory.bread,1);
  } finally { store.close(); fs.rmSync(directory,{recursive:true,force:true}); }
});
