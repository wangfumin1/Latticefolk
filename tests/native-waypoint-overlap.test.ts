import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import {playerHeadClearance} from '../src/world/characterContact.js';
import {FinePhysicsAuthority} from '../src/world/finePhysics.js';
type Point={x:number;z:number};
type Constraint={clear:(p:Point)=>number;recoverOverlap:boolean};
const source=fs.readFileSync(new URL('../e2e/helpers/native-waypoint.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('native-waypoint.ts',source,ts.ScriptTarget.Latest,true);let expression='';
function visit(n:ts.Node){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='edgeClear')expression=n.initializer!.getText(ast);ts.forEachChild(n,visit);}visit(ast);assert.ok(expression);
const code=ts.transpileModule(`(${expression})`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const edge=(constraints:Constraint[])=>vm.runInNewContext(code,{constraints}) as (from:Point,to:Point,margin?:number)=>boolean;
const pose={x:1.000136357378664,z:5.371650766912663},yaw=-3.1412924066550363;
const npc=(position:Point=pose,heading=yaw):Constraint[]=>[
 {clear:p=>Math.hypot(p.x-position.x,p.z-position.z)-.62,recoverOverlap:true},
 {clear:p=>playerHeadClearance('female2',position,heading,p),recoverOverlap:true}
];
test('already-overlapping NPC head can be left only by monotonically improving steps',()=>{
 const clear=edge(npc()),start={x:0,z:5.965};
 assert.ok(playerHeadClearance('female2',pose,yaw,start)<0);
 assert.equal(clear(start,{x:-.5,z:5.965}),true);assert.equal(clear({x:-.5,z:5.965},{x:-1,z:5.965}),true);
 assert.equal(clear(start,{x:.5,z:5.965}),false);assert.equal(clear(start,start),false);
});
test('outside-to-inside motion and crossing a whole NPC remain forbidden',()=>{
 const clear=edge(npc());assert.equal(clear({x:-1,z:5.965},{x:.5,z:5.965}),false);
 assert.equal(clear({x:-1,z:5.965},{x:3,z:5.965}),false);
});
test('an improving head cannot hide a worsening overlapping body',()=>{
 const constraints=npc({x:0,z:0},0),from={x:.5,z:0},to={x:.4,z:.2};
 assert.ok(constraints[0].clear(to)<constraints[0].clear(from));
 assert.ok(constraints[1].clear(to)>constraints[1].clear(from));
 assert.equal(edge(constraints)(from,to),false);
 const physics=new FinePhysicsAuthority(),result=physics.moveKinematic({id:'player',position:from,radius:.3,displacement:{x:to.x-from.x,z:to.z-from.z},dynamic:[{id:'npc',x:0,z:0,radius:.32}]});
 assert.ok(result.dynamicHits.includes('npc'));
});
test('recovery never re-enters an overlap after reaching clear space',()=>{
 const clear=edge([{recoverOverlap:true,clear:p=>p.x<.5?p.x-.2:.6-p.x}]);
 assert.equal(clear({x:0,z:0},{x:1,z:0}),false);
});
test('static geometry cannot opt into NPC overlap recovery',()=>{
 const clear=edge([{recoverOverlap:false,clear:p=>Math.max(Math.abs(p.x)-1,0)-.3}]);
 assert.equal(clear({x:1.1,z:0},{x:1.6,z:0}),false);
 assert.equal(clear({x:-2,z:0},{x:2,z:0}),false);
});
for(const invalid of [NaN,Infinity,-Infinity])test(`nonfinite ${String(invalid)} clearance fails closed`,()=>{
 assert.equal(edge([{recoverOverlap:true,clear:()=>invalid}])({x:0,z:0},{x:1,z:0}),false);
 assert.equal(edge([{recoverOverlap:true,clear:p=>p.x===0?-.1:invalid}])({x:0,z:0},{x:1,z:0}),false);
});
