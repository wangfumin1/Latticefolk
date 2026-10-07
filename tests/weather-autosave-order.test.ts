import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

// Run the actual E2E observer and both Promise.all phase expressions against
// controlled request events. No browser, artificial game save or relaxed assertion.
const source=fs.readFileSync(new URL('../e2e/weather-persistence.spec.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('weather-persistence.spec.ts',source,ts.ScriptTarget.Latest,true);
const wanted=new Set(['savedWorld','expectSettledRain','nextBrowserAutosave']);
const helpers=ast.statements.filter((node):node is ts.FunctionDeclaration=>ts.isFunctionDeclaration(node)&&wanted.has(node.name?.text??'')).map(node=>node.getText(ast));
assert.equal(helpers.length,wanted.size);
const phaseExpressions:string[]=[];
function visit(node:ts.Node){
  if(ts.isCallExpression(node)&&node.expression.getText(ast)==='Promise.all'&&node.getText(ast).includes('nextBrowserAutosave(page,request)'))phaseExpressions.push(node.getText(ast));
  ts.forEachChild(node,visit);
}
visit(ast);assert.equal(phaseExpressions.length,2,'both E2E phases must arm the observer alongside the triggering action');
const compile=(text:string)=>ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const helperCode=compile(`${helpers.join('\n')}\nreturn nextBrowserAutosave;`);
function expectation(value:any){
  return {toBe:(expected:any)=>assert.equal(value,expected),toBeNull:()=>assert.equal(value,null),not:{toBeNull:()=>assert.notEqual(value,null)},
    toBeGreaterThanOrEqual:(expected:number)=>assert.ok(value>=expected),toBeLessThan:(expected:number)=>assert.ok(value<expected),
    toHaveAttribute:async(name:string,expected:string)=>assert.equal(value.attributes[name],expected),
    toContainText:async(pattern:RegExp)=>assert.match(value.text,pattern)};
}
function fixture(phaseIndex:number){
  const order:string[]=[],listeners=new Set<(request:any)=>void>(),frame={},attributes:Record<string,string>={'data-persistence-revision':'7','data-persistence-conflict':'false'};
  const meta={day:4,minuteOfDay:800,weather:'rain',weatherEpoch:2};
  let stored={revision:7,snapshot:{meta}},trigger:()=>void=()=>{};
  const page={url:()=> 'http://localhost:5173/',mainFrame:()=>frame,locator:()=>({attributes}),
    waitForRequest(predicate:(candidate:any)=>boolean){order.push('observer armed');return new Promise<any>(resolve=>{
      const listener=(candidate:any)=>{if(predicate(candidate)){listeners.delete(listener);resolve(candidate);}};listeners.add(listener);
    })}};
  const request={get:async()=>({ok:()=>true,json:async()=>stored})};
  function candidate({resourceType='fetch',requestFrame=frame,revision=8,ackGate=Promise.resolve()}={}){
    const counters={bodyReads:0,responseReads:0};
    let responseStarted!:()=>void;const responding=new Promise<void>(resolve=>{responseStarted=resolve;});
    const response={status:()=>200,finished:async()=>null,json:async()=>({revision})};
    return{counters,responding,url:()=> 'http://localhost:5173/api/world/state',method:()=> 'POST',resourceType:()=>resourceType,frame:()=>requestFrame,
      postDataJSON:()=>{counters.bodyReads++;return{expectedRevision:7,snapshot:{meta}};},
      response:async()=>{counters.responseReads++;responseStarted();await ackGate;attributes['data-persistence-revision']=String(revision);stored={revision,snapshot:{meta}};return response;}};
  }
  const observer=new Function('expect',helperCode)(expectation);
  const startFirstPerson=async()=>{order.push('native action');trigger();};
  const phase=new Function('nextBrowserAutosave','startFirstPerson','page','request','expect','clock',compile(`return async()=>${phaseExpressions[phaseIndex]};`))
    (observer,startFirstPerson,page,request,expectation,{text:'Day 4 · Rain'});
  const emit=(outgoing:any)=>{for(const listener of [...listeners])listener(outgoing);};
  return{phase,candidate,emit,order,listeners,setTrigger:(callback:()=>void)=>{trigger=callback;}};
}

for(const phaseIndex of [0,1])test(`${phaseIndex===0?'initial':'reloaded'} phase catches a synchronous native-action POST but not an earlier request or ping`,async()=>{
  const f=fixture(phaseIndex),old=f.candidate(),ping=f.candidate({resourceType:'ping'}),foreign=f.candidate({requestFrame:{}}),fresh=f.candidate();
  f.emit(old); // Same reused main-frame object, but issued before this checkpoint.
  f.setTrigger(()=>{f.emit(ping);f.emit(foreign);f.emit(fresh);});
  const [saved]=await f.phase();
  assert.deepEqual(f.order,['observer armed','native action']);assert.equal(saved.revision,8);assert.equal(saved.storedRevision,8);
  assert.equal(old.counters.bodyReads,0);assert.equal(ping.counters.bodyReads,0);assert.equal(foreign.counters.bodyReads,0);
  assert.equal(fresh.counters.bodyReads,1);assert.equal(fresh.counters.responseReads,1);assert.equal(f.listeners.size,0);
});

test('autosave phase remains tied to its captured request through a delayed acknowledgement',async()=>{
  const f=fixture(1);let release!:()=>void,settled=false;
  const gate=new Promise<void>(resolve=>{release=resolve;}),fresh=f.candidate({ackGate:gate});
  f.setTrigger(()=>f.emit(fresh));const phase=f.phase().then((value:any)=>{settled=true;return value;});
  await fresh.responding;
  assert.equal(settled,false);assert.equal(fresh.counters.responseReads,1);
  release();const [saved]=await phase;assert.equal(saved.revision,8);assert.equal(settled,true);
});

test('an ACK with the wrong CAS revision still fails the original strict assertion',async()=>{
  const f=fixture(1),invalid=f.candidate({revision:9});f.setTrigger(()=>f.emit(invalid));
  await assert.rejects(f.phase(),assert.AssertionError);
});
