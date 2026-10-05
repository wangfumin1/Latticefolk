import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
import ts from 'typescript';
import {FinePhysicsAuthority,type PhysicsPoint,type StaticCollider} from '../src/world/finePhysics.js';
import {registerHomeTerrain} from '../src/world/fineTerrain.js';
import {characterHeadEnvelope,playerHeadConstraint,playerHeadClearance,NPC_BODY_RADIUS} from '../src/world/characterContact.js';

type Actor={id:string;asset:string;position:PhysicsPoint;headYaw:number};
type Fixture={name:string;start:PhysicsPoint;target:PhysicsPoint;actors:Actor[];tolerance?:number;timeoutMs?:number;statics?:StaticCollider[];diagnosticStatics?:StaticCollider[]};
type Result={reached:boolean;x:number;z:number;distance:number;detours:number};
// Run the actual self-contained browser callback with keyboard events and read-only
// diagnostics, integrating unchanged production physics. This is not browser E2E.
const source=fs.readFileSync(new URL('../e2e/helpers/native-waypoint.ts',import.meta.url),'utf8');
const callback=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}})
  .outputText.replace('export async function driveNativeWaypoint','async function driveNativeWaypoint')+'\ndriveNativeWaypoint;';
const saved=JSON.parse(fs.readFileSync(new URL('./fixtures/native-waypoint-ci.json',import.meta.url),'utf8')) as Omit<Fixture,'name'>;
const actual:Fixture={...saved,name:'CI frozen actor poses'};
const actor=(id:string,asset:string,x:number,z:number,headYaw:number):Actor=>({id,asset,position:{x,z},headYaw});

async function replay(fixture:Fixture,frameMs:number,options:{loseLock?:boolean;moveActor?:boolean;intrudeAt?:number;badActors?:boolean;badPosition?:boolean;coverGoalAt?:number;uncoverGoalAt?:number;badTrees?:boolean}={}){
  let p={...fixture.start},elapsed=0,frames=0,simulation=0;
  const actors=structuredClone(fixture.actors),held=new Set<string>(),events:Array<{type:string;code:string}>=[];
  const physics=new FinePhysicsAuthority();registerHomeTerrain(physics,72);
  for(const collider of fixture.statics??[])physics.registerStatic(collider);
  const canvas={};
  const dataset=new Proxy({},{get:(_target,key)=>{
    if(key==='playerX')return options.badPosition&&frames>0?'NaN':p.x.toFixed(4);
    if(key==='playerZ')return p.z.toFixed(4);
    if(key==='playerInputSeconds')return String(simulation);
    if(key==='treePresentation')return options.badTrees?'{invalid':JSON.stringify((fixture.diagnosticStatics??[]).map(collider=>({collider})));
    if(key==='characterSoles'&&options.badActors)return '{invalid';
    if(key==='characterSoles')return JSON.stringify(actors.map(a=>({...a,headEnvelope:characterHeadEnvelope(a.asset)})));
    return undefined;
  },set:()=>{throw new Error('diagnostic mutation is forbidden');}});
  const document={pointerLockElement:canvas as object|null,querySelector:(selector:string)=>selector==='#game canvas'?canvas:{dataset}};
  const context={document,performance:{now:()=>elapsed},KeyboardEvent:class{
    type:string;code:string;constructor(type:string,options:{code:string}){this.type=type;this.code=options.code;}
  },window:{dispatchEvent:(event:{type:string;code:string})=>{
    assert.ok(['KeyW','KeyA','KeyS','KeyD','ShiftLeft'].includes(event.code));
    events.push(event);if(event.type==='keydown')held.add(event.code);else held.delete(event.code);return true;
  }},requestAnimationFrame:(next:()=>void)=>{
    elapsed+=frameMs;frames++;
    if(options.moveActor&&frames===10)actors[0].position.z+=2;
    if(options.intrudeAt===frames)actors[1].position.z=1.44;
    if(options.coverGoalAt===frames)actors[0].position.x=fixture.target.x;
    if(options.uncoverGoalAt===frames)actors[0].position.x=fixture.actors[0].position.x;
    const x=Number(held.has('KeyD'))-Number(held.has('KeyA')),z=Number(held.has('KeyS'))-Number(held.has('KeyW')),length=Math.hypot(x,z);
    if(length){
      simulation+=Math.min(.05,frameMs/1000);
      const distance=(held.has('ShiftLeft')?7.2:4.5)*Math.min(.05,frameMs/1000);
      p=physics.moveKinematic({id:'player',position:p,radius:.30,displacement:{x:x/length*distance,z:z/length*distance},
        dynamic:actors.map(a=>({id:a.id,...a.position,radius:NPC_BODY_RADIUS})),
        constraints:actors.map(a=>playerHeadConstraint(a.id,a.asset,a.position,a.headYaw))}).position;
    }
    if(options.loseLock)document.pointerLockElement=null;
    Promise.resolve().then(next);return frames;
  }};
  const fn=vm.runInNewContext(callback,context) as (args:{target:PhysicsPoint;timeoutMs:number;tolerance:number})=>Promise<Result>;
  try{
    const result=await fn({target:fixture.target,timeoutMs:fixture.timeoutMs??45_000,tolerance:fixture.tolerance??.55});
    return {result,frames,elapsed,events,finalClearances:actors.map(a=>playerHeadClearance(a.asset,a.position,a.headYaw,p))};
  }finally{
    assert.equal(held.size,0,'success, timeout and exceptions must release every key');
  }
}

