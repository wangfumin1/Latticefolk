import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import type { ItemKind, NpcState, WorldObjectState } from '../src/types.js';
import { FinePhysicsAuthority } from '../src/world/finePhysics.js';
import { PortableObjectRuntime, type PortableNpc, type PortableObjectHost } from '../src/world/portableObjectRuntime.js';
import { advancePickupRespawn, droppedItemCount, portableItemMetrics } from '../src/world/portableObjects.js';
import { droppedParcelLabel } from '../src/scene/droppedParcel.js';

const inventory = (): Record<ItemKind, number> => ({ apple:0,bread:0,wood:0,coin:0,flower:0,grain:0,flour:0,water:0,stone:0,plank:0,tool:0 });
const parcel = (overrides: Partial<WorldObjectState> = {}): WorldObjectState => ({
  id:'legacy_drop',kind:'dropped_item',name:'Old bread',position:{x:0,z:0},
  tags:['dropped','bread'],usable:false,pickupable:true,item:'bread',...overrides
});
function npc(id: string, chunkId?: string): PortableNpc {
  const position = { x:chunkId ? 48 : 0,z:0 };
  const state: NpcState = { id,chunkId,name:id,role:'baker',position,home:{...position},workAt:'oven',
    mood:'neutral',hunger:20,energy:80,social:50,money:10,inventory:[{kind:'bread',count:2}],
    relationships:{},memories:[],currentAction:'idle',goal:'Work',lastDecisionAt:0 };
  return { state };
}
function fixture() {
  const scene = new THREE.Scene();
  const physics = new FinePhysicsAuthority();
  const chunks = new Map<string, { objectIds:string[];groups:THREE.Object3D[] }>();
  const npcs = new Map<string, PortableNpc>();
  let schedules=0;
  const host: PortableObjectHost = {
    objects:new Map(),npcs,materializedChunks:chunks,
    fineChunkCache:new Map<string,{objectStates:WorldObjectState[]}>(),visualTargets:[],physics,
    coarseWorld:{chunkAtWorld(x) { return x>=36 ? {id:'chunk_2_0'} : undefined; }},
    playerInventory:inventory(),playerPosition:{x:0,z:0},cameraMode:'firstPerson',movableDirty:false,
    addObject(state) {
      const mesh = new THREE.Group();mesh.position.set(state.position.x,0,state.position.z);
      scene.add(mesh);this.objects.set(state.id,{state,mesh});this.visualTargets.push({group:mesh});
      this.registerWorldObjectPhysics(state);
      if(state.chunkId)chunks.get(state.chunkId)!.groups.push(mesh);
      return mesh;
    },
    registerWorldObjectPhysics(state) {
      physics.registerTrigger({id:`object-trigger:${state.id}`,chunkId:state.chunkId,tag:'interaction',
        minX:state.position.x-1.15,maxX:state.position.x+1.15,minZ:state.position.z-1.15,maxZ:state.position.z+1.15});
    },
    groundHeightAt() { return 1.25; },
    playerOverlapsObjectTrigger(id) {
      return physics.overlappingTriggers(this.playerPosition,.3).some(t=>t.id===`object-trigger:${id}`);
    },
    scheduleMovablePersistence() { schedules++; },
    itemName(kind) { return kind; },
    parcelLabel(kind,count) { return droppedParcelLabel('en',kind,count); },
    event() {}
  };
  let sequence=0;
  const runtime = new PortableObjectRuntime(host,()=>`drop_${++sequence}`);
  return {host,runtime,scene,physics,chunks,npcs,schedules:()=>schedules};
}

