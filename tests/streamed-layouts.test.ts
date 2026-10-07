import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {CoarseWorldRuntime} from '../src/world/coarseWorld.js';
import {planFineChunk} from '../src/world/materialization.js';
import {createStreamedLayout,layoutIdentity,readStreamedLayout,StreamedLayoutRegistry,StreamedLayoutValidationError} from '../src/world/streamedLayouts.js';
import {streamedUnitOwnerCells} from '../src/world/streamedUnits.js';
import {WorldPersistence,WorldPersistenceConflictError} from '../server/worldPersistence.js';
import {WorldSnapshotValidationError} from '../server/worldSnapshotValidation.js';
import type {PersistedFineChunk,WorldPersistenceSnapshot,WorldObjectState} from '../src/types.js';

function owners(ux=1,uz=0){const world=new CoarseWorldRuntime(new THREE.Scene());return streamedUnitOwnerCells(ux,uz).map(c=>world.ensureChunk(c.cx,c.cz)!);}
const emptySnapshot=():WorldPersistenceSnapshot=>({version:1,meta:{day:1,minuteOfDay:495,weather:'clear',playerPosition:{x:0,z:7},playerInventory:{apple:0,bread:1,wood:0,coin:10,flower:0,grain:0,flour:0,water:0,stone:0,plank:0,tool:0}},coarseChunks:[],fineChunks:[],homeObjects:[],homeNpcs:[]});

test('a single 72m layout spans the unit with human-scale buildings and shared roads',()=>{
  const cells=owners();for(const c of cells){c.settlementLevel=3;c.population=20;}
  const {layout}=createStreamedLayout(1,0,cells,[]);
  assert.equal(readStreamedLayout(layout),layout);assert.deepEqual(layout.unit.bounds,{minX:36,maxX:108,minZ:-36,maxZ:36});
  assert.equal(layout.buildings.length,4);assert.ok(layout.buildings.every(b=>b.w<10&&b.d<10));
  assert.ok(Math.max(...layout.buildings.map(b=>b.x))-Math.min(...layout.buildings.map(b=>b.x))>35);
  assert.equal(layout.roads.length,6);assert.equal(Math.min(...layout.roads.map(r=>r.x-r.w/2)),36);assert.equal(Math.max(...layout.roads.map(r=>r.x+r.w/2)),108);
  assert.equal(Math.min(...layout.roads.map(r=>r.z-r.d/2)),-36);assert.equal(Math.max(...layout.roads.map(r=>r.z+r.d/2)),36);
  assert.ok(layout.objects.every(o=>!Object.hasOwn(o,'storage')&&!Object.hasOwn(o,'resourceAmount')&&!Object.hasOwn(o,'respawnAt')));
});

test('established layouts are not replanned by changing coarse policy or population',()=>{
  const cells=owners(),registry=new StreamedLayoutRegistry('latticefolk-default');
  const original=registry.establish(1,0,cells,[]).layout,before=layoutIdentity(original);
  for(const c of cells){c.strategy='fortify';c.settlementLevel=0;c.population=0;c.danger=100;}
  assert.equal(registry.establish(1,0,cells,[]).layout,original);assert.equal(layoutIdentity(registry.snapshot()[0]),before);
  const restored=new StreamedLayoutRegistry('latticefolk-default');restored.restore(JSON.parse(JSON.stringify(registry.snapshot())));
  assert.equal(layoutIdentity(restored.establish(1,0,cells,[]).layout),before);
});

test('legacy objects and frontage survive a coarse branch that no longer generates any of them',()=>{
  const cells=owners(1,-1),cell=cells[4];Object.assign(cell,{settlementLevel:2,population:23,strategy:'trade_route',prosperity:80,danger:10});
  const old=planFineChunk(cell),building=old.buildings[0],frontage={x:building.x+Math.sin(building.rotationY)*(building.d/2+1.15),z:building.z+Math.cos(building.rotationY)*(building.d/2+1.15)};
  const saved:PersistedFineChunk={chunkId:cell.id,npcStates:[],wildlifeStates:[],objectStates:[
    {id:building.id,chunkId:cell.id,kind:'building',name:building.name,position:frontage,tags:['building','market','storage'],usable:true,pickupable:false,storage:[{kind:'wood',count:7}]},
    ...old.objects.map(o=>structuredClone(o.state))
  ]};
  Object.assign(cell,{settlementLevel:0,population:0,strategy:'fortify',danger:82});assert.equal(planFineChunk(cell).buildings.length,0);
  const generated=createStreamedLayout(1,-1,cells,[saved]);
  assert.deepEqual(generated.layout.buildings.find(b=>b.id===building.id)!.frontage,frontage);
  assert.equal(generated.layout.buildings.find(b=>b.id===building.id)!.asset,building.asset);
  assert.equal(generated.layout.buildings.find(b=>b.id===building.id)!.provenance,'legacy-inferred');
  for(const state of saved.objectStates)assert.deepEqual(generated.objectStates.find(s=>s.id===state.id),state);
  assert.equal(generated.objectStates.find(s=>s.id===building.id)!.storage![0].count,7);
});

