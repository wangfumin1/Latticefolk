import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { CoarseChunkState, InventoryItem, WorldObjectState } from '../src/types.js';
import { BAKING_OVEN_ASSET, bakingOvenVisualSpec, bakingOvenPhysics, isBakingOven } from '../src/scene/bakingOven.js';
import { FinePhysicsAuthority } from '../src/world/finePhysics.js';
import { planFineChunk } from '../src/world/materialization.js';
import { craftAtWorkstation } from '../src/world/production.js';
import { BAKING_OVEN_SOURCE_HASHES, normalizeBakingOven, prepareBakingOven, sha256 } from '../scripts/lib/baking-oven-assets.mjs';

const root=new URL('../public/assets/firefly-in-the-dusk/cast-iron-stove/',import.meta.url);
const oven:WorldObjectState={id:'oven',kind:'workstation',name:'面包炉',position:{x:-10,z:-13},tags:['work','baker','bread'],usable:true,pickupable:false};

test('baking oven selection covers legacy home and generated tags without disguising other workstations',()=>{
  assert.equal(bakingOvenVisualSpec(oven)?.asset,BAKING_OVEN_ASSET);
  for(const tags of [['baker'],['oven']]){
    const spec=bakingOvenVisualSpec({...oven,id:'chunk_2_3_bakery',tags});
    assert.equal(spec?.asset,BAKING_OVEN_ASSET);
    assert.equal(spec?.fit,'uniform');assert.equal(spec?.offsetZ,0);
  }
  for(const tags of [['maker'],['mill'],['guard'],['mine']])assert.equal(isBakingOven({...oven,id:'other',tags}),false);
  assert.equal(isBakingOven({...oven,kind:'building'}),false);
  assert.equal(bakingOvenVisualSpec(oven)?.offsetZ,.4);
});

test('oven asset preparation preserves every original geometry/material/transform and selects only the complete oven',()=>{
  for(const [name,hash] of Object.entries(BAKING_OVEN_SOURCE_HASHES))assert.equal(sha256(fs.readFileSync(new URL(name,root))),hash,name);
  const bytes=fs.readFileSync(new URL('CastIronStove.source.gltf',root));
  const source=JSON.parse(bytes.toString('utf8'));
  const runtime=JSON.parse(normalizeBakingOven(bytes).toString('utf8'));
  assert.deepEqual(runtime.scenes[0].nodes,[0]);assert.equal(runtime.nodes[0].name,'CastIronStove');
  assert.deepEqual(runtime.nodes,source.nodes);assert.deepEqual(runtime.meshes,source.meshes);
  assert.deepEqual(runtime.materials,source.materials);assert.deepEqual(runtime.buffers,source.buffers);
  assert.deepEqual(runtime.accessors,source.accessors);assert.deepEqual(runtime.bufferViews,source.bufferViews);
  runtime.scenes[0].nodes=source.scenes[0].nodes;assert.deepEqual(runtime,source);
  const binary=fs.readFileSync(new URL(source.buffers[0].uri,root));
  assert.equal(binary.length,source.buffers[0].byteLength);
  for(const view of source.bufferViews)assert.ok((view.byteOffset??0)+view.byteLength<=binary.length);
  for(const image of source.images)assert.ok(fs.statSync(new URL(image.uri,root)).size>0);
  for(const primitive of source.meshes[0].primitives){
    const material=source.materials[primitive.material];
    assert.equal(material.alphaMode??'OPAQUE','OPAQUE');
    assert.equal(material.pbrMetallicRoughness?.baseColorFactor?.[3]??1,1);
  }
});

