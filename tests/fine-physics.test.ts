import test from 'node:test';
import assert from 'node:assert/strict';
import { FinePhysicsAuthority } from '../src/world/finePhysics.js';

test('kinematic controller cannot tunnel through a blocked cell at large frame displacement',()=>{
  const physics=new FinePhysicsAuthority();
  physics.registerBlockedCell('wall_1',1,0);
  const moved=physics.moveKinematic({
    id:'player',
    position:{x:-1,z:0},
    displacement:{x:4,z:0},
    radius:.3,
    maxSubstep:.2
  });
  assert.equal(moved.collided,true);
  assert.ok(moved.staticHits.includes('wall_1'));
  assert.ok(moved.position.x<.2,'controller should stop before the cell expanded by body radius');
});

test('axis-separated resolution slides along a wall instead of cancelling all motion',()=>{
  const physics=new FinePhysicsAuthority();
  physics.registerStatic({id:'wall',minX:.5,maxX:1.5,minZ:-2,maxZ:2});
  const moved=physics.moveKinematic({
    id:'npc',
    position:{x:0,z:-1},
    displacement:{x:1,z:1},
    radius:.25
  });
  assert.ok(moved.displacement.x<.4);
  assert.ok(moved.displacement.z>.7);
  assert.ok(moved.staticHits.includes('wall'));
});

test('dynamic character circles block overlap while excluding the moving body itself',()=>{
  const physics=new FinePhysicsAuthority();
  const moved=physics.moveKinematic({
    id:'wolf',
    position:{x:0,z:0},
    displacement:{x:2,z:0},
    radius:.35,
    dynamic:[
      {id:'wolf',x:0,z:0,radius:.35},
      {id:'sheep',x:1.1,z:0,radius:.35}
    ]
  });
  assert.equal(moved.collided,true);
  assert.deepEqual(moved.dynamicHits,['sheep']);
  assert.ok(moved.position.x<.5);
});

test('chunk clear removes only colliders and triggers owned by that materialized chunk',()=>{
  const physics=new FinePhysicsAuthority();
  physics.registerBlockedCell('a_wall',0,0,'chunk_a');
  physics.registerBlockedCell('b_wall',4,0,'chunk_b');
  physics.registerTrigger({id:'a_trigger',minX:-1,maxX:1,minZ:-1,maxZ:1,chunkId:'chunk_a',tag:'water'});
  physics.registerTrigger({id:'b_trigger',minX:3,maxX:5,minZ:-1,maxZ:1,chunkId:'chunk_b',tag:'market'});
  physics.clearChunk('chunk_a');
  assert.equal(physics.isBlocked(0,0,.2),false);
  assert.equal(physics.isBlocked(4,0,.2),true);
  assert.deepEqual(physics.overlappingTriggers({x:0,z:0}),[]);
  assert.equal(physics.overlappingTriggers({x:4,z:0})[0]?.id,'b_trigger');
});

test('trigger overlap is observational and does not block movement',()=>{
  const physics=new FinePhysicsAuthority();
  physics.registerTrigger({id:'pond',minX:-1,maxX:1,minZ:-1,maxZ:1,tag:'water'});
  const moved=physics.moveKinematic({
    id:'player',
    position:{x:-2,z:0},
    displacement:{x:2,z:0},
    radius:.25
  });
  assert.equal(moved.collided,false);
  assert.ok(moved.position.x>-0.01);
  assert.equal(physics.overlappingTriggers(moved.position,.25)[0]?.tag,'water');
});