const fixtures:Fixture[]=[actual,
  {...actual,name:'reverse CI target',start:actual.target,target:actual.start},
  {...actual,name:'rotated CI layout',start:{x:-actual.start.x,z:-actual.start.z},target:{x:-actual.target.x,z:-actual.target.z},
    actors:actual.actors.map(a=>({...a,position:{x:-a.position.x,z:-a.position.z},headYaw:a.headYaw+Math.PI}))},
  {name:'wide head east',start:{x:-3,z:0},target:{x:3,z:0},actors:[actor('one','female2',0,0,0)]},
  {name:'wide head west',start:{x:3,z:0},target:{x:-3,z:0},actors:[actor('one','female2',0,0,0)]},
  {name:'rotated head north',start:{x:0,z:3},target:{x:0,z:-3},actors:[actor('one','female1',0,0,.71)]},
  {name:'staggered pair east',start:{x:-3,z:0},target:{x:5,z:0},actors:[actor('one','male1',0,-.5,1.3),actor('two','female1',2.2,.9,-.9)]},
  {name:'staggered pair west',start:{x:5,z:0},target:{x:-3,z:0},actors:[actor('one','male1',0,-.5,1.3),actor('two','female1',2.2,.9,-.9)]},
  {name:'shared long clear waypoint',start:{x:5.2,z:4},target:{x:13.95,z:3.4},actors:[],tolerance:.45},
  {name:'shared fine approach',start:{x:13.95,z:3.4},target:{x:13.95,z:2.35},actors:[],tolerance:.28,timeoutMs:12_000}
];
for(const fixture of fixtures)for(const frameMs of [16,100,500,1000])test(`${fixture.name} at ${frameMs}ms rendered steps`,async()=>{
  const {result,elapsed}=await replay(fixture,frameMs);
  assert.equal(result.reached,true,JSON.stringify(result));
  assert.ok(result.distance<=(fixture.tolerance??.55));
  assert.ok(elapsed<=(fixture.timeoutMs??45_000));
});
test('moving actor is still subject to unchanged production collision',async()=>{
  const {result}=await replay(fixtures[3],500,{moveActor:true});assert.equal(result.reached,true);
});
test('insufficient rendering budget remains a failure at the original deadline',async()=>{
  const {result,elapsed}=await replay(actual,1500);assert.equal(result.reached,false);assert.equal(elapsed,45_000);
});
test('unreachable target inside an actor remains a failure',async()=>{
  const {result}=await replay({...fixtures[3],target:{x:0,z:0}},500);assert.equal(result.reached,false);
});
test('lost pointer lock throws and releases held keys',async()=>{
  await assert.rejects(replay(actual,100,{loseLock:true}),/lost pointer lock/);
});
test('already reached target sends no keyboard events',async()=>{
  const {result,events}=await replay({...actual,target:actual.start},100);assert.equal(result.reached,true);assert.equal(events.length,0);
});

// Independent review's old-pass/new-fail static and grid-goal counterexamples.
const staticFixtures:Fixture[]=[
  {name:'unobserved static prop',start:{x:-3,z:0},target:{x:3,z:0},actors:[],
    statics:[{id:'prop',minX:-.5,maxX:.5,minZ:-.5,maxZ:.5}]},
  {name:'two unobserved static props',start:{x:-3,z:0},target:{x:3,z:0},actors:[],
    statics:[{id:'prop',minX:-.5,maxX:.5,minZ:-.5,maxZ:.5},{id:'prop2',minX:.8,maxX:1.2,minZ:.7,maxZ:1.1}]},
  {name:'NPC route meets unobserved wall',start:{x:-3,z:0},target:{x:3,z:0},actors:[actor('one','female2',0,0,0)],
    statics:[{id:'wall',minX:-3,maxX:3,minZ:1.2,maxZ:2.2}]},
  {name:'NPC wall reverse goal',start:{x:3,z:0},target:{x:-3,z:0},actors:[actor('one','female2',0,0,0)],
    statics:[{id:'wall',minX:-3,maxX:3,minZ:1.2,maxZ:2.2}]}
];
for(const fixture of staticFixtures)for(const frameMs of [16,100,500])test(`${fixture.name} at ${frameMs}ms`,async()=>{
  const {result}=await replay(fixture,frameMs);assert.equal(result.reached,true,JSON.stringify(result));assert.ok(result.distance<=.55);
});
for(const target of [{x:3.5,z:.16},{x:3.5,z:.167},{x:3.51,z:.16}])for(const frameMs of [16,100,500])test(`off-grid exact goal ${target.x},${target.z} at ${frameMs}ms`,async()=>{
  const {result}=await replay({...fixtures[3],target,tolerance:.28},frameMs);
  assert.equal(result.reached,true,JSON.stringify(result));assert.ok(result.distance<=.28);
});
for(const intrudeAt of [9,10,11,12,13,14])for(const frameMs of [100,500])test(`moving NPC enters planned route at frame ${intrudeAt}, ${frameMs}ms`,async()=>{
  const fixture={...fixtures[3],actors:[actor('one','female2',0,0,0),actor('two','male1',0,10,0)]};
  const {result}=await replay(fixture,frameMs,{intrudeAt});
  assert.equal(result.reached,true,JSON.stringify(result));assert.ok(result.detours>=2,'intrusion must actually trigger fresh planning');
});
test('malformed actor diagnostic throws and releases held keys',async()=>{
  await assert.rejects(replay(actual,100,{badActors:true}),/JSON|property|position/i);
});
test('unavailable position throws and releases held keys',async()=>{
  await assert.rejects(replay(actual,100,{badPosition:true}),/position is unavailable/);
});


