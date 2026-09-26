import test from 'node:test';
import assert from 'node:assert/strict';
import { FinePhysicsAuthority } from '../src/world/finePhysics.js';
import { resolveContactAction } from '../src/world/contactAction.js';

test('physical action reaches the intended static target when it is first contact',()=>{
  const physics=new FinePhysicsAuthority();
  physics.registerStatic({id:'object:tree',minX:1.7,maxX:2.3,minZ:-.3,maxZ:.3});
  const result=resolveContactAction(physics,{actorId:'player',targetId:'object:tree',start:{x:0,z:0},end:{x:2,z:0},maxRange:3});
  assert.equal(result.status,'hit'); assert.equal(result.contact?.id,'object:tree');
});

test('physical action is blocked by shared collision geometry before resource consequences',()=>{
  const physics=new FinePhysicsAuthority();
  physics.registerStatic({id:'wall',minX:.8,maxX:1,minZ:-1,maxZ:1});
  physics.registerStatic({id:'object:rock',minX:1.7,maxX:2.3,minZ:-.3,maxZ:.3});
  const result=resolveContactAction(physics,{actorId:'player',targetId:'object:rock',start:{x:0,z:0},end:{x:2,z:0},maxRange:3});
  assert.equal(result.status,'blocked'); assert.equal(result.blockerId,'wall');
});

test('materialized dynamic bodies can interpose tool contact',()=>{
  const physics=new FinePhysicsAuthority();
  physics.registerStatic({id:'object:tree',minX:1.7,maxX:2.3,minZ:-.3,maxZ:.3});
  const result=resolveContactAction(physics,{actorId:'player',targetId:'object:tree',start:{x:0,z:0},end:{x:2,z:0},maxRange:3,dynamic:[{id:'npc:worker',x:1,z:0,radius:.3}]});
  assert.equal(result.status,'blocked'); assert.equal(result.blockerId,'npc:worker'); assert.equal(result.blockerKind,'dynamic');
});

test('physical action rejects targets outside its deterministic reach',()=>{
  const physics=new FinePhysicsAuthority();
  physics.registerStatic({id:'object:rock',minX:4.7,maxX:5.3,minZ:-.3,maxZ:.3});
  const result=resolveContactAction(physics,{actorId:'player',targetId:'object:rock',start:{x:0,z:0},end:{x:5,z:0},maxRange:3});
  assert.equal(result.status,'out_of_range');
});
