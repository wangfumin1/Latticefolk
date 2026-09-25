import test from 'node:test';
import assert from 'node:assert/strict';
import { FinePhysicsAuthority } from '../src/world/finePhysics.js';
import { resolveMovableBodyStep } from '../src/world/movablePhysics.js';

test('movable props reuse fine physics and stop at static authority',()=>{
  const physics=new FinePhysicsAuthority();
  physics.registerStatic({id:'wall',minX:1,maxX:1.2,minZ:-1,maxZ:1});
  const moved=resolveMovableBodyStep(physics,{id:'object:cart',position:{x:0,z:0},radius:.4},{x:2,z:0});
  assert.equal(moved.collided,true);
  assert.ok(moved.staticHits.includes('wall'));
  assert.ok(moved.position.x<.61);
});

test('movable props respect other dynamic bodies without mutating the supplied start',()=>{
  const physics=new FinePhysicsAuthority();
  const start={x:0,z:0};
  const moved=resolveMovableBodyStep(
    physics,
    {id:'object:cart',position:start,radius:.45},
    {x:1.5,z:0},
    [{id:'npc:worker',x:1.2,z:0,radius:.32}]
  );
  assert.equal(moved.collided,true);
  assert.deepEqual(moved.dynamicHits,['npc:worker']);
  assert.deepEqual(start,{x:0,z:0});
  assert.ok(moved.position.x<.5);
});
