import test from 'node:test';
import assert from 'node:assert/strict';
import { FinePhysicsAuthority } from '../src/world/finePhysics.js';

test('kinematic controller cannot tunnel through a blocked cell at large frame displacement',()=>{
  const physics=new FinePhysicsAuthority();physics.registerBlockedCell('wall_1',1,0);
  const moved=physics.moveKinematic({id:'player',position:{x:-1,z:0},displacement:{x:4,z:0},radius:.3,maxSubstep:.2});
  assert.equal(moved.collided,true);assert.ok(moved.staticHits.includes('wall_1'));assert.ok(moved.position.x<.2);
});

test('axis-separated resolution slides along a wall instead of cancelling all motion',()=>{
  const physics=new FinePhysicsAuthority();physics.registerStatic({id:'wall',minX:.5,maxX:1.5,minZ:-2,maxZ:2});
  const moved=physics.moveKinematic({id:'npc',position:{x:0,z:-1},displacement:{x:1,z:1},radius:.25});
  assert.ok(moved.displacement.x<.4);assert.ok(moved.displacement.z>.7);assert.ok(moved.staticHits.includes('wall'));
});

test('authoritative door state blocks while closed and permits passage while open',()=>{
  const physics=new FinePhysicsAuthority();
  physics.registerDoor({id:'door:bakery',minX:-.5,maxX:.5,minZ:-.08,maxZ:.08,open:false,chunkId:'home'});
  const closed=physics.moveKinematic({id:'player',position:{x:0,z:-1},displacement:{x:0,z:2},radius:.25});
  assert.equal(closed.collided,true);assert.ok(closed.staticHits.includes('door:bakery'));assert.ok(closed.position.z<-.2);
  assert.equal(physics.setDoorOpen('door:bakery',true),true);assert.equal(physics.doorState('door:bakery')?.open,true);
  const opened=physics.moveKinematic({id:'player',position:{x:0,z:-1},displacement:{x:0,z:2},radius:.25});
  assert.equal(opened.staticHits.includes('door:bakery'),false);assert.ok(opened.position.z>.9);
});

test('chunk teardown removes authoritative doors with the rest of fine physics state',()=>{
  const physics=new FinePhysicsAuthority();
  physics.registerDoor({id:'door:a',minX:-.5,maxX:.5,minZ:-.1,maxZ:.1,open:false,chunkId:'chunk_a'});
  physics.registerDoor({id:'door:b',minX:3.5,maxX:4.5,minZ:-.1,maxZ:.1,open:false,chunkId:'chunk_b'});
  physics.clearChunk('chunk_a');
  assert.equal(physics.doorState('door:a'),undefined);assert.equal(physics.doorState('door:b')?.open,false);
  assert.equal(physics.isBlocked(0,0,.2),false);assert.equal(physics.isBlocked(4,0,.2),true);
});

test('dynamic character circles block overlap while excluding the moving body itself',()=>{
  const physics=new FinePhysicsAuthority();
  const moved=physics.moveKinematic({id:'wolf',position:{x:0,z:0},displacement:{x:2,z:0},radius:.35,dynamic:[{id:'wolf',x:0,z:0,radius:.35},{id:'sheep',x:1.1,z:0,radius:.35}]});
  assert.equal(moved.collided,true);assert.deepEqual(moved.dynamicHits,['sheep']);assert.ok(moved.position.x<.5);
});