const secondRecorded=JSON.parse(fs.readFileSync(new URL('./fixtures/native-waypoint-second-ci.json',import.meta.url),'utf8')) as Fixture&{callStart:PhysicsPoint;checkpointRemainingMs:number};
for(const frameMs of [16,500,750])test(`recorded second-waypoint actors and tree footprints at ${frameMs}ms`,async()=>{
  const {result,elapsed,finalClearances}=await replay({...secondRecorded,start:secondRecorded.callStart},frameMs);
  assert.equal(result.reached,true,JSON.stringify(result));assert.ok(result.distance<=.45);assert.ok(elapsed<=45_000);assert.ok(finalClearances.every(d=>d>=-1e-8));
});
test('recorded pre-detour checkpoint fits its original remaining time',async()=>{
  const {result,elapsed}=await replay({...secondRecorded,timeoutMs:secondRecorded.checkpointRemainingMs},750);
  assert.equal(result.reached,true,JSON.stringify(result));assert.ok(elapsed<=secondRecorded.checkpointRemainingMs);assert.ok(result.distance<=.45);
});
test('insufficient late-checkpoint budget is still a failure',async()=>{
  const {result,elapsed}=await replay({...secondRecorded,timeoutMs:secondRecorded.checkpointRemainingMs},1000);
  assert.equal(result.reached,false);assert.equal(elapsed,24_000);assert.ok(result.distance>.45);
});
const partialGoals:Fixture[]=[
  {name:'east tolerance region',start:{x:-3,z:0},target:{x:1.6,z:.16},actors:[actor('one','female2',0,0,0)],tolerance:.28},
  {name:'west tolerance region',start:{x:3,z:0},target:{x:-1.55,z:.16},actors:[actor('one','female2',0,0,0)],tolerance:.28},
  {name:'north tolerance region',start:{x:0,z:3},target:{x:.16,z:-1.6},actors:[actor('one','female2',0,0,Math.PI/2)],tolerance:.28},
  {name:'south tolerance region',start:{x:0,z:-3},target:{x:.16,z:1.55},actors:[actor('one','female2',0,0,Math.PI/2)],tolerance:.28}
];
for(const fixture of partialGoals)for(const frameMs of [16,100,500,750])test(`${fixture.name} accepts a reachable point without enlarging tolerance at ${frameMs}ms`,async()=>{
  const a=fixture.actors[0];assert.ok(playerHeadClearance(a.asset,a.position,a.headYaw,fixture.target)<0,'the exact center really is occupied');
  const {result,finalClearances}=await replay(fixture,frameMs);assert.equal(result.reached,true,JSON.stringify(result));assert.ok(result.distance<=.28);assert.ok(finalClearances.every(d=>d>=-1e-8));
});
for(const frameMs of [100,500])test(`moving NPC invalidates the candidate region until it clears at ${frameMs}ms`,async()=>{
  const {result,frames,finalClearances}=await replay(partialGoals[0],frameMs,{coverGoalAt:11,uncoverGoalAt:30});
  assert.equal(result.reached,true,JSON.stringify(result));assert.ok(frames>=30,'must not succeed while the entire region is occupied');assert.ok(result.distance<=.28);assert.ok(finalClearances.every(d=>d>=-1e-8));
});
test('a moving NPC that keeps the entire tolerance region occupied cannot turn green',async()=>{
  const {result,elapsed}=await replay(partialGoals[0],500,{coverGoalAt:11});assert.equal(result.reached,false);assert.equal(elapsed,45_000);
});
test('malformed observed tree footprints throw and release keys',async()=>{
  await assert.rejects(replay(actual,100,{badTrees:true}),/JSON|property|position/i);
});

const restoredOverlap=JSON.parse(fs.readFileSync(new URL('./fixtures/native-waypoint-overlap-ci.json',import.meta.url),'utf8')) as Fixture;
for(const frameMs of [800,1200,1400])test(`God-return overlap from CI exits through unchanged physics at ${frameMs}ms steps`,async()=>{
  const {result,elapsed}=await replay(restoredOverlap,frameMs);
  assert.equal(result.reached,true,JSON.stringify(result));
  assert.ok(result.distance<=restoredOverlap.tolerance!);assert.ok(elapsed<=restoredOverlap.timeoutMs!);
});