test('SQLite layouts and static-only owners preserve CAS, omission and immutable geometry',()=>{
  const store=new WorldPersistence(':memory:');
  try{
    const cells=owners(),generated=createStreamedLayout(1,0,cells,[]),snapshot=emptySnapshot();
    snapshot.meta.streamedLayoutVersion=1;snapshot.streamedLayouts=[generated.layout];snapshot.coarseChunks=cells;
    for(const b of generated.layout.buildings)generated.objectStates.push({id:b.id,chunkId:b.ownerCellId,kind:'building',name:b.name,position:b.frontage,tags:['building'],usable:true,pickupable:false});
    for(const road of generated.layout.roads)generated.objectStates.push({id:road.id,chunkId:road.ownerCellId,kind:'road',name:road.name,position:{x:road.x,z:road.z},tags:road.tags,usable:true,pickupable:false});
    snapshot.fineChunks=cells.map(c=>({chunkId:c.id,dynamicActivated:false,npcStates:[],objectStates:generated.objectStates.filter(o=>o.chunkId===c.id)}));
    store.save(snapshot,0);const before=store.load()!,revision=store.revision();
    assert.equal(layoutIdentity(before.streamedLayouts),layoutIdentity(snapshot.streamedLayouts));assert.equal(before.fineChunks[0].dynamicActivated,false);
    const modified=structuredClone(snapshot);modified.streamedLayouts![0].roads[0].w-=1;
    assert.throws(()=>store.save(modified,revision-1),WorldPersistenceConflictError);assert.throws(()=>store.save(modified,revision),WorldSnapshotValidationError);
    assert.deepEqual(store.load(),before);assert.equal(store.revision(),revision);
    for(const mutate of [(s:WorldPersistenceSnapshot)=>{s.streamedLayouts![0].seed='different-world';},
      (s:WorldPersistenceSnapshot)=>{Object.assign(s.streamedLayouts![0].buildings[0],{x:0,z:0,frontage:{x:0,z:0}});},
      (s:WorldPersistenceSnapshot)=>{s.streamedLayouts![0].buildings[0].w=72;},
      (s:WorldPersistenceSnapshot)=>{s.fineChunks.flatMap(c=>c.objectStates).find(o=>o.id===s.streamedLayouts![0].buildings[0].id)!.position.x+=2;}]){
      const invalid=structuredClone(snapshot);mutate(invalid);assert.throws(()=>store.save(invalid,revision),WorldSnapshotValidationError);assert.deepEqual(store.load(),before);assert.equal(store.revision(),revision);
    }
    const compact=emptySnapshot();compact.meta.streamedLayoutVersion=1;store.save(compact,revision);
    assert.equal(layoutIdentity(store.load()!.streamedLayouts),layoutIdentity(snapshot.streamedLayouts));assert.deepEqual(store.load()!.fineChunks,before.fineChunks);
    const legacy=emptySnapshot();assert.throws(()=>store.save(legacy,revision),WorldPersistenceConflictError);assert.throws(()=>store.save(legacy,revision+1),WorldSnapshotValidationError);
  }finally{store.close();}
});

test('unsupported versions, invalid owners and duplicate layout identities reject atomically',()=>{
  const valid=createStreamedLayout(1,0,owners(),[]).layout,registry=new StreamedLayoutRegistry('latticefolk-default');registry.restore([valid]);
  for(const mutate of [(x:any)=>{x.version=2;},(x:any)=>{x.unit.bounds.maxX=109;},(x:any)=>{x.objects[0].ownerCellId='chunk_99_99';},(x:any)=>{x.roads[0].x=NaN;}]){
    const invalid=structuredClone(valid);mutate(invalid);assert.throws(()=>registry.restore([invalid]),StreamedLayoutValidationError);assert.equal(layoutIdentity(registry.snapshot()[0]),layoutIdentity(valid));
  }
  assert.throws(()=>registry.restore([valid,valid]),StreamedLayoutValidationError);
});


