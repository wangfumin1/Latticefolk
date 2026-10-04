import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as THREE from 'three';
import {PointerLockControls} from 'three/examples/jsm/controls/PointerLockControls.js';

const driver=fs.readFileSync(new URL('../e2e/helpers/relative-look.ts',import.meta.url),'utf8');
const main=fs.readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
function callback(source:string){
  const file=ts.createSourceFile('driver.ts',source,ts.ScriptTarget.Latest,true);let found:ts.Node|undefined;
  function visit(node:ts.Node){if(ts.isCallExpression(node)&&node.expression.getText(file)==='page.evaluate'&&node.arguments[0]?.getText(file).includes('movementX'))found=node.arguments[0];ts.forEachChild(node,visit);}
  visit(file);assert.ok(found);return ts.transpileModule(`const run=${found.getText(file)};run;`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
}
const sourceFile=ts.createSourceFile('main.ts',main,ts.ScriptTarget.Latest,true);let pick='',observation='';
function inspect(node:ts.Node){
  if(ts.isMethodDeclaration(node)&&node.name.getText(sourceFile)==='pickEntity')pick=node.getText(sourceFile);
  if(ts.isBinaryExpression(node)&&node.left.getText(sourceFile)==='ui.world.dataset.cameraYaw')observation=node.right.getText(sourceFile);
  ts.forEachChild(node,inspect);
}
inspect(sourceFile);assert.ok(pick);assert.ok(observation);
const Runtime=new Function('THREE',ts.transpileModule(`return class {${pick}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)(THREE);
const observe=new Function('THREE',`return function(){return ${observation}}`)(THREE) as (this:{camera:THREE.Camera})=>string;
const wrap=(angle:number)=>Math.atan2(Math.sin(angle),Math.cos(angle));
class RelativeMouseEvent extends Event{constructor(type:string,_options?:unknown){super(type);}}
type Options={initialYaw?:number;initialPitch?:number;yaw?:number;pitch?:number;reference?:'relative'|'world';lateFrame?:number;lateYaw?:number;targetPitch?:number;occluded?:boolean;missingObservation?:boolean;lostLock?:boolean;code?:string};
async function run(options:Options={}){
  const yaw=options.yaw??Math.PI,pitch=options.pitch??.62,initialYaw=options.initialYaw??0;
  const reference=options.reference??'world',expectedYaw=reference==='world'?-yaw:initialYaw-yaw;
  const camera=new THREE.PerspectiveCamera(75,1.6,.1,100);camera.position.set(0,1.7,0);camera.quaternion.setFromEuler(new THREE.Euler(options.initialPitch??0,initialYaw,0,'YXZ'));camera.updateMatrixWorld();
  const document=new EventTarget() as EventTarget&{pointerLockElement:unknown;querySelector:(selector:string)=>unknown};
  const events:Array<{x:number;y:number}>=[];
  const canvas={ownerDocument:document,dispatchEvent:(event:Event)=>{const e=event as Event&{movementX:number;movementY:number};events.push({x:e.movementX,y:e.movementY});return document.dispatchEvent(event);}};
  document.pointerLockElement=canvas;
  const controls=new PointerLockControls(camera,canvas as unknown as HTMLElement);document.dispatchEvent(new Event('pointerlockchange'));
  const target=new THREE.Mesh(new THREE.BoxGeometry(.75,options.targetPitch===undefined?.75:.16,.75),new THREE.MeshBasicMaterial());
  target.userData={entityType:'object',entityId:'target'};
  const aim=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(-(options.targetPitch??pitch),expectedYaw,0,'YXZ'));
  target.position.copy(camera.position).addScaledVector(aim,2);target.updateMatrixWorld();
  const npc=new THREE.Mesh(new THREE.BoxGeometry(.7,1.82,.7),new THREE.MeshBasicMaterial());npc.userData={entityType:'npc',entityId:'npc'};
  const wrongYaw=options.occluded?expectedYaw:expectedYaw+(options.lateYaw??(Math.abs(initialYaw)>.5?initialYaw:1.3));
  npc.position.set(-Math.sin(wrongYaw)*1.1,.91,-Math.cos(wrongYaw)*1.1);npc.updateMatrixWorld();
  const runtime=new Runtime();Object.assign(runtime,{camera,raycaster:new THREE.Raycaster(),npcs:new Map([['npc',{mesh:npc}]]),wildlife:new Map(),objects:new Map([['target',{mesh:target}]])});
  let frames=0,observed=observe.call({camera});const prompts:string[]=[];
  const dataset=new Proxy({},{get:(_object,key)=>key==='cameraYaw'?(options.missingObservation?undefined:observed):undefined,set:()=>{throw new Error('diagnostic writes are forbidden');}});
  const currentPrompt=()=>{camera.updateMatrixWorld();const hit=runtime.pickEntity(new THREE.Vector2(0,0),3.2);return hit?.type==='object'?'[E] Workbench':hit?.type==='npc'?'[E] Talk to NPC':'';};
  document.querySelector=selector=>selector==='#game canvas'?canvas:selector==='#worldStatus'?{dataset}:selector==='#prompt'?{get innerText(){const p=currentPrompt();prompts.push(p);return p;}}:null;
  const context={document,MouseEvent:RelativeMouseEvent,requestAnimationFrame:(next:()=>void)=>{
    frames++;
    if(options.lateFrame===frames){const event=new RelativeMouseEvent('mousemove');Object.defineProperties(event,{movementX:{value:-(options.lateYaw??1.2)/.002},movementY:{value:0}});document.dispatchEvent(event);}
    if(options.lostLock)document.pointerLockElement=null;
    const before=camera.quaternion.clone();observed=observe.call({camera});assert.deepEqual(camera.quaternion.toArray(),before.toArray(),'observing yaw must not rotate the camera');
    Promise.resolve().then(next);return frames;
  }};
  try{
    const fn=vm.runInNewContext(options.code??callback(driver),context) as (arg:{title:string;yaw:number;pitch:number;reference:'relative'|'world'})=>Promise<boolean>;
    const found=await fn({title:'Workbench',yaw,pitch,reference});const orientation=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ');
    return{found,frames,events,prompts,yaw:orientation.y,pitch:orientation.x,expectedYaw};
  }finally{controls.dispose();target.geometry.dispose();target.material.dispose();npc.geometry.dispose();npc.material.dispose();}
}
for(const initialYaw of [0,1.2,-1.2,2.9,-2.9])for(const yaw of [0,Math.PI])test(`world heading ${yaw} corrects initial yaw ${initialYaw} through real controls`,async()=>{
  const result=await run({initialYaw,yaw});assert.equal(result.found,true,JSON.stringify(result));assert.ok(Math.abs(wrap(result.yaw-result.expectedYaw))<1e-6);assert.ok(result.frames<=10);
});
for(const lateFrame of [1,3])test(`world reference corrects late pointer-lock input at rendered frame ${lateFrame}`,async()=>{
  const result=await run({lateFrame,lateYaw:1.2,targetPitch:lateFrame===3?.82:undefined});assert.equal(result.found,true,JSON.stringify(result));assert.ok(Math.abs(wrap(result.yaw-result.expectedYaw))<1e-6);assert.ok(result.frames<=10);
});
for(const initialYaw of [-1.1,.8])for(const yaw of [0,.4])test(`default relative yaw ${yaw} preserves the caller's heading ${initialYaw}`,async()=>{
  const result=await run({initialYaw,yaw,reference:'relative'});assert.equal(result.found,true,JSON.stringify(result));assert.ok(Math.abs(wrap(result.yaw-(initialYaw-yaw)))<1e-6);
});
test('a real nearer NPC remains the selected entity when it actually occludes the object',async()=>{
  const result=await run({initialYaw:1.2,occluded:true});assert.equal(result.found,false);assert.equal(result.frames,10);assert.ok(result.prompts.every(x=>x==='[E] Talk to NPC'));
});
test('missing world-heading observation fails closed',async()=>{await assert.rejects(run({missingObservation:true}),/observed camera heading/);});
test('read-only observation uses controls YXZ yaw even when default XYZ yaw differs',()=>{
  const camera=new THREE.PerspectiveCamera();camera.quaternion.setFromEuler(new THREE.Euler(-.62,Math.PI,0,'YXZ'));
  const before=camera.quaternion.toArray(),observed=Number(observe.call({camera}));
  assert.ok(Math.abs(wrap(observed-Math.PI))<1e-6);assert.ok(Math.abs(wrap(camera.rotation.y-Math.PI))>1);
  assert.deepEqual(camera.quaternion.toArray(),before);
});
