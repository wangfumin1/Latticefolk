import assert from 'node:assert/strict';
import test from 'node:test';
import { PhysicsAuthority } from '../src/world/physicsAuthority.js';

const controller={radius:.35,maxSubstep:.15,maxSlopeDegrees:46};

test('character controller cannot tunnel through a thin static AABB',()=>{
  const physics=new PhysicsAuthority();
  physics.upsertStaticAabb('wall',{x:1,z:0},.08,2);
  const result=physics.moveCharacter({
    id:'player',position:{x:0,z:0},desiredDelta:{x:2,z:0},config:controller
  });
  assert.ok(result.position.x<.6);
  assert.ok(result.collisions.includes('wall'));
  assert.equal(result.blocked,true);
  assert.ok(result.substeps>1);
});

test('character controller slides along a blocking surface instead of discarding the whole move',()=>{
  const physics=new PhysicsAuthority();
  physics.upsertStaticAabb('wall',{x:1,z:0},.15,3);
  const result=physics.moveCharacter({
    id:'npc',position:{x:.45,z:0},desiredDelta:{x:.7,z:1},config:controller
  });
  assert.ok(result.position.z>.5);
  assert.ok(result.position.x<.7);
  assert.ok(result.collisions.includes('wall'));
});

test('awake characters collide with each other through the same authority',()=>{
  const physics=new PhysicsAuthority();
  physics.upsertCharacter('wildlife',{x:1,z:0},.4);
  const result=physics.moveCharacter({
    id:'player',position:{x:0,z:0},desiredDelta:{x:1.2,z:0},config:controller
  });
  assert.ok(result.position.x<.3);
  assert.ok(result.collisions.includes('wildlife'));
});

test('triggers are queryable but never block character displacement',()=>{
  const physics=new PhysicsAuthority();
  physics.upsertTriggerCircle('water_trigger',{x:.8,z:0},.5,undefined,['water']);
  const result=physics.moveCharacter({
    id:'player',position:{x:0,z:0},desiredDelta:{x:1,z:0},config:controller
  });
  assert.ok(result.position.x>.95);
  assert.deepEqual(result.collisions,[]);
  assert.deepEqual(physics.queryTriggers(result.position,.35,['water']),['water_trigger']);
});

test('sleeping chunk bodies neither collide nor trigger until woken',()=>{
  const physics=new PhysicsAuthority();
  physics.upsertStaticAabb('remote_wall',{x:1,z:0},.2,2,'chunk_2_2');
  physics.upsertTriggerCircle('remote_trigger',{x:1,z:0},.8,'chunk_2_2',['zone']);
  physics.sleepChunk('chunk_2_2');

  const sleepingMove=physics.moveCharacter({
    id:'player',position:{x:0,z:0},desiredDelta:{x:1.4,z:0},config:controller
  });
  assert.ok(sleepingMove.position.x>1.3);
  assert.deepEqual(physics.queryTriggers({x:1,z:0},.2,['zone']),[]);

  physics.wakeChunk('chunk_2_2');
  const awakeMove=physics.moveCharacter({
    id:'player2',position:{x:0,z:0},desiredDelta:{x:1.4,z:0},config:controller
  });
  assert.ok(awakeMove.position.x<.5);
  assert.ok(awakeMove.collisions.includes('remote_wall'));
  assert.deepEqual(physics.queryTriggers({x:1,z:0},.2,['zone']),['remote_trigger']);
});

test('removeChunkBodies prevents dormant physics state from growing without bound',()=>{
  const physics=new PhysicsAuthority();
  physics.upsertStaticCircle('tree',{x:2,z:2},.45,'chunk_old');
  physics.upsertCharacter('animal',{x:3,z:2},.4,'chunk_old');
  physics.sleepChunk('chunk_old');
  assert.equal(physics.allBodies().length,2);
  physics.removeChunkBodies('chunk_old');
  assert.equal(physics.allBodies().length,0);
  assert.equal(physics.isChunkSleeping('chunk_old'),false);
});
