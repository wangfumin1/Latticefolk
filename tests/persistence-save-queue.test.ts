import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

// Execute the real timer, save and terminal-state methods with controlled I/O.
const source=fs.readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
const wanted=new Set(['saveWorldState','scheduleMovablePersistence','clearMovablePersistenceQueue','initializePersistence','updateFineChunkMaterialization']);
const methods:string[]=[];
for(const node of ast.statements)if(ts.isClassDeclaration(node)&&node.name?.text==='TownGame')for(const member of node.members){
  if(ts.isMethodDeclaration(member)&&wanted.has(member.name.getText(ast)))methods.push(member.getText(ast));
}
assert.equal(methods.length,wanted.size);
const code=ts.transpileModule(`return class Runtime {${methods.join('\n')}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(status=200){
  const timers=new Map<number,()=>void>(),writes:Array<{expectedRevision:number;snapshot:{edit:number}}>=[];
  let timerId=0,release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const deps={window:{setTimeout(fn:()=>void){const id=++timerId;timers.set(id,fn);return id;},clearTimeout(id:number){timers.delete(id);}},
    now:()=>1000,i18n:{t:(key:string)=>key},fetch:async(_url:string,init?:{body:string})=>{
      if(!init)return{ok:false,status:503};
      const body=JSON.parse(init.body);writes.push(body);await gate;
      return{ok:status===200,status,json:async()=>status===409?{currentRevision:8}:{revision:body.expectedRevision+1}};
    }};
  const Runtime=new Function(...Object.keys(deps),code)(...Object.values(deps)),runtime=new Runtime();
  Object.assign(runtime,{persistenceReady:true,persistenceConflict:false,persistenceLoadBlocked:false,persistenceRevision:7,
    persistenceSaveInFlight:false,persistenceSaveQueued:false,movableDirty:true,movableSaveTimer:undefined,movableSaveRetryMs:1500,
    edit:1,portables:{checkpoint:{capture:()=>runtime.edit,acknowledge(){}}},flushWildlifeHabitatExposure(){},
    buildWorldSnapshot:()=>({edit:runtime.edit}),log(){},cameraMode:'firstPerson',streamedPresentation:{unitIds:()=>[]},
    syncStreamedPresentation(){throw Error('Invalid streamed layout');}});
  const saves:Promise<void>[]=[],save=runtime.saveWorldState;
  runtime.saveWorldState=function(){const saving=save.call(this);saves.push(saving);return saving;};
  const settleSaves=()=>Promise.all(saves);
  const pending=()=>runtime.persistenceSaveInFlight||runtime.persistenceSaveQueued;
  const fire=()=>{assert.equal(timers.size,1);const [id,callback]=timers.entries().next().value!;timers.delete(id);callback();};
  return{runtime,timers,writes,release,pending,fire,settleSaves};
}

test('409 clears an existing movable timer and stale delivered callback cannot requeue',async()=>{
  const f=fixture(409),r=f.runtime,saving=r.saveWorldState();
  r.scheduleMovablePersistence();const delivered=f.timers.values().next().value!;
  f.release();await saving;
  assert.equal(r.persistenceConflict,true);assert.equal(f.timers.size,0);assert.equal(r.movableSaveTimer,undefined);
  assert.equal(f.pending(),false);assert.equal(r.movableDirty,true);
  delivered();await f.settleSaves();
  r.scheduleMovablePersistence();await r.saveWorldState();
  assert.equal(f.pending(),false);assert.equal(f.timers.size,0);assert.equal(f.writes.length,1);assert.equal(r.persistenceRevision,7);
});

test('timer that queues during an in-flight 409 is cleared when the conflict arrives',async()=>{
  const f=fixture(409),r=f.runtime,saving=r.saveWorldState();
  r.scheduleMovablePersistence();f.fire();assert.equal(r.persistenceSaveQueued,true);
  f.release();await saving;
  assert.equal(f.pending(),false);assert.equal(f.writes.length,1);assert.equal(r.movableDirty,true);
});

test('streamed failure during a slow ACK cancels queued work without hiding unsaved edits',async()=>{
  const f=fixture(),r=f.runtime,saving=r.saveWorldState();
  r.edit=2;r.scheduleMovablePersistence();const delivered=f.timers.values().next().value!;
  r.updateFineChunkMaterialization();
  assert.equal(r.persistenceLoadBlocked,true);assert.equal(f.timers.size,0);assert.equal(r.persistenceSaveQueued,false);
  delivered();assert.equal(r.persistenceSaveQueued,false);
  f.release();await saving;
  assert.equal(f.pending(),false);assert.equal(f.writes.length,1);assert.equal(r.persistenceRevision,8);assert.equal(r.movableDirty,true);
  r.scheduleMovablePersistence();assert.equal(f.timers.size,0);
});

test('initial load failure clears pending movable work and does not write',async()=>{
  const f=fixture(),r=f.runtime;
  r.updateFineChunkMaterialization=()=>{};
  r.scheduleMovablePersistence();r.persistenceSaveQueued=true;
  await r.initializePersistence();
  assert.equal(r.persistenceLoadBlocked,true);assert.equal(r.persistenceReady,true);
  assert.equal(f.pending(),false);assert.equal(f.timers.size,0);assert.equal(r.movableDirty,true);assert.equal(f.writes.length,0);
});

test('new edit whose timer fires during slow ACK is saved with the next CAS revision',async()=>{
  const f=fixture(),r=f.runtime,saving=r.saveWorldState();
  r.edit=2;r.scheduleMovablePersistence();f.fire();
  assert.equal(r.persistenceSaveQueued,true);
  f.release();await saving;
  assert.deepEqual(f.writes,[{expectedRevision:7,snapshot:{edit:1}},{expectedRevision:8,snapshot:{edit:2}}]);
  assert.equal(r.persistenceRevision,9);assert.equal(f.pending(),false);assert.equal(r.movableDirty,false);
});

test('a newer edit timer survives a successful earlier ACK and then saves normally',async()=>{
  const f=fixture(),r=f.runtime,saving=r.saveWorldState();
  r.edit=2;r.scheduleMovablePersistence();f.release();await saving;
  assert.equal(f.timers.size,1);assert.equal(r.movableDirty,true);assert.equal(f.writes.length,1);
  f.fire();await f.settleSaves();
  assert.deepEqual(f.writes,[{expectedRevision:7,snapshot:{edit:1}},{expectedRevision:8,snapshot:{edit:2}}]);
  assert.equal(f.pending(),false);assert.equal(r.movableDirty,false);
});

test('a fresh loaded runtime can save new edits after a previous runtime became terminal',async()=>{
  const old=fixture(409);old.release();await old.runtime.saveWorldState();assert.equal(old.runtime.persistenceConflict,true);
  const fresh=fixture();fresh.runtime.persistenceRevision=8;fresh.runtime.edit=3;fresh.release();
  fresh.runtime.scheduleMovablePersistence();fresh.fire();await fresh.settleSaves();
  assert.deepEqual(fresh.writes,[{expectedRevision:8,snapshot:{edit:3}}]);assert.equal(fresh.runtime.persistenceRevision,9);
  assert.equal(fresh.pending(),false);assert.equal(fresh.runtime.movableDirty,false);
});