test('live fine drop is debited once, registered in every owner index and removed everywhere on pickup',()=>{
  const f=fixture();f.chunks.set('chunk_2_0',{objectIds:[],groups:[]});
  const agent=npc('baker','chunk_2_0');f.npcs.set('baker',agent);
  const dropped=f.runtime.drop(agent)!;assert.ok(dropped);
  assert.equal(agent.state.inventory[0].count,1);
  assert.equal(dropped.chunkId,'chunk_2_0');assert.equal(droppedItemCount(dropped),1);
  assert.deepEqual(dropped.position,{x:48.7,z:.4});
  const view=f.host.objects.get(dropped.id)!;
  assert.equal(view.mesh.position.y,1.25);
  assert.deepEqual(f.chunks.get('chunk_2_0')!.objectIds,[dropped.id]);
  assert.deepEqual(f.chunks.get('chunk_2_0')!.groups,[view.mesh]);
  assert.equal(f.runtime.checkpoint.pending,true);assert.equal(f.schedules(),1);
  f.host.playerPosition={...dropped.position};
  f.host.hoverEntity={type:'object',id:dropped.id};f.host.selectedEntity={type:'object',id:dropped.id};
  assert.deepEqual(f.runtime.pickupForPlayer(view),{kind:'bread',count:1});
  assert.equal(f.host.playerInventory.bread,1);
  assert.equal(f.host.objects.size,0);assert.equal(f.scene.children.length,0);
  assert.equal(f.host.visualTargets.length,0);assert.equal(f.physics.overlappingTriggers(dropped.position).length,0);
  assert.deepEqual(f.chunks.get('chunk_2_0')!.objectIds,[]);
  assert.deepEqual(f.chunks.get('chunk_2_0')!.groups,[]);
  assert.equal(f.host.hoverEntity,undefined);assert.equal(f.host.selectedEntity,undefined);
  assert.equal(f.runtime.pickupForPlayer(view),undefined,'stale menu reference cannot pick up twice');
  assert.equal(f.runtime.pickupForNpc(agent,view),undefined,'competing NPC cannot collect removed parcel');
  assert.equal(advancePickupRespawn(dropped,Date.now()+60_000),false);
  assert.equal(agent.state.inventory[0].count+f.host.playerInventory.bread,2);
});

test('home drop survives reconstruction while consumed legacy timer rows never reappear',()=>{
  const first=fixture();const agent=npc('home');first.npcs.set('home',agent);
  const dropped=first.runtime.drop(agent)!;
  const persisted=structuredClone(dropped);const reloaded=fixture();
  assert.equal(reloaded.runtime.restoreHome(persisted),true);
  const restored=reloaded.host.objects.get(dropped.id)!;
  assert.equal(restored.state.id,dropped.id);assert.equal(restored.state.resourceAmount,1);
  assert.equal(restored.state.chunkId,undefined);
  reloaded.host.playerPosition={...restored.state.position};
  assert.equal(reloaded.runtime.pickupForPlayer(restored)?.count,1);
  assert.equal(reloaded.runtime.restoreHome(parcel({id:'spent',pickupable:false,respawnAt:1})),true);
  assert.equal(reloaded.host.objects.size,0);
  assert.equal(reloaded.runtime.restoreHome({...parcel(),kind:'crate'}),false);
  assert.equal(reloaded.runtime.checkpoint.pending,false,'compact home save includes both transfer sides');
});

test('God View, out-of-range and hidden-target pickups leave inventories and source unchanged',()=>{
  const f=fixture();f.runtime.restoreHome(parcel());const view=f.host.objects.get('legacy_drop')!;
  const before=structuredClone(view.state);
  f.host.cameraMode='god';assert.equal(f.runtime.pickupForPlayer(view),undefined);
  f.host.cameraMode='firstPerson';f.host.playerPosition={x:20,z:20};assert.equal(f.runtime.pickupForPlayer(view),undefined);
  f.host.playerPosition={x:0,z:0};view.mesh.visible=false;assert.equal(f.runtime.pickupForPlayer(view),undefined);
  assert.deepEqual(view.state,before);assert.deepEqual(f.host.playerInventory,inventory());assert.equal(f.schedules(),0);
});

test('removed actors, unloaded owners and duplicate IDs cannot debit stock or replace live entities',()=>{
  const f=fixture();const agent=npc('far','chunk_2_0');f.npcs.set('far',agent);
  assert.equal(f.runtime.drop(agent),undefined);assert.equal(agent.state.inventory[0].count,2);
  f.chunks.set('chunk_2_0',{objectIds:[],groups:[]});agent.removed=true;
  assert.equal(f.runtime.drop(agent),undefined);agent.removed=false;
  const fixed=new PortableObjectRuntime(f.host,()=> 'duplicate');
  const state=fixed.drop(agent)!;assert.equal(agent.state.inventory[0].count,1);
  assert.equal(fixed.drop(agent),undefined);assert.equal(agent.state.inventory[0].count,1);
  assert.equal(f.host.objects.get('duplicate')!.state,state);
  f.npcs.delete('far');assert.equal(fixed.drop(agent),undefined);
});

