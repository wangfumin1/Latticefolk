import test from 'node:test';
import assert from 'node:assert/strict';
import { fineParcelFixture } from '../e2e/helpers/parcel-fixture.js';
import type { CoarseChunkState } from '../src/types.js';
import * as THREE from 'three';
import {planFineChunk} from '../src/world/materialization.js';
import {ensureWildlifePopulations} from '../src/world/ecology.js';
import {streamedUnitOwnerCells} from '../src/world/streamedUnits.js';
import {FinePhysicsAuthority} from '../src/world/finePhysics.js';
import {PLAYER_BODY_RADIUS} from '../src/world/characterContact.js';
import {fitTreeModel,treePhysics,treeVisualHeight} from '../src/scene/treePresentation.js';
import {sourceGltf} from './helpers/source-gltf.js';

const chunk: CoarseChunkState = {id:'chunk_2_0',cx:2,cz:0,biome:'plains',settlementLevel:0,population:6,
  food:50,wood:50,water:50,ecology:50,danger:0,prosperity:10,
  strategy:'sustain',migrationPolicy:'retain',ecologyPolicy:'balance',lastDecisionAt:0,decisionVersion:0};

test('the original tree_11 contact regression retains its sourced geometry and blocks the old start',async()=>{
  const legacy=structuredClone(chunk);ensureWildlifePopulations(legacy);const plan=planFineChunk(legacy,24);
  assert.equal(plan.objects.filter(o=>o.state.kind==='tree').length,8,'retain the complete original tree population');
  const tree=plan.objects.find(o=>o.state.id==='chunk_2_0_tree_11')!;
  const source=await sourceGltf(`quaternius/cube-world/Tree_${tree.asset!.slice(-1)}.gltf`),model=source.scene;
  fitTreeModel(model,treeVisualHeight(tree.asset!,tree.height),tree.rotationY??0);
  const anchor=new THREE.Group();anchor.position.set(tree.state.position.x,0,tree.state.position.z);anchor.add(model);anchor.updateMatrixWorld(true);
  const trunk=treePhysics(model,`object:${tree.state.id}`,chunk.id).collider,physics=new FinePhysicsAuthority();physics.registerStatic(trunk);
  assert.ok(Math.abs(trunk.minX-51.212301461406646)<1e-8);assert.ok(Math.abs(trunk.minZ-5.374386607465256)<1e-8);
  const donor=plan.residents[0]!;assert.equal(donor.id,'chunk_2_0_npc_00');const start={x:donor.x+.7,z:donor.z+1.8};
  assert.equal(physics.isBlocked(start.x,start.z,PLAYER_BODY_RADIUS),true);
  const move=physics.moveKinematic({id:'player',position:start,displacement:{x:35.6-start.x,z:0},radius:PLAYER_BODY_RADIUS,maxSubstep:.05});
  assert.ok(move.staticHits.includes('object:chunk_2_0_tree_11'));assert.ok(move.position.x>35.6);
});

test('the old NPC00 parcel route still intersects its generated rabbit body',()=>{
  const legacy=structuredClone(chunk);ensureWildlifePopulations(legacy);const plan=planFineChunk(legacy,24),donor=plan.residents[0]!;
  const physics=new FinePhysicsAuthority(),start={x:donor.x+.7,z:donor.z+1.8};
  const dynamic=plan.wildlife.map(a=>({id:`wildlife:${a.id}`,x:a.x,z:a.z,radius:Math.max(.24,Math.min(.48,.20+a.traits.size*.10))}));
  const move=physics.moveKinematic({id:'player',position:start,displacement:{x:35.6-start.x,z:0},radius:PLAYER_BODY_RADIUS,dynamic,maxSubstep:.05});
  assert.ok(move.dynamicHits.includes('wildlife:chunk_2_0_wild_rabbit_0'));assert.ok(move.position.x>35.6);
});

test('parcel journey uses the complete 72m static layout and the actual stable founding batch',async()=>{
  const original=structuredClone(chunk),fixture=await fineParcelFixture(chunk);
  assert.deepEqual(chunk,original,'setup planning must not mutate the saved input');
  assert.deepEqual(fixture.coarseChunks.map(c=>c.id),streamedUnitOwnerCells(1,0).map(c=>c.id));
  assert.equal(fixture.rejected[0].id,'chunk_2_0_npc_00');
  assert.ok(fixture.rejected[0].dynamicHits!.includes('wildlife:chunk_2_0_wild_bison_0'));
  assert.equal(fixture.donor.id,'chunk_2_0_npc_04');assert.equal(fixture.exitX,35.6);
  assert.deepEqual(fixture.start,{x:fixture.donor.x+.7,z:fixture.donor.z+1.8});
  assert.equal(fixture.treeColliders.length,5,'retain the complete unit tree population');
  assert.ok(fixture.treeColliders.every(t=>t.id.startsWith('object:unit_1_0_tree_')));
});
