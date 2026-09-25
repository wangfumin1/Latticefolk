import test from 'node:test';
import assert from 'node:assert/strict';
import { FinePhysicsAuthority } from '../src/world/finePhysics.js';
import { resolveContactAttack } from '../src/world/contactCombat.js';

const attacker={id:'wildlife:wolf',x:0,z:0,radius:.34};
const prey={id:'wildlife:rabbit',x:2,z:0,radius:.24};

test('contact attack hits only when the intended prey is the first physical contact',()=>{
  const physics=new FinePhysicsAuthority();
  const result=resolveContactAttack(physics,{
    attackerId:attacker.id,targetId:prey.id,
    start:{x:attacker.x,z:attacker.z},end:{x:prey.x,z:prey.z},
    maxRange:2.3,sweepRadius:.08,dynamic:[attacker,prey]
  });
  assert.equal(result.status,'hit');
  assert.equal(result.contact?.id,prey.id);
  assert.equal(result.contact?.kind,'dynamic');
});

test('contact attack is blocked by shared static authority before damage can be applied',()=>{
  const physics=new FinePhysicsAuthority();
  physics.registerStatic({id:'wall',minX:.9,maxX:1.1,minZ:-.5,maxZ:.5});
  const result=resolveContactAttack(physics,{
    attackerId:attacker.id,targetId:prey.id,
    start:{x:0,z:0},end:{x:2,z:0},
    maxRange:2.3,sweepRadius:.08,dynamic:[attacker,prey]
  });
  assert.equal(result.status,'blocked');
  assert.equal(result.blockerId,'wall');
  assert.equal(result.blockerKind,'static');
});

test('closed authoritative doors block attacks while open doors do not',()=>{
  const physics=new FinePhysicsAuthority();
  physics.registerDoor({id:'door:entrance',minX:.9,maxX:1.1,minZ:-.5,maxZ:.5,open:false});
  const input={
    attackerId:attacker.id,targetId:prey.id,start:{x:0,z:0},end:{x:2,z:0},
    maxRange:2.3,sweepRadius:.08,dynamic:[attacker,prey]
  } as const;
  assert.equal(resolveContactAttack(physics,input).blockerKind,'door');
  physics.setDoorOpen('door:entrance',true);
  assert.equal(resolveContactAttack(physics,input).status,'hit');
});

test('materialized dynamic bodies can physically interpose between predator and prey',()=>{
  const physics=new FinePhysicsAuthority();
  const bystander={id:'wildlife:deer',x:1,z:0,radius:.32};
  const result=resolveContactAttack(physics,{
    attackerId:attacker.id,targetId:prey.id,
    start:{x:0,z:0},end:{x:2,z:0},
    maxRange:2.3,sweepRadius:.08,dynamic:[attacker,bystander,prey]
  });
  assert.equal(result.status,'blocked');
  assert.equal(result.blockerId,bystander.id);
  assert.equal(result.blockerKind,'dynamic');
});

test('contact attack preserves bounded range and rejects absent physical targets',()=>{
  const physics=new FinePhysicsAuthority();
  assert.equal(resolveContactAttack(physics,{
    attackerId:attacker.id,targetId:prey.id,start:{x:0,z:0},end:{x:3,z:0},
    maxRange:2.3,dynamic:[attacker,prey]
  }).status,'out_of_range');
  assert.equal(resolveContactAttack(physics,{
    attackerId:attacker.id,targetId:prey.id,start:{x:0,z:0},end:{x:2,z:0},
    maxRange:2.3,dynamic:[attacker]
  }).status,'missing_target');
});
