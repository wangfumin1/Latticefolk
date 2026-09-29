import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CharacterSoles } from '../src/scene/characterSoles.js';
import { PLAYER_BODY_RADIUS,NPC_BODY_RADIUS,characterContactRadius,npcPlayerContactRadius,npcPlayerSeparation,PLAYER_CONVERSATION_REACH,reachedPlayerConversation } from '../src/world/characterContact.js';
import { FinePhysicsAuthority } from '../src/world/finePhysics.js';
import { sourceGltf } from './helpers/source-gltf.js';

const models={female1:'Character_Female_1',female2:'Character_Female_2',male1:'Character_Male_1',male2:'Character_Male_2'};
for(const [asset,file] of Object.entries(models)){
  test(`${asset} personal-space envelope covers the unchanged source's eye-level skin across clips`,async()=>{
    const loaded=await sourceGltf(`quaternius/cube-world/${file}.gltf`);
    const model=clone(loaded.scene);
    model.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(model,true);
    model.scale.multiplyScalar(1.82/(bounds.max.y-bounds.min.y));
    model.updateMatrixWorld(true);
    const fit=new THREE.Box3().setFromObject(model,true),center=fit.getCenter(new THREE.Vector3());
    model.position.set(-center.x,-fit.min.y,-center.z);
    const anchor=new THREE.Group();anchor.add(model);
    const soles=new CharacterSoles(model),mixer=new THREE.AnimationMixer(model);
    const vertex=new THREE.Vector3();
    let maxRadius=0;
    for(const name of ['Idle','Walk','Run','Wave','Yes','Punch']){
      mixer.stopAllAction();
      const clip=loaded.animations.find(clip=>clip.name===name)!;assert.ok(clip);
      mixer.clipAction(clip).reset().play();
      for(let frame=0;frame<90;frame++){
        mixer.update(clip.duration/90);soles.ground(0);
        model.traverse(child=>{
          const mesh=child as THREE.Mesh;if(!mesh.isMesh)return;
          if((mesh as THREE.SkinnedMesh).isSkinnedMesh)(mesh as THREE.SkinnedMesh).skeleton.update();
          for(let index=0;index<mesh.geometry.getAttribute('position').count;index++){
            mesh.getVertexPosition(index,vertex).applyMatrix4(mesh.matrixWorld);
            if(vertex.y>=1.3&&vertex.y<=1.9)maxRadius=Math.max(maxRadius,Math.hypot(vertex.x,vertex.z));
          }
        });
      }
    }
    assert.ok(maxRadius>NPC_BODY_RADIUS,'the old locomotion radius does not cover the actual head/hair');
    assert.ok(npcPlayerContactRadius(asset)>maxRadius+.04,`${asset}: ${maxRadius}`);
    assert.ok(npcPlayerSeparation(asset)<2.2,'ordinary nearby conversation remains reachable');
  });
}

test('player/NPC movement enforces the same separation from either direction without phantom tool bodies',()=>{
  const physics=new FinePhysicsAuthority();
  for(const asset of Object.keys(models)){
    const separation=npcPlayerSeparation(asset);
    const player=physics.moveKinematic({id:'player',position:{x:0,z:4},displacement:{x:0,z:-4},radius:PLAYER_BODY_RADIUS,
      dynamic:[{id:'npc',x:0,z:0,radius:characterContactRadius('npc',asset,'player')}],maxSubstep:.01});
    const npc=physics.moveKinematic({id:'npc',position:{x:0,z:4},displacement:{x:0,z:-4},radius:NPC_BODY_RADIUS,
      dynamic:[{id:'player',x:0,z:0,radius:characterContactRadius('player',undefined,'npc',asset)}],maxSubstep:.01});
    assert.ok(player.dynamicHits.includes('npc'));assert.ok(npc.dynamicHits.includes('player'));
    assert.ok(player.position.z>=separation-1e-6&&player.position.z<separation+.011);
    assert.ok(Math.abs(player.position.z-npc.position.z)<1e-6);
    assert.equal(characterContactRadius('npc',asset,undefined),NPC_BODY_RADIUS,'tool/cart query keeps body contact');
    assert.equal(characterContactRadius('npc',asset,'npc'),NPC_BODY_RADIUS,'NPC/NPC and static traversal are not enlarged');
    assert.equal(characterContactRadius('player',undefined,undefined),PLAYER_BODY_RADIUS);
    // A legacy saved overlap can move out normally; no teleport/correction of stored coordinates.
    const out=physics.moveKinematic({id:'player',position:{x:0,z:.8},displacement:{x:0,z:.1},radius:PLAYER_BODY_RADIUS,
      dynamic:[{id:'npc',x:0,z:0,radius:npcPlayerContactRadius(asset)}]});
    assert.ok(out.position.z>.8);
    const deeper=physics.moveKinematic({id:'player',position:{x:0,z:.8},displacement:{x:0,z:-.1},radius:PLAYER_BODY_RADIUS,
      dynamic:[{id:'npc',x:0,z:0,radius:npcPlayerContactRadius(asset)}]});
    assert.equal(deeper.position.z,.8);
  }
});


test('player conversations finish inside their existing interaction range without waiting inside head clearance',()=>{
  for(const asset of Object.keys(models)){
    assert.ok(npcPlayerSeparation(asset)<PLAYER_CONVERSATION_REACH);
    for(const action of ['talk','visit'])assert.equal(reachedPlayerConversation(true,action,'player',2.19),true);
  }
  assert.equal(reachedPlayerConversation(true,'talk','player',2.21),false);
  assert.equal(reachedPlayerConversation(false,'talk','player',2),false,'God View has no player target');
  for(const action of ['work','trade','gift','deliver',undefined])assert.equal(reachedPlayerConversation(true,action,'player',2),false);
  assert.equal(reachedPlayerConversation(true,'talk','ren',2),false);
  assert.equal(reachedPlayerConversation(true,'talk','player',NaN),false);
});
