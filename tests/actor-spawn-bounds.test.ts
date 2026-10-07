import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import './helpers/source-gltf.js';
import {normalizeBakingOven} from '../scripts/lib/baking-oven-assets.mjs';
import {actorSpawnBounds,type SpawnVisualSpec} from '../src/scene/actorSpawnBounds.js';
import {SPAWN_SOURCE_GEOMETRY} from '../src/scene/spawnSourceGeometry.js';
import {fitTreeModel,treePhysics,treeVisualHeight} from '../src/scene/treePresentation.js';
import {FinePhysicsAuthority} from '../src/world/finePhysics.js';
import {actorPointClear,findActorSpawn,pendingEntryPosition,wildlifeBodyRadius,type ActorContact} from '../src/world/actorPlacement.js';
import {beginRandomEvent} from '../src/world/worldRandom.js';
import {NPC_BODY_RADIUS} from '../src/world/characterContact.js';

const source=fs.readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
const game=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='TownGame') as ts.ClassDeclaration;
const method=game.members.find(n=>n.name?.getText(ast)==='normalizeModel')!.getText(ast);
const Runtime=new Function('THREE',ts.transpileModule(`return class {${method}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)(THREE);
const normalizer=new Runtime(),hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const templates=new Map<string,THREE.Group>();
async function template(asset:string){
  if(templates.has(asset))return templates.get(asset)!;
  const profile=SPAWN_SOURCE_GEOMETRY[asset],file=new URL(`../${profile.source}`,import.meta.url),raw=fs.readFileSync(file);
  assert.equal(hash(raw),profile.sha256);
  const document=JSON.parse((asset==='bakingOvenAsset'?normalizeBakingOven(raw):raw).toString());
  for(const [index,buffer] of document.buffers.entries()){
    const bytes=buffer.uri.startsWith('data:')?Buffer.from(buffer.uri.slice(buffer.uri.indexOf(',')+1),'base64'):
      fs.readFileSync(new URL(buffer.uri,file));
    assert.equal(hash(bytes),profile.bufferSha256[index]);
    buffer.uri=`data:application/octet-stream;base64,${bytes.toString('base64')}`;
  }
  const loader=new GLTFLoader();loader.register(()=>({name:'numeric-test-textures',loadTexture:async()=>new THREE.Texture()}));
  const scene=(await loader.parseAsync(JSON.stringify(document),'')).scene;
  const bounds=new THREE.Box3().setFromObject(scene);
  assert.deepEqual(bounds.min.toArray(),profile.min);assert.deepEqual(bounds.max.toArray(),profile.max);
  templates.set(asset,scene);return scene;
}
const specs:SpawnVisualSpec[]=[
  {asset:'tree1',height:treeVisualHeight('tree1',4.3)},
  {asset:'tree2',height:treeVisualHeight('tree2')},{asset:'tree3',height:treeVisualHeight('tree3')},
  {asset:'benchAsset',height:.82,targetWidth:2,targetDepth:.7,fit:'exactBounds'},
  {asset:'bedAsset',height:.78,targetWidth:1,targetDepth:2,fit:'exactBounds'},
  {asset:'stallAsset',height:2.6,targetWidth:2.3,targetDepth:1.2,fit:'exactBounds'},
  {asset:'weaponStandAsset',height:1.25,targetWidth:1.4,targetDepth:1,fit:'exactBounds'},
  {asset:'workbenchAsset',height:1,targetWidth:2,targetDepth:1,fit:'exactBounds'},
  {asset:'bakingOvenAsset',height:3.6,targetWidth:1.4,targetDepth:.9,offsetZ:.4}
];
async function resolved(spec:SpawnVisualSpec,group:THREE.Group){
  const model=(await template(spec.asset)).clone(true);
  if(spec.asset.startsWith('tree'))fitTreeModel(model,spec.height,spec.rotationY??0);
  else{normalizer.normalizeModel(model,spec.height,spec.targetWidth,spec.targetDepth,spec.fit==='exactBounds');model.rotation.y=spec.rotationY??0;}
  model.position.z+=spec.offsetZ??0;group.add(model);group.updateMatrixWorld(true);
  return spec.asset.startsWith('tree')?treePhysics(model,'tree').collider:(()=>{
    const box=new THREE.Box3().setFromObject(group);return {minX:box.min.x,maxX:box.max.x,minZ:box.min.z,maxZ:box.max.z};
  })();
}
function contains(outer:any,inner:any){
  for(const axis of ['X','Z']){
    assert.ok(outer[`min${axis}`]<=inner[`min${axis}`]+1e-6,`${axis} minimum`);
    assert.ok(outer[`max${axis}`]>=inner[`max${axis}`]-1e-6,`${axis} maximum`);
  }
}
for(const spec of specs)test(`${spec.asset}: source envelope contains actual late geometry without changing with load state`,async()=>{
  for(const yaw of [0,.7,Math.PI/2])for(const reflection of [1,-1]){
    const group=new THREE.Group();group.position.set(48,1,-24);group.rotation.y=.31;group.scale.set(reflection*1.1,.9,1.2);group.updateMatrixWorld(true);
    const effective={...spec,rotationY:yaw},before=actorSpawnBounds(effective,group.matrixWorld,'source');
    const actual=await resolved(effective,group);contains(before,actual);
    assert.deepEqual(actorSpawnBounds(effective,group.matrixWorld,'source'),before);
    const physics=new FinePhysicsAuthority();
    const contact:ActorContact={blocked:physics.isBlocked.bind(physics),static:[before],dynamic:[]};
    const anchor={x:48,z:-24},chunk={cx:2,cz:-1} as any;
    const first=findActorSpawn(anchor,chunk,.48,contact);
    physics.registerStatic({...actual,id:'loaded'});
    assert.deepEqual(findActorSpawn(anchor,chunk,.48,contact),first);
  }
});
test('low tree fits, reflected vertical scales and tilted parents retain conservative bounds',async()=>{
  for(const asset of ['tree1','tree2','tree3'])for(const height of [.1,treeVisualHeight(asset)])for(const negativeY of [true,false]){
    const group=new THREE.Group();group.scale.y=negativeY?-1:1;group.rotation.x=negativeY?0:.2;group.updateMatrixWorld(true);
    const spec={asset,height,rotationY:.7},before=actorSpawnBounds(spec,group.matrixWorld,'tree');
    contains(before,await resolved(spec,group));
  }
});
test('exact basal-band height boundaries use a conservative envelope despite floating-point vertex selection',async()=>{
  for(const asset of ['tree1','tree2','tree3'])for(const height of [SPAWN_SOURCE_GEOMETRY[asset].basal!.minHeight,SPAWN_SOURCE_GEOMETRY[asset].basal!.maxHeight]){
    const group=new THREE.Group();group.rotation.y=.31;group.updateMatrixWorld(true);
    const spec={asset,height,rotationY:.7},before=actorSpawnBounds(spec,group.matrixWorld,'tree');
    contains(before,await resolved(spec,group));
  }
});
test('the known .34 to .592679331 tree expansion cannot change an accepted spawn',async()=>{
  const group=new THREE.Group(),spec=specs[0],physics=new FinePhysicsAuthority();group.updateMatrixWorld(true);
  physics.registerStatic({id:'tree',minX:-.34,maxX:.34,minZ:-.34,maxZ:.34});
  const anchor={x:.8,z:0},chunk={cx:0,cz:0} as any;
  assert.equal(physics.isBlocked(anchor.x,anchor.z,.3),false);
  const envelope=actorSpawnBounds(spec,group.matrixWorld,'tree');assert.ok(Math.abs(envelope.maxX-.5926793311880618)<1e-12);
  const contact={blocked:physics.isBlocked.bind(physics),static:[envelope],dynamic:[]};
  const before=findActorSpawn(anchor,chunk,.3,contact);assert.notDeepEqual(before,anchor);
  physics.registerStatic({...await resolved(spec,group),id:'tree'});
  assert.equal(physics.isBlocked(anchor.x,anchor.z,.3),true);
  assert.deepEqual(findActorSpawn(anchor,chunk,.3,contact),before);
});
test('spawn clearance uses actual NPC/animal radii and movable body occupancy',()=>{
  const physics=new FinePhysicsAuthority();physics.registerStatic({id:'edge',minX:-1,maxX:0,minZ:-1,maxZ:1});
  const contact:ActorContact={blocked:physics.isBlocked.bind(physics),static:[],dynamic:[]};
  assert.equal(actorPointClear({x:.31,z:0},.3,contact),true);
  assert.equal(actorPointClear({x:.31,z:0},NPC_BODY_RADIUS,contact),false);
  const radius=wildlifeBodyRadius({traits:{size:4} as any});assert.equal(radius,.48);
  assert.equal(actorPointClear({x:.4,z:0},radius,contact),false);
  contact.dynamic=[{id:'cart',x:5,z:0,radius:1}];assert.equal(actorPointClear({x:6.2,z:0},NPC_BODY_RADIUS,contact),false);
});
test('bounded no-space searches return no position and leave incoming state/cursor untouched',()=>{
  let queries=0;const contact:ActorContact={blocked:()=>{queries++;return true;},static:[],dynamic:[]};
  const state={id:'pending',position:{x:48,z:0},traits:{size:1},randomEventCursor:17} as any;
  const chunk={id:'chunk_2_0',cx:2,cz:0} as any,randomness={version:1 as const,seed:'latticefolk-default'},before=structuredClone(state);
  assert.equal(findActorSpawn(state.position,chunk,.32,contact),undefined);assert.equal(queries,530);
  queries=0;assert.equal(pendingEntryPosition(state,chunk,randomness,contact),undefined);assert.equal(queries,60);assert.deepEqual(state,before);
  contact.blocked=()=>false;
  const peek=pendingEntryPosition(state,chunk,randomness,contact),accepted=structuredClone(state),random=beginRandomEvent(randomness,accepted,'transfer-entry',chunk.id);
  assert.deepEqual(peek,{x:Math.round(48+(random()*2-1)*3),z:Math.round((random()*2-1)*3)});
  assert.equal(accepted.randomEventCursor,18);assert.deepEqual(state,before);
});