test('oven preparation is idempotent and fails closed on altered source bytes',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'latticefolk-oven-'));
  const target=pathToFileURL(`${dir}${path.sep}`);
  try {
    for(const name of Object.keys(BAKING_OVEN_SOURCE_HASHES))fs.copyFileSync(new URL(name,root),new URL(name,target));
    assert.equal(prepareBakingOven(target),true);assert.equal(prepareBakingOven(target),false);
    const runtime=fs.readFileSync(new URL('CastIronStove.gltf',target));
    fs.appendFileSync(new URL('CastIronStove.bin',target),'corrupt');
    assert.throws(()=>prepareBakingOven(target),/hash mismatch/);
    assert.deepEqual(fs.readFileSync(new URL('CastIronStove.gltf',target)),runtime);
    assert.throws(()=>normalizeBakingOven(Buffer.from('{}')),/hash mismatch/);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

test('resolved oven footprint blocks real movement while the surrounding interaction trigger remains reachable',()=>{
  const state={...oven,chunkId:'chunk_2_3'};
  const untouched=structuredClone(state);
  const bounds={minX:-10.63,maxX:-9.37,minZ:-13.01,maxZ:-12.19};
  const {collider,trigger}=bakingOvenPhysics(state,bounds);
  assert.deepEqual(state,untouched,'visual calibration must not rewrite saved anchor/identity/tags');
  const physics=new FinePhysicsAuthority();physics.registerStatic(collider);physics.registerTrigger(trigger);
  const moved=physics.moveKinematic({id:'player',position:{x:-10,z:-10},displacement:{x:0,z:-4},radius:.3,maxSubstep:.1});
  assert.ok(moved.staticHits.includes('object:oven'));
  assert.ok(moved.position.z>=bounds.maxZ+.3-1e-6);
  assert.ok(physics.overlappingTriggers(moved.position,.3).some(t=>t.id==='object-trigger:oven'));
  assert.equal(physics.overlappingTriggers({x:-10,z:-9},.3).length,0);
  const side=physics.moveKinematic({id:'player',position:{x:-8,z:-12.5},displacement:{x:-4,z:0},radius:.3,maxSubstep:.1});
  assert.ok(side.staticHits.includes('object:oven'));
  assert.ok(side.position.x>=bounds.maxX+.3-1e-6);
  physics.clearChunk('chunk_2_3');
  assert.equal(physics.isBlocked(-10,-12.5,.3),false);assert.equal(physics.overlappingTriggers(moved.position,.3).length,0);
  assert.throws(()=>bakingOvenPhysics(state,{...bounds,maxX:NaN}),/Invalid resolved/);
});

const chunk:CoarseChunkState={id:'chunk_2_-1',cx:2,cz:-1,biome:'plains',settlementLevel:2,population:23,
  food:68,wood:57,water:71,ecology:73,danger:18,prosperity:66,strategy:'trade_route',migrationPolicy:'attract',ecologyPolicy:'balance',lastDecisionAt:0,decisionVersion:3};
for(const biome of ['plains','wetlands'] as const){
  test(`${biome} settlement bakery retains deterministic identity, NPC workAt, recipes and save roundtrip`,()=>{
    const scenario={...chunk,biome,strategy:biome==='wetlands'?'sustain' as const:chunk.strategy};
    const plan=planFineChunk(scenario,24);
    assert.equal(plan.archetype,biome==='wetlands'?'wetland_hamlet':'market_hamlet');
    const bakery=plan.objects.find(o=>o.state.id===`${chunk.id}_bakery`)!;
    assert.ok(bakery);assert.equal(bakingOvenVisualSpec(bakery.state)?.asset,BAKING_OVEN_ASSET);
    const baker=plan.residents.find(n=>n.role==='baker')!;
    assert.ok(baker);assert.equal(baker.workAt,bakery.state.id);
    const inventory:InventoryItem[]=[{kind:'flour',count:2},{kind:'water',count:1}];
    const produced=craftAtWorkstation(bakery.state.tags,inventory,baker.role);
    assert.equal(produced.recipe?.id,'bake_bread');assert.equal(produced.ok,true);
    assert.deepEqual(inventory,[{kind:'flour',count:1},{kind:'water',count:0},{kind:'bread',count:2}]);
    const stored=JSON.parse(JSON.stringify({object:bakery.state,npc:{...baker,inventory}}));
    assert.equal(stored.object.id,bakery.state.id);assert.equal(stored.npc.workAt,bakery.state.id);
    const before=structuredClone(stored.npc.inventory);
    const second=craftAtWorkstation(stored.object.tags,stored.npc.inventory,stored.npc.role);
    assert.equal(second.ok,false);assert.deepEqual(second.missing,['water']);assert.deepEqual(stored.npc.inventory,before);
    assert.deepEqual(planFineChunk(scenario,24),plan);
  });
}

test('home oven retains the same ingredient-conserving recipe after serialization',()=>{
  const saved=JSON.parse(JSON.stringify(oven)) as WorldObjectState;
  const inv:InventoryItem[]=[{kind:'flour',count:1},{kind:'water',count:1},{kind:'bread',count:3}];
  assert.equal(craftAtWorkstation(saved.tags,inv,'baker').ok,true);
  assert.deepEqual(inv,[{kind:'flour',count:0},{kind:'water',count:0},{kind:'bread',count:5}]);
  const before=structuredClone(inv);
  assert.equal(craftAtWorkstation(saved.tags,inv,'baker').ok,false);assert.deepEqual(inv,before);
  assert.deepEqual(saved,oven);
});