test('chunk clear removes only colliders triggers and terrain owned by that materialized chunk',()=>{
  const physics=new FinePhysicsAuthority();
  physics.registerBlockedCell('a_wall',0,0,'chunk_a');physics.registerBlockedCell('b_wall',4,0,'chunk_b');
  physics.registerTrigger({id:'a_trigger',minX:-1,maxX:1,minZ:-1,maxZ:1,chunkId:'chunk_a',tag:'water'});physics.registerTrigger({id:'b_trigger',minX:3,maxX:5,minZ:-1,maxZ:1,chunkId:'chunk_b',tag:'market'});
  physics.registerTerrain({id:'a_ground',minX:-2,maxX:2,minZ:-2,maxZ:2,chunkId:'chunk_a',originX:0,originZ:0,originY:2,slopeX:0,slopeZ:0});
  physics.registerTerrain({id:'b_ground',minX:2,maxX:6,minZ:-2,maxZ:2,chunkId:'chunk_b',originX:4,originZ:0,originY:3,slopeX:0,slopeZ:0});
  physics.clearChunk('chunk_a');
  assert.equal(physics.isBlocked(0,0,.2),false);assert.equal(physics.isBlocked(4,0,.2),true);assert.deepEqual(physics.overlappingTriggers({x:0,z:0}),[]);assert.equal(physics.overlappingTriggers({x:4,z:0})[0]?.id,'b_trigger');
  assert.equal(physics.groundContactAt(0,0),undefined);assert.equal(physics.groundContactAt(4,0)?.height,3);
});

test('trigger overlap is observational and does not block movement',()=>{
  const physics=new FinePhysicsAuthority();physics.registerTrigger({id:'pond',minX:-1,maxX:1,minZ:-1,maxZ:1,tag:'water'});
  const moved=physics.moveKinematic({id:'player',position:{x:-2,z:0},displacement:{x:2,z:0},radius:.25});
  assert.equal(moved.collided,false);assert.ok(moved.position.x>-0.01);assert.equal(physics.overlappingTriggers(moved.position,.25)[0]?.tag,'water');
});

test('existing dynamic overlap can separate instead of trapping restored bodies forever',()=>{
  const physics=new FinePhysicsAuthority();const moved=physics.moveKinematic({id:'npc:a',position:{x:0,z:0},displacement:{x:-.6,z:0},radius:.35,dynamic:[{id:'npc:b',x:.2,z:0,radius:.35}]});
  assert.equal(moved.dynamicHits.length,0);assert.ok(moved.position.x<-.5);
});

test('ground contact is deterministic and reports planar height and slope',()=>{
  const physics=new FinePhysicsAuthority();
  physics.registerTerrain({id:'hill',minX:-5,maxX:5,minZ:-5,maxZ:5,originX:0,originZ:0,originY:2,slopeX:.25,slopeZ:-.1});
  const contact=physics.groundContactAt(4,2);
  assert.equal(contact?.surfaceId,'hill');assert.ok(Math.abs((contact?.height??0)-2.8)<1e-9);assert.ok((contact?.slope??0)>0);
});

test('bounded slope traversal accepts gentle terrain and rejects terrain above controller limit',()=>{
  const physics=new FinePhysicsAuthority();
  physics.registerTerrain({id:'gentle',minX:-2,maxX:0,minZ:-2,maxZ:2,originX:-2,originZ:0,originY:0,slopeX:.2,slopeZ:0});
  physics.registerTerrain({id:'cliff',minX:0,maxX:3,minZ:-2,maxZ:2,originX:0,originZ:0,originY:.4,slopeX:2,slopeZ:0});
  const moved=physics.moveKinematic({id:'player',position:{x:-1.5,z:0},displacement:{x:3,z:0},radius:.25,maxSlope:Math.PI/6,maxGroundStep:.5});
  assert.equal(moved.collided,true);assert.deepEqual(moved.terrainHits,['cliff']);assert.ok(moved.position.x<=0);assert.equal(moved.ground?.surfaceId,'gentle');
});

test('ground step limit blocks discontinuous ledges even when both surfaces are flat',()=>{
  const physics=new FinePhysicsAuthority();
  physics.registerTerrain({id:'low',minX:-2,maxX:0,minZ:-1,maxZ:1,originX:0,originZ:0,originY:0,slopeX:0,slopeZ:0});
  physics.registerTerrain({id:'high',minX:0,maxX:2,minZ:-1,maxZ:1,originX:0,originZ:0,originY:1.2,slopeX:0,slopeZ:0});
  const moved=physics.moveKinematic({id:'npc',position:{x:-.4,z:0},displacement:{x:1,z:0},radius:.2,maxGroundStep:.3});
  assert.ok(moved.terrainHits.includes('high'));assert.ok(moved.position.x<=0);
});
