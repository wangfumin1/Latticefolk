import test from 'node:test';
import assert from 'node:assert/strict';
import { buildingPhysicsLayout } from '../src/world/buildingPhysics.js';
import { FinePhysicsAuthority } from '../src/world/finePhysics.js';

test('building footprint becomes walls plus one authoritative doorway',()=>{
 const l=buildingPhysicsLayout({id:'market',x:8,z:-18,w:10,d:8,rotationY:0,chunkId:'home'});
 assert.equal(l.entrance,'north');assert.deepEqual(l.doorCenter,{x:8,z:-14});assert.deepEqual(l.interactionPosition,{x:8,z:-12.85});assert.equal(l.walls.length,5);
 const p=new FinePhysicsAuthority();l.walls.forEach(c=>p.registerStatic(c));p.registerDoor(l.door);
 assert.equal(p.isBlocked(8,-14,.3),true);assert.equal(p.isBlocked(4,-18,.3),false);assert.equal(p.isBlocked(3.1,-18,.3),true);
 p.setDoorOpen(l.door.id,true);assert.equal(p.isBlocked(8,-14,.3),false);
});
test('entrance face follows nearest cardinal authored orientation',()=>{
 assert.equal(buildingPhysicsLayout({id:'n',x:0,z:0,w:8,d:6,rotationY:0}).entrance,'north');
 assert.equal(buildingPhysicsLayout({id:'s',x:0,z:0,w:8,d:6,rotationY:Math.PI}).entrance,'south');
 assert.equal(buildingPhysicsLayout({id:'e',x:0,z:0,w:8,d:6,rotationY:Math.PI/2}).entrance,'east');
 assert.equal(buildingPhysicsLayout({id:'w',x:0,z:0,w:8,d:6,rotationY:-Math.PI/2}).entrance,'west');
});