test('legacy lots keep every saved anchor while connecting all four canonical road ports',()=>{
  for(const [ux,uz] of [[1,0],[-1,0],[0,1],[0,-1],[-1,-1],[1,1]]){
    const cells=owners(ux,uz),saved:PersistedFineChunk[]=cells.map(cell=>{
      const plan=planFineChunk(cell),objectStates:WorldObjectState[]=[...plan.objects.map(p=>p.state),
        ...plan.buildings.map(b=>({id:b.id,chunkId:cell.id,kind:'building' as const,name:b.name,
          position:{x:b.x+Math.sin(b.rotationY)*(b.d/2+1.15),z:b.z+Math.cos(b.rotationY)*(b.d/2+1.15)},tags:['building',plan.archetype],usable:true,pickupable:false})),
        ...plan.roads.map(r=>({id:r.id,chunkId:cell.id,kind:'road' as const,name:r.name,position:{x:r.x,z:r.z},tags:r.tags,usable:true,pickupable:false}))];
      return{chunkId:cell.id,npcStates:[],objectStates,wildlifeStates:[]};
    });
    const before=structuredClone(saved),{layout,objectStates}=createStreamedLayout(ux,uz,cells,saved);assert.deepEqual(saved,before);
    for(const row of saved)for(const state of row.objectStates)assert.deepEqual(objectStates.find(s=>s.id===state.id),state);
    const roads=layout.roads.filter(r=>r.tags.includes('connection')),bounds=layout.unit.bounds;
    assert.ok(roads.some(r=>Math.abs(r.x-r.w/2-bounds.minX)<1e-9&&r.z===uz*72&&r.d===4));
    assert.ok(roads.some(r=>Math.abs(r.x+r.w/2-bounds.maxX)<1e-9&&r.z===uz*72&&r.d===4));
    assert.ok(roads.some(r=>Math.abs(r.z-r.d/2-bounds.minZ)<1e-9&&r.x===ux*72&&r.w===4));
    assert.ok(roads.some(r=>Math.abs(r.z+r.d/2-bounds.maxZ)<1e-9&&r.x===ux*72&&r.w===4));
    for(const road of roads)assert.ok(layout.buildings.every(b=>Math.abs(road.x-b.x)>=(road.w+b.w)/2-1e-9||Math.abs(road.z-b.z)>=(road.d+b.d)/2-1e-9));
    const connected=new Set([roads[0]!.id]);let changed=true;
    while(changed){changed=false;for(const r of roads)if(!connected.has(r.id)&&roads.some(a=>connected.has(a.id)&&Math.abs(r.x-a.x)<=(r.w+a.w)/2+1e-9&&Math.abs(r.z-a.z)<=(r.d+a.d)/2+1e-9)){connected.add(r.id);changed=true;}}
    assert.equal(connected.size,roads.length);assert.equal(readStreamedLayout(layout),layout);
  }
});


test('legacy same-name buildings use the saved archetype index before name inference',()=>{
  const cells=owners(),cell=cells[4];Object.assign(cell,{settlementLevel:3,population:23,strategy:'fortify',danger:82});
  const plan=planFineChunk(cell),last=plan.buildings[3]!;assert.equal(last.asset,'houseB');
  const frontage={x:last.x+Math.sin(last.rotationY)*(last.d/2+1.15),z:last.z+Math.cos(last.rotationY)*(last.d/2+1.15)};
  const saved:PersistedFineChunk={chunkId:cell.id,npcStates:[],wildlifeStates:[],objectStates:[...plan.objects.map(o=>o.state),{
    id:last.id,chunkId:cell.id,kind:'building',name:last.name,position:frontage,tags:['building'],usable:true,pickupable:false,storage:[{kind:'wood',count:7}]}]};
  const {layout}=createStreamedLayout(1,0,cells,[saved]),restored=layout.buildings.find(b=>b.id===last.id)!;
  assert.deepEqual({asset:restored.asset,height:restored.height,w:restored.w,d:restored.d,x:restored.x,z:restored.z,rotationY:restored.rotationY,frontage:restored.frontage},
    {asset:last.asset,height:last.height,w:last.w,d:last.d,x:last.x,z:last.z,rotationY:last.rotationY,frontage});
});
