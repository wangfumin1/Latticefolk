import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CharacterSoles } from '../src/scene/characterSoles.js';
import { PLAYER_BODY_RADIUS,NPC_BODY_RADIUS,characterHeadEnvelope,playerHeadClearance,playerHeadConstraint,npcHeadConstraint,safeNpcHeading,npcPlayerSeparation,PLAYER_CONVERSATION_REACH,reachedPlayerConversation } from '../src/world/characterContact.js';
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
    let maxRadius=0,checked=0;
    const envelope=characterHeadEnvelope(asset);
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
            if(vertex.y>=1.3&&vertex.y<=1.9){
              maxRadius=Math.max(maxRadius,Math.hypot(vertex.x,vertex.z));checked++;
              assert.ok(vertex.x>envelope.minX+.04&&vertex.x<envelope.maxX-.04,`${asset}/${name} source X ${vertex.x}`);
              assert.ok(vertex.z>envelope.minZ+.04&&vertex.z<envelope.maxZ-.04,`${asset}/${name} source Z ${vertex.z}`);
            }
          }
        });
      }
    }
    assert.ok(maxRadius>NPC_BODY_RADIUS,'the old locomotion radius does not cover the actual head/hair');
    assert.ok(checked>1000,'all source clips contribute actual eye-level vertices');
    const corner=Math.hypot(Math.max(-envelope.minX,envelope.maxX),Math.max(-envelope.minZ,envelope.maxZ));
    assert.ok(corner+PLAYER_BODY_RADIUS<PLAYER_CONVERSATION_REACH,'even the widest corner permits conversation');
    assert.ok(npcPlayerSeparation(asset)<2.2,'ordinary nearby conversation remains reachable');
  });
}

test('player/NPC movement enforces reciprocal oriented clearance without phantom tool bodies',()=>{
  const physics=new FinePhysicsAuthority();
  for(const asset of Object.keys(models)){
    const separation=npcPlayerSeparation(asset);
    const player=physics.moveKinematic({id:'player',position:{x:0,z:4},displacement:{x:0,z:-4},radius:PLAYER_BODY_RADIUS,
      dynamic:[{id:'npc',x:0,z:0,radius:NPC_BODY_RADIUS}],
      constraints:[playerHeadConstraint('npc',asset,{x:0,z:0},0)],maxSubstep:.05});
    const npc=physics.moveKinematic({id:'npc',position:{x:0,z:-4},displacement:{x:0,z:4},radius:NPC_BODY_RADIUS,
      dynamic:[{id:'player',x:0,z:0,radius:PLAYER_BODY_RADIUS}],
      constraints:[npcHeadConstraint(asset,{x:0,z:0},0)],maxSubstep:.05});
    assert.ok(player.dynamicHits.includes('npc'));assert.ok(npc.dynamicHits.includes('player'));
    assert.ok(player.position.z>=separation-1e-6&&player.position.z<separation+.050001);
    assert.ok(Math.abs(player.position.z+npc.position.z)<1e-6);
    const tool=physics.firstSegmentContact({start:{x:0,z:2},end:{x:0,z:0},dynamic:[{id:'npc',x:0,z:0,radius:NPC_BODY_RADIUS}]});
    assert.ok(Math.abs(tool!.distance-(2-NPC_BODY_RADIUS))<1e-6,'tool keeps body contact, not head personal space');
    const constraint=playerHeadConstraint('npc',asset,{x:0,z:0},0);
    const out=physics.moveKinematic({id:'player',position:{x:0,z:.8},displacement:{x:0,z:.1},radius:PLAYER_BODY_RADIUS,constraints:[constraint]});
    assert.ok(out.position.z>.8);
    const deeper=physics.moveKinematic({id:'player',position:{x:0,z:.8},displacement:{x:0,z:-.1},radius:PLAYER_BODY_RADIUS,constraints:[constraint]});
    assert.equal(deeper.position.z,.8,'a saved overlap cannot move further inward');
  }
});

test('oriented clearance rotates with the unchanged source and uses rounded corners',()=>{
  const physics=new FinePhysicsAuthority();
  for(const asset of Object.keys(models))for(const yaw of [0,.4,Math.PI/2,Math.PI,4.1]){
    const npc={x:17,z:-23},c=Math.cos(yaw),s=Math.sin(yaw),e=characterHeadEnvelope(asset);
    const world=(x:number,z:number)=>({x:npc.x+c*x+s*z,z:npc.z-s*x+c*z});
    const separation=npcPlayerSeparation(asset);
    assert.ok(Math.abs(playerHeadClearance(asset,npc,yaw,world(0,separation)))<1e-8);
    assert.ok(playerHeadClearance(asset,npc,yaw,world(0,separation-.1))<0);
    const delta=PLAYER_BODY_RADIUS/Math.sqrt(2);
    assert.ok(playerHeadClearance(asset,npc,yaw,world(e.maxX+delta*.95,e.maxZ+delta*.95))<0);
    assert.ok(playerHeadClearance(asset,npc,yaw,world(e.maxX+delta*1.05,e.maxZ+delta*1.05))>0);
    const constraint=playerHeadConstraint('npc',asset,npc,yaw);
    const start=world(0,4),end=world(0,0);
    const hit=physics.moveKinematic({id:'player',position:start,displacement:{x:end.x-start.x,z:end.z-start.z},radius:PLAYER_BODY_RADIUS,constraints:[constraint],maxSubstep:.05});
    assert.ok(hit.dynamicHits.includes('npc'));assert.ok(constraint.clearance(hit.position)>=-1e-8);
  }
});

test('original home oven starting lane is not filled by the maximum head radius',()=>{
  const physics=new FinePhysicsAuthority(),npc={x:-9,z:-11},player={x:-10,z:-9.8};
  assert.ok(Math.hypot(player.x-npc.x,player.z-npc.z)<1.75,'reproduce the superseded radial obstruction');
  assert.ok(playerHeadClearance('female2',npc,0,player)>0,'empty space in front is not hair');
  const move=physics.moveKinematic({id:'player',position:player,displacement:{x:0,z:-.05},radius:PLAYER_BODY_RADIUS,
    dynamic:[{id:'npc:ren',...npc,radius:NPC_BODY_RADIUS}],constraints:[playerHeadConstraint('npc:ren','female2',npc,0)]});
  assert.ok(move.position.z<player.z,'the unchanged W approach can start');
});

test('path turns cannot rotate wide source hair into the player and invalid boundaries fail closed',()=>{
  const npc={x:0,z:0},player={x:0,z:1.2};
  assert.ok(playerHeadClearance('female2',npc,0,player)>0);
  assert.ok(playerHeadClearance('female2',npc,Math.PI/2,player)<0);
  assert.equal(safeNpcHeading('female2',npc,0,Math.PI/2,player),0);
  assert.equal(safeNpcHeading('female2',npc,0,Math.PI/2,{x:0,z:4}),Math.PI/2);
  const physics=new FinePhysicsAuthority();
  const input={id:'player',position:{x:0,z:0},displacement:{x:1,z:1},radius:PLAYER_BODY_RADIUS};
  assert.deepEqual(physics.moveKinematic({...input,constraints:[{id:'bad',clearance:()=>NaN}]}).position,input.position);
  const unblocked=physics.moveKinematic({...input,constraints:[]}).position;
  assert.ok(Math.abs(unblocked.x-1)<1e-12&&Math.abs(unblocked.z-1)<1e-12,'observer passes no player constraint');
  assert.throws(()=>characterHeadEnvelope('future-unknown-rig'),/Uncalibrated/);
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
