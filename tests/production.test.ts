import test from 'node:test';
import assert from 'node:assert/strict';
import type { InventoryItem } from '../src/types.js';
import { craftAtWorkstation } from '../src/world/production.js';

const amount=(inventory:InventoryItem[],kind:InventoryItem['kind'])=>inventory.find(x=>x.kind===kind)?.count||0;

test('grain becomes flour before bread',()=>{
  const inv:InventoryItem[]=[{kind:'grain',count:2},{kind:'water',count:1}];
  const milling=craftAtWorkstation(['mill'],inv,'farmer');
  assert.equal(milling.ok,true);
  assert.equal(amount(inv,'flour'),2);
  const baking=craftAtWorkstation(['baker','oven'],inv,'baker');
  assert.equal(baking.ok,true);
  assert.equal(amount(inv,'bread'),2);
  assert.equal(amount(inv,'water'),0);
});

test('wood requires a plank step before tool assembly',()=>{
  const inv:InventoryItem[]=[{kind:'wood',count:1},{kind:'stone',count:1}];
  const sawing=craftAtWorkstation(['maker','sawmill'],inv,'maker');
  assert.equal(sawing.recipe?.id,'saw_planks');
  assert.equal(sawing.ok,true);
  assert.equal(amount(inv,'plank'),2);
  const tool=craftAtWorkstation(['maker','workshop'],inv,'maker');
  assert.equal(tool.recipe?.id,'forge_tool');
  assert.equal(tool.ok,true);
  assert.equal(amount(inv,'tool'),1);
  assert.equal(amount(inv,'plank'),1);
});
