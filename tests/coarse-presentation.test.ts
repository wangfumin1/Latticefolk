import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { coarseMarkerVisualSpec, type CoarseMarkerAsset } from '../src/scene/coarsePresentation.js';
import { CoarseWorldRuntime } from '../src/world/coarseWorld.js';
import type { ChunkBiome, CoarseChunkState } from '../src/types.js';
import { sourceGltf } from './helpers/source-gltf.js';

const assetPaths:Record<CoarseMarkerAsset,string>={
  townCenter:'quaternius/ultimate-fantasy-rts/TownCenter_FirstAge_Level3.gltf',
  tree2:'quaternius/cube-world/Tree_2.gltf',
  tree3:'quaternius/cube-world/Tree_3.gltf',
  bush:'quaternius/cube-world/Bush.gltf',
  rock:'quaternius/cube-world/Rock2.gltf'
};

const chunk=(biome:ChunkBiome,settlementLevel=0,cx=2,cz=0):CoarseChunkState=>({
  id:`chunk_${cx}_${cz}`,cx,cz,biome,settlementLevel,population:settlementLevel?12:0,
  food:50,wood:50,water:50,ecology:50,danger:10,prosperity:20,
  strategy:'sustain',migrationPolicy:'retain',ecologyPolicy:'balance',lastDecisionAt:0,decisionVersion:0
});

test('coarse marker specs select only existing sourced assets without changing chunk state',()=>{
  const samples:[CoarseChunkState,CoarseMarkerAsset][]=[
    [chunk('plains',2),'townCenter'],
    [chunk('forest'),'tree2'],
    [chunk('plains'),'tree3'],
    [chunk('wetlands'),'bush'],
    [chunk('hills'),'rock'],
    [chunk('dryland'),'rock']
  ];
  for(const [state,asset] of samples){
    const before=structuredClone(state);
    const spec=coarseMarkerVisualSpec(state);
    assert.equal(spec.asset,asset);
    assert.ok(spec.height>0&&Number.isFinite(spec.rotationY));
    assert.deepEqual(state,before);
  }
});

test('coarse marker assets are authored GLTF meshes rather than generated Box/Cone fallbacks',async()=>{
  for(const [asset,path] of Object.entries(assetPaths) as [CoarseMarkerAsset,string][]){
    const loaded=await sourceGltf(path);
    let meshes=0,generatedPrimitives=0;
    loaded.scene.traverse(child=>{
      const mesh=child as THREE.Mesh;
      if(!mesh.isMesh)return;
      meshes++;
      if(['BoxGeometry','ConeGeometry','CylinderGeometry','PlaneGeometry','SphereGeometry'].includes(mesh.geometry.type))generatedPrimitives++;
    });
    assert.ok(meshes>0,`${asset} must contain authored mesh data`);
    assert.equal(generatedPrimitives,0,`${asset} must not resolve to a runtime primitive geometry`);
  }
});

test('coarse runtime keeps markers empty without sourced visuals and hides materialized markers',async()=>{
  const templates=new Map<CoarseMarkerAsset,THREE.Object3D>();
  for(const [asset,path] of Object.entries(assetPaths) as [CoarseMarkerAsset,string][]){
    templates.set(asset,(await sourceGltf(path)).scene);
  }
  const runtime=new CoarseWorldRuntime(new THREE.Scene(),'coarse-presentation-test');
  const empty=runtime.presentationStatus();
  assert.ok(empty.length>0);
  assert.ok(empty.every(marker=>!marker.resolved&&marker.meshes===0&&marker.primitiveMeshes===0));

  let detached=0;
  runtime.setPresentationBridge({
    attach(group,spec){
      const template=templates.get(spec.asset as CoarseMarkerAsset);
      assert.ok(template,`missing template ${spec.asset}`);
      group.add(template!.clone(true));
    },
    detach(group){detached++;group.clear();}
  });
  const sourced=runtime.presentationStatus();
  assert.equal(sourced.length,empty.length);
  assert.ok(sourced.every(marker=>marker.resolved&&marker.meshes>0&&marker.primitiveMeshes===0));
  assert.ok(sourced.some(marker=>marker.kind==='settlement'));
  assert.ok(sourced.some(marker=>marker.kind==='wilderness'));

  const first=sourced[0]!;
  runtime.setMaterialized(first.chunkId,true);
  assert.equal(runtime.presentationStatus().find(marker=>marker.chunkId===first.chunkId)?.visible,false);
  runtime.setMaterialized(first.chunkId,false);
  assert.equal(runtime.presentationStatus().find(marker=>marker.chunkId===first.chunkId)?.visible,true);
  assert.ok(detached>=0);
});
