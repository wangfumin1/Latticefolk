import test from 'node:test';
import assert from 'node:assert/strict';
import { FinePhysicsAuthority } from '../src/world/finePhysics.js';
import {
  RIGID_BODY_ARCHETYPES,
  normalizeWorldObjectRigidBody,
  resolveMovableBodyStep,
  worldObjectRigidBody
} from '../src/world/movablePhysics.js';
import type { WorldObjectState } from '../src/types.js';

const state=(overrides:Partial<WorldObjectState>={}):WorldObjectState=>({
  id:'cart',kind:'cart',name:'cart',position:{x:0,z:0},tags:[],usable:true,pickupable:false,
  ...overrides
});

test('cart rigid-body archetype centralizes deterministic physics parameters',()=>{
  const profile=worldObjectRigidBody(state({rigidBodyArchetype:'cart'}));
  assert.deepEqual(profile,RIGID_BODY_ARCHETYPES.cart);
  assert.equal(profile?.radius,1.05);
  assert.equal(profile?.maxSubstep,.14);
});

test('legacy movable cart snapshots upgrade to the canonical persisted archetype',()=>{
  const legacy=state({movable:true,physicsRadius:1.05});
  const profile=normalizeWorldObjectRigidBody(legacy);
  assert.equal(profile?.id,'cart');
  assert.equal(legacy.rigidBodyArchetype,'cart');
  assert.equal(legacy.movable,undefined);
  assert.equal(legacy.physicsRadius,undefined);
  assert.deepEqual(worldObjectRigidBody(legacy),RIGID_BODY_ARCHETYPES.cart);
});

test('non-rigid world objects do not acquire physical movement semantics',()=>{
  assert.equal(worldObjectRigidBody(state({kind:'bench'})),undefined);
});

test('movable props reuse fine physics and stop at static authority',()=>{
  const physics=new FinePhysicsAuthority();
  physics.registerStatic({id:'wall',minX:1,maxX:1.2,minZ:-1,maxZ:1});
  const moved=resolveMovableBodyStep(
    physics,
    {id:'object:cart',position:{x:0,z:0},archetype:{...RIGID_BODY_ARCHETYPES.cart,radius:.4}},
    {x:2,z:0}
  );
  assert.equal(moved.collided,true);
  assert.ok(moved.staticHits.includes('wall'));
  assert.ok(moved.position.x<.61);
});

test('movable props respect other dynamic bodies without mutating the supplied start',()=>{
  const physics=new FinePhysicsAuthority();
  const start={x:0,z:0};
  const moved=resolveMovableBodyStep(
    physics,
    {id:'object:cart',position:start,archetype:{...RIGID_BODY_ARCHETYPES.cart,radius:.45}},
    {x:1.5,z:0},
    [{id:'npc:worker',x:1.2,z:0,radius:.32}]
  );
  assert.equal(moved.collided,true);
  assert.deepEqual(moved.dynamicHits,['npc:worker']);
  assert.deepEqual(start,{x:0,z:0});
  assert.ok(moved.position.x<.5);
});