test('far legacy home parcels move only into an existing visited snapshot, preserving other objects',()=>{
  const f=fixture();const other={...parcel({id:'tree'}),kind:'tree' as const,pickupable:false};
  const cache={objectStates:[other]};
  (f.host.fineChunkCache as Map<string,{objectStates:WorldObjectState[]}>).set('chunk_2_0',cache);
  const saved=parcel({position:{x:48,z:0}}),original=structuredClone(saved);
  f.runtime.restoreHome(saved);
  assert.deepEqual(saved,original);assert.equal(f.host.objects.size,0);
  assert.equal(cache.objectStates.length,2);assert.equal(cache.objectStates[0],other);
  assert.equal(cache.objectStates[1].chunkId,'chunk_2_0');assert.equal(f.runtime.checkpoint.pending,true);
  f.chunks.set('chunk_2_0',{objectIds:[],groups:[]});
  f.runtime.restoreFine(cache.objectStates,'chunk_2_0');
  assert.equal(f.host.objects.size,1);assert.equal(f.host.objects.get(saved.id)!.state.chunkId,'chunk_2_0');
  assert.deepEqual(f.chunks.get('chunk_2_0')!.objectIds,[saved.id]);
});

test('unvisited legacy parcels are retained until real materialization, without fabricating fine rows',()=>{
  const f=fixture();f.runtime.restoreHome(parcel({position:{x:48,z:0}}));
  const view=f.host.objects.get('legacy_drop')!;
  assert.equal(view.state.chunkId,undefined);assert.equal(f.host.fineChunkCache.size,0);
  assert.equal(f.chunks.size,0);assert.equal(f.runtime.checkpoint.pending,false);
  f.chunks.set('chunk_2_0',{objectIds:[],groups:[]});
  f.runtime.restoreFine([],'chunk_2_0');
  assert.equal(f.host.objects.get('legacy_drop'),view);assert.equal(view.state.chunkId,'chunk_2_0');
  assert.deepEqual(f.chunks.get('chunk_2_0')!.objectIds,['legacy_drop']);
  assert.equal(f.runtime.checkpoint.pending,true);
});

test('parcel custody changes do not change coarse inventory-equivalent metrics',()=>{
  const f=fixture();f.chunks.set('chunk_2_0',{objectIds:[],groups:[]});
  const agent=npc('baker','chunk_2_0');f.npcs.set('baker',agent);
  const total=()=>{
    const states=[...agent.state.inventory.map(s=>portableItemMetrics(s.kind,s.count)),
      ...[...f.host.objects.values()].map(o=>portableItemMetrics(o.state.item!,droppedItemCount(o.state)))];
    return states.reduce((a,s)=>({food:a.food+s.food,wood:a.wood+s.wood,prosperity:a.prosperity+s.prosperity}),{food:0,wood:0,prosperity:0});
  };
  const before=total();const drop=f.runtime.drop(agent)!;assert.deepEqual(total(),before);
  assert.ok(f.runtime.pickupForNpc(agent,f.host.objects.get(drop.id)!));assert.deepEqual(total(),before);
});

test('parcel labels distinguish a container from its contents in every supported language',()=>{
  assert.equal(droppedParcelLabel('en','Bread',2),'Parcel · Bread ×2');
  assert.equal(droppedParcelLabel('zh-CN','面包',2),'包裹 · 面包 ×2');
  assert.equal(droppedParcelLabel('ja','パン',2),'小包 · パン ×2');
  assert.equal(droppedParcelLabel('es','Pan',2),'Paquete · Pan ×2');
});

test('a failed visual or physics registration rolls back every parcel index before donor debit',()=>{
  for(const stage of ['add','ground'] as const){
    const f=fixture();f.chunks.set('chunk_2_0',{objectIds:[],groups:[]});
    const agent=npc('baker','chunk_2_0');f.npcs.set('baker',agent);
    const add=f.host.addObject;
    if(stage==='add')f.host.addObject=function(state){add.call(this,state);throw new Error('registration failed');};
    else f.host.groundHeightAt=()=>{throw new Error('ground failed');};
    assert.throws(()=>f.runtime.drop(agent),/failed/);
    assert.equal(agent.state.inventory[0].count,2);
    assert.equal(f.host.objects.size,0);assert.equal(f.scene.children.length,0);
    assert.equal(f.host.visualTargets.length,0);
    assert.deepEqual(f.chunks.get('chunk_2_0')!.objectIds,[]);
    assert.deepEqual(f.chunks.get('chunk_2_0')!.groups,[]);
    assert.equal(f.physics.overlappingTriggers({x:48.7,z:.4}).length,0);
    assert.equal(f.schedules(),0);
  }
});
