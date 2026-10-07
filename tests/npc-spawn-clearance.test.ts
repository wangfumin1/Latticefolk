import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {playerHeadClearance,NPC_BODY_RADIUS} from '../src/world/characterContact.js';
import {FinePhysicsAuthority} from '../src/world/finePhysics.js';
import {fineParcelFixture} from '../e2e/helpers/parcel-fixture.js';
import type {CoarseChunkState} from '../src/types.js';
const source=fs.readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
const game=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='TownGame') as ts.ClassDeclaration;
const method=game.members.find(n=>n.name?.getText(ast)==='fineSpawnPosition')!.getText(ast);
const Runtime=new Function('playerHeadClearance','NPC_BODY_RADIUS',ts.transpileModule(`return class Runtime {${method}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)(playerHeadClearance,NPC_BODY_RADIUS);
const chunk:CoarseChunkState={id:'chunk_2_0',cx:2,cz:0,biome:'plains',settlementLevel:0,population:6,food:50,wood:50,water:50,ecology:50,danger:0,prosperity:10,strategy:'sustain',migrationPolicy:'retain',ecologyPolicy:'balance',lastDecisionAt:0,decisionVersion:0};
const runtime=(playerPosition={x:49.8,z:-1.9})=>Object.assign(new Runtime(),{playerPosition,physics:new FinePhysicsAuthority(),npcs:new Map()});

test('new NPC generation rejects the real oven player overlap and uses the same deterministic bounded search',()=>{
  const start={x:50.9684805332861,z:-1.064054489161818},r=runtime();
  assert.ok(Math.abs(playerHeadClearance('female2',start,0,r.playerPosition)+.4315194667139)<1e-10);
  assert.equal(r.physics.isBlocked(start.x,start.z,.3),false);
  const next=r.fineSpawnPosition(start,chunk,'female2');
  assert.notDeepEqual(next,start);assert.ok(playerHeadClearance('female2',next,0,r.playerPosition)>=0);
  assert.deepEqual(runtime().fineSpawnPosition(start,chunk,'female2'),next);
  assert.deepEqual(start,{x:50.9684805332861,z:-1.064054489161818});
});

test('legal generated positions and the wildlife call contract remain unchanged',()=>{
  const r=runtime(),clear={x:43,z:4},overlap={x:50.9684805332861,z:-1.064054489161818};
  assert.equal(r.fineSpawnPosition(clear,chunk,'male1'),clear);
  assert.equal(r.fineSpawnPosition(overlap,chunk),overlap);
});

test('an earlier relocated resident reserves its physical body for both original and searched candidates',()=>{
  const r=runtime(),point={x:48,z:0};r.npcs.set('earlier',{mesh:{position:point}});
  const next=r.fineSpawnPosition(point,chunk,'female1');
  assert.ok(Math.hypot(next.x-point.x,next.z-point.z)>=NPC_BODY_RADIUS*2);
  r.npcs.get('earlier').removed=true;assert.equal(r.fineSpawnPosition(point,chunk,'female1'),point);
});

test('a fully blocked owner fails visibly after its finite search instead of spawning an overlapping NPC',()=>{
  const r=runtime();let checks=0;r.physics={isBlocked(){checks++;return true;}};
  assert.throws(()=>r.fineSpawnPosition({x:48,z:0},chunk,'female1'),/No clear NPC spawn in chunk_2_0/);
  assert.equal(checks,530);
});

test('the accepted parcel donor keeps its original NPC02 coordinate and player offset',async()=>{
  const fixture=await fineParcelFixture(chunk),r=runtime(fixture.start),point={x:fixture.donor.x,z:fixture.donor.z};
  assert.equal(fixture.donor.id,'chunk_2_0_npc_02');
  assert.equal(r.fineSpawnPosition(point,chunk,fixture.donor.characterAsset),point);
  assert.deepEqual(point,{x:43.90367976010826,z:2.4629100225198437});
});
