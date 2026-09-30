import test from 'node:test';
import assert from 'node:assert/strict';
import { FinePhysicsAuthority } from '../src/world/finePhysics.js';
import { playerHeadConstraint, playerHeadClearance } from '../src/world/characterContact.js';
import { npcYieldOptions, stepNpcYield, type NpcYieldPlan } from '../src/world/npcYield.js';

const oven={id:'object:oven',minX:-10.6301724752851,maxX:-9.3698275247149,minZ:-13.007765401424031,maxZ:-12.192234598575968};
const fixture=()=>({id:'npc:ren',asset:'female2',position:{x:-9.4125,z:-11},yaw:0,
  player:{x:-10,z:-9.9125},travel:{x:0,z:-.225},activePath:true,blockedPlayer:true,dt:.05,
  dynamic:[{id:'player',x:-10,z:-9.9125,radius:.3}]});

test('moving Ren clears the reproduced home-oven lane through bounded reciprocal physics',()=>{
  const physics=new FinePhysicsAuthority();physics.registerStatic(oven);
  let npc={x:-9.4125,z:-11},player={x:-10,z:-9.9125},plan:NpcYieldPlan|undefined;
  const originalNpc={...npc},originalPlayer={...player};let yielded=0;
  const task={action:'work',targetObjectId:'oven'},path=[{x:-10,z:-13.1}];
  const semanticBefore=JSON.stringify({task,path});
  for(let frame=0;frame<120;frame++){
    const moved=physics.moveKinematic({id:'player',position:player,displacement:{x:0,z:-.225},radius:.3,
      dynamic:[{id:'npc:ren',...npc,radius:.32}],constraints:[playerHeadConstraint('npc:ren','female2',npc,0)]});
    player=moved.position;
    const result=stepNpcYield(physics,{...fixture(),position:npc,player,plan,
      blockedPlayer:moved.dynamicHits.includes('npc:ren'),dynamic:[{id:'player',...player,radius:.3}]});
    plan=result?.plan;if(result){npc=result.position;yielded++;}
    assert.ok(playerHeadClearance('female2',npc,0,player)>=-1e-8);
    assert.ok(!physics.isBlocked(npc.x,npc.z,.32));assert.ok(!physics.isBlocked(player.x,player.z,.3));
  }
  assert.ok(yielded>0&&yielded<40);assert.ok(npc.x>originalNpc.x+1);
  assert.equal(npc.z,originalNpc.z,'sidestep is lateral, never teleport to the oven');
  assert.equal(player.x,originalPlayer.x,'original player route retained');
  assert.ok(player.z<oven.maxZ+.43&&player.z>=oven.maxZ+.3-1e-8,JSON.stringify({npc,player}));
  assert.equal(JSON.stringify({task,path}),semanticBefore,'yield does not replace task, path or production');
});

test('idle NPCs, absent God View player, released input and invalid steps cannot yield',()=>{
  const physics=new FinePhysicsAuthority(),input=fixture();
  for(const changed of [{activePath:false},{player:undefined},{travel:undefined},{travel:{x:0,z:0}},
    {dt:NaN},{dt:-1},{blockedPlayer:false}])assert.equal(stepNpcYield(physics,{...input,...changed}),undefined);
  assert.deepEqual(input,fixture(),'inputs are immutable');
});

test('blocked yield stays physically blocked and never disables static or other dynamic bodies',()=>{
  const input=fixture(),physics=new FinePhysicsAuthority();
  physics.registerStatic({id:'east-wall',minX:input.position.x+.32,maxX:input.position.x+2,minZ:-12,maxZ:-10});
  physics.registerStatic({id:'west-wall',minX:input.position.x-2,maxX:input.position.x-.32,minZ:-12,maxZ:-10});
  assert.equal(stepNpcYield(physics,input),undefined);
  const free=new FinePhysicsAuthority();
  assert.equal(stepNpcYield(free,{...input,dynamic:[...input.dynamic,
    {id:'npc:east',x:input.position.x+.64,z:-11,radius:.32},{id:'npc:west',x:input.position.x-.64,z:-11,radius:.32}]}),undefined);
});

test('source-projected side choice rotates with travel and retains simulation speed cap',()=>{
  const input=fixture(),physics=new FinePhysicsAuthority();
  const choices=npcYieldOptions(input.asset,input.position,input.yaw,input.player,input.travel);
  assert.deepEqual(choices[0].direction,{x:1,z:0});assert.ok(choices[0].remaining<choices[1].remaining);
  const moved=stepNpcYield(physics,{...input,dt:1000})!;
  assert.ok(Math.hypot(moved.position.x-input.position.x,moved.position.z-input.position.z)<=1.65*.05+1e-9);
  assert.equal(stepNpcYield(physics,{...input,blockedPlayer:false,travel:{x:0,z:.225},plan:choices[0]}),undefined,'reversing intent cancels old sidestep');
  assert.deepEqual(npcYieldOptions(input.asset,input.position,NaN,input.player,input.travel),[]);
});
