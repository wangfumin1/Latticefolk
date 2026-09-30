import test from 'node:test';
import assert from 'node:assert/strict';
import { bakingWorkApproach } from '../src/world/npcWorkApproach.js';
import { FinePhysicsAuthority } from '../src/world/finePhysics.js';
import { playerHeadClearance } from '../src/world/characterContact.js';
import { craftAtWorkstation } from '../src/world/production.js';

const bounds={id:'object:oven',minX:-10.6301724752851,maxX:-9.3698275247149,minZ:-13.007765401424031,maxZ:-12.192234598575968};
for(const asset of ['female1','female2','male1','male2'])test(`${asset} oven stance is reachable, faces the source and leaves the unchanged front aisle clear`,()=>{
  for(const offset of [{x:0,z:0},{x:50.6,z:-13.1}]){
    const collider={...bounds,minX:bounds.minX+offset.x,maxX:bounds.maxX+offset.x,minZ:bounds.minZ+offset.z,maxZ:bounds.maxZ+offset.z};
    const anchor={x:-10+offset.x,z:-13+offset.z};
    const physics=new FinePhysicsAuthority();physics.registerStatic(collider);
    const point=bakingWorkApproach(asset,anchor,collider,(p,r)=>physics.isBlocked(p.x,p.z,r))!;
    assert.ok(point);assert.ok(point.x>collider.maxX);
    assert.ok(!physics.isBlocked(point.x,point.z,.32));assert.ok(Math.hypot(point.x-anchor.x,point.z-anchor.z)<2.3);
    assert.ok(point.yaw<0,'actor faces inward, not the observer');
    for(let z=anchor.z+3.2;z>=collider.maxZ+.3;z-=.025)
      assert.ok(playerHeadClearance(asset,point,point.yaw,{x:anchor.x,z})>0,`${asset} front approach at ${z}`);
  }
});

test('blocked or missing oven stance fails closed without changing identity or ingredients',()=>{
  const anchor={x:-10,z:-13},identity={id:'oven',tags:['baker','bread'],position:anchor};
  assert.equal(bakingWorkApproach('female2',anchor,undefined,()=>false),undefined);
  assert.equal(bakingWorkApproach('female2',anchor,bounds,()=>true),undefined);
  assert.equal(bakingWorkApproach('female2',anchor,{...bounds,maxX:NaN},()=>false),undefined);
  const left=bakingWorkApproach('female2',anchor,bounds,p=>p.x>-10)!;
  assert.ok(left.x<bounds.minX,'static obstruction selects the other existing side');
  assert.deepEqual(identity,{id:'oven',tags:['baker','bread'],position:{x:-10,z:-13}});
  const inventory=[{kind:'flour' as const,count:2},{kind:'water' as const,count:1}];
  const result=craftAtWorkstation(identity.tags,inventory,'baker');
  assert.equal(result.ok,true);assert.equal(inventory.find(x=>x.kind==='flour')!.count,1);
  assert.equal(inventory.find(x=>x.kind==='water')!.count,0);
});
