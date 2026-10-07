import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {StreamedActors} from '../src/scene/streamedActors.js';
const actor=(id:string,chunkId:string,mesh=new THREE.Group())=>({state:{id,chunkId},mesh});
test('fresh simulation owners reuse a visual and stale owners cannot release it',()=>{
 const released:unknown[]=[];const views=new StreamedActors<ReturnType<typeof actor>>(a=>released.push(a));
 const old=actor('n','chunk_2_0'),current=actor('n','chunk_2_0',old.mesh);views.remember(old);views.remember(current);
 assert.equal(views.remove(old),false);assert.equal(views.get('n'),current);assert.deepEqual(released,[]);
 assert.equal(views.remove(current),true);assert.equal(views.remove(current),false);assert.deepEqual(released,[current]);
});
test('retaining visible owners never releases active fine actors and releases other visuals once',()=>{
 const released:string[]=[];const views=new StreamedActors<ReturnType<typeof actor>>(a=>released.push(a.state.id));
 const active=actor('active','outside'),visible=actor('visible','inside'),departed=actor('departed','outside');
 for(const a of [active,visible,departed])views.remember(a);
 views.retain(new Set(['inside']),new Map([[active.state.id,active]]));assert.deepEqual(released,['departed']);
 assert.equal(views.get('active'),active);assert.equal(views.get('visible'),visible);
 views.retain(new Set(),new Map());views.retain(new Set(),new Map());assert.deepEqual(released,['departed','active','visible']);
});
test('unexpected replacement meshes fail before releasing the current identity',()=>{
 let releases=0;const views=new StreamedActors<ReturnType<typeof actor>>(()=>releases++),original=actor('n','chunk_2_0');views.remember(original);
 assert.throws(()=>views.remember(actor('n','chunk_2_0')),/identity changed/);assert.equal(views.get('n'),original);assert.equal(releases,0);
});
