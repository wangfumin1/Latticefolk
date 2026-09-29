import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CharacterSoles } from '../src/scene/characterSoles.js';
import { fitTreeModel, treeBaseBounds, treePhysics, treeVisualHeight } from '../src/scene/treePresentation.js';
import { FinePhysicsAuthority } from '../src/world/finePhysics.js';
import { sourceGltf } from './helpers/source-gltf.js';

for(const [index,asset] of ['tree1','tree2','tree3'].entries()){
  test(`${asset} uses unchanged licensed geometry with anchored trunk, not a crown collider`,async()=>{
    const loaded=await sourceGltf(`quaternius/cube-world/Tree_${index+1}.gltf`);
    const sourceGeometry:Map<THREE.BufferGeometry,Float32Array|Uint16Array>=new Map();
    loaded.scene.traverse(child=>{const mesh=child as THREE.Mesh;if(mesh.isMesh){
      sourceGeometry.set(mesh.geometry,mesh.geometry.getAttribute('position').array.slice() as Float32Array);
    }});
    for(const rotation of [0,.4,1.82,Math.PI]){
      const model=loaded.scene.clone(true);
      const height=treeVisualHeight(asset);
      const size=fitTreeModel(model,height,rotation);
      assert.ok(Math.abs(size.y-height)<1e-5);
      assert.ok(height>=7&&height<=8.4);
      const base=treeBaseBounds(model);
      assert.ok(Math.abs((base.min.x+base.max.x)/2)<1e-6,'trunk X centered independently of canopy');
      assert.ok(Math.abs((base.min.z+base.max.z)/2)<1e-6,'trunk Z centered independently of canopy');
      const group=new THREE.Group();group.position.set(14,2.75,1.5);group.add(model);group.updateMatrixWorld(true);
      const {collider,trigger}=treePhysics(model,'object:tree_apple_2','chunk_2_3');
      assert.ok(Math.abs((collider.minX+collider.maxX)/2-14)<1e-6);
      assert.ok(Math.abs((collider.minZ+collider.maxZ)/2-1.5)<1e-6);
      assert.ok(collider.maxX-collider.minX<size.x*.35,'crown must not become an air wall');
      assert.ok(collider.maxZ-collider.minZ<size.z*.45);
      const physics=new FinePhysicsAuthority();physics.registerStatic(collider);physics.registerTrigger(trigger!);
      const moved=physics.moveKinematic({id:'player',position:{x:14,z:4},displacement:{x:0,z:-4},radius:.3,maxSubstep:.08});
      assert.ok(moved.staticHits.includes('object:tree_apple_2'));
      assert.ok(moved.position.z>=collider.maxZ+.3-1e-6);
      assert.ok(physics.overlappingTriggers(moved.position,.3).some(t=>t.id==='object-trigger:tree_apple_2'));
      // Original accepted near-tree route remains feasible; no new test teleport coordinates.
      if(asset==='tree3'&&rotation===1.82)assert.ok(moved.position.z<2.65,JSON.stringify(moved));
      const contact=physics.firstSegmentContact({start:moved.position,end:{x:14,z:1.5},radius:.06});
      assert.equal(contact?.id,'object:tree_apple_2');
      physics.clearChunk('chunk_2_3');assert.equal(physics.isBlocked(14,1.5,.3),false);
    }
    for(const [geometry,positions] of sourceGeometry)assert.deepEqual(geometry.getAttribute('position').array,positions);
    assert.ok(treeVisualHeight(asset,3.5)<treeVisualHeight(asset,4.3));
  });
}

test('tree fit fails closed for unsupported assets or invalid geometry',()=>{
  assert.throws(()=>treeVisualHeight('oven'),/Uncalibrated/);
  assert.throws(()=>fitTreeModel(new THREE.Group(),7,0),/vertical extent/);
  assert.throws(()=>fitTreeModel(new THREE.Group(),NaN,0),/Invalid tree fit/);
});

for(const name of ['Character_Female_1','Character_Female_2','Character_Male_1','Character_Male_2']){
  test(`${name} rendered foot support stays grounded across full clips and crossfades`,async()=>{
    const loaded=await sourceGltf(`quaternius/cube-world/${name}.gltf`);
    const model=clone(loaded.scene);
    model.updateMatrixWorld(true);
    const original=new THREE.Box3().setFromObject(model,true);
    model.scale.multiplyScalar(1.82/(original.max.y-original.min.y));
    model.updateMatrixWorld(true);
    model.position.y-=new THREE.Box3().setFromObject(model,true).min.y;
    const group=new THREE.Group();group.position.set(27,2.75,-11);group.rotation.y=1.2;group.add(model);
    const untouched=group.position.clone();
    const soles=new CharacterSoles(model);
    assert.ok(soles.vertexCount>=24&&soles.vertexCount<300,'cache actual foot-weighted vertices');
    const mixer=new THREE.AnimationMixer(model);
    let previous:THREE.AnimationAction|undefined;
    for(const clipName of ['Idle','Walk','Run','Wave','Yes','Punch','Idle']){
      const clip=loaded.animations.find(clip=>clip.name===clipName)!;
      assert.ok(clip);
      previous?.fadeOut(.18);
      const action=mixer.clipAction(clip).reset().fadeIn(.18).play();
      for(let frame=0;frame<90;frame++){
        mixer.update(clip.duration/90);
        // No renderer is allowed to incidentally refresh the skin matrices for this test.
        assert.equal(soles.ground(2.75),true);
        assert.ok(Math.abs(soles.minimumWorldY()!-2.75)<1e-6,`${clipName} frame ${frame}`);
        // Independent full-geometry check, not a metric copied from the requested height.
        model.updateMatrixWorld(true);
        const actual=new THREE.Box3().setFromObject(model,true);
        assert.ok(Math.abs(actual.min.y-2.75)<1e-5,`${clipName} rendered minimum ${actual.min.y}`);
        assert.deepEqual(group.position,untouched,'physics/terrain anchor is never moved');
      }
      previous=action;
    }
  });
}

test('unsupported models and invalid terrain do not fabricate sole evidence or mutate transforms',()=>{
  const model=new THREE.Group();const soles=new CharacterSoles(model);
  assert.equal(soles.vertexCount,0);assert.equal(soles.minimumWorldY(),undefined);
  assert.equal(soles.ground(0),false);assert.equal(soles.ground(NaN),false);
  assert.deepEqual(model.position,new THREE.Vector3());
});
