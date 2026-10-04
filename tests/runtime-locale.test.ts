import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import * as THREE from 'three';
import {I18n,SUPPORTED_LOCALES} from '../src/i18n.js';
import {CoarseWorldRuntime} from '../src/world/coarseWorld.js';
import {visibleHudLogs} from '../src/ui/hudDiagnostics.js';
import {worldObjectRigidBody} from '../src/world/movablePhysics.js';
import {isBakingOven,BAKING_OVEN_ASSET} from '../src/scene/bakingOven.js';
import {WATER_PATCH_ASSET} from '../src/scene/waterPatch.js';
import {refreshLocaleText} from '../src/ui/runtimeLocale.js';
import {droppedParcelLabel} from '../src/scene/droppedParcel.js';
import {droppedItemCount} from '../src/world/portableObjects.js';
import {normalizeWildlifeDomestication,isWildlifeDomesticationEligible} from '../src/world/domestication.js';
const {JSDOM}=createRequire(import.meta.url)('jsdom');
const source=fs.readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true),methods=new Map<string,string>();
let template='',uiSource='';
function visit(n:ts.Node){
 if(ts.isBinaryExpression(n)&&n.left.getText(ast)==='app.innerHTML')template=n.right.getText(ast);
 if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='ui')uiSource=n.initializer!.getText(ast);
 if(ts.isMethodDeclaration(n))methods.set(n.name.getText(ast),n.getText(ast));
 ts.forEachChild(n,visit);
}visit(ast);
const transpile=(s:string)=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const wanted=['bindInput','changeLocale','refreshInteractionLabels','openInteractionMenu','openWildlifeInteractionMenu','closeInteractionMenu','updatePrompt','interactionLabel','objectDisplayName','parcelLabel','itemName','wildlifeName','playerTalk','npcTalkPlayerAuto','npcConversation','actor','applyRelation','importDialogue','updateUi','renderEvolutionPanel','renderInteractionNetworkEvidence','escape','updateLocalizedUi','renderBudget','applyBudgetFromUi','applyBudgetPreset','refreshHealth'];
const code=transpile(`return class Runtime {${wanted.map(k=>{assert.ok(methods.has(k),k);return methods.get(k);}).join('\n')}}`);
function fixture(initial='en',fullUi=false,actualBudget=false){
 const i18n=new I18n(initial),html=new Function('i18n','SUPPORTED_LOCALES',`return ${template}`)(i18n,SUPPORTED_LOCALES);
 const w=new JSDOM(`<html><body><div id="app">${html}</div></body></html>`,{url:'https://latticefolk.test'}).window;
 const document=w.document as Document,ui=new Function('document',transpile(`return ${uiSource}`))(document);
 const requests:Array<{url:string;body:any;resolve:(value:any)=>void}>=[];
 const fetch=(url:string,init:any)=>new Promise(resolve=>requests.push({url,body:init?.body?JSON.parse(init.body):undefined,resolve}));
 const Runtime=new Function('ui','document','addEventListener','i18n','refreshLocaleText','localStorage','THREE','normalizeWildlifeDomestication','isWildlifeDomesticationEligible','droppedParcelLabel','droppedItemCount','fetch','clamp','worldObjectRigidBody','isBakingOven','BAKING_OVEN_ASSET','WATER_PATCH_ASSET','visibleHudLogs','now',code)(ui,document,w.addEventListener.bind(w),i18n,refreshLocaleText,w.localStorage,THREE,normalizeWildlifeDomestication,isWildlifeDomesticationEligible,droppedParcelLabel,droppedItemCount,fetch,(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v)),worldObjectRigidBody,isBakingOven,BAKING_OVEN_ASSET,WATER_PATCH_ASSET,visibleHudLogs,()=>0);
 const r=new Runtime();let locks=0,unlocks=0,renders=0,health=0,actions=0;
 const canvas=document.createElement('canvas');document.querySelector('#game')!.append(canvas);
 const clockFragment=methods.get('updateLocalizedUi')!.split('    ui.clock.textContent=')[1].split('    const entity=')[0];
 const renderClock=new Function('ui','i18n',transpile(`return function(){ui.clock.textContent=${clockFragment}}`))(ui,i18n);
 Object.assign(r,{locale:i18n.locale,cameraMode:'firstPerson',aiPaused:false,perceptionEpoch:17,keys:new Set(),interactionOpen:false,
  playerPosition:{x:5,z:4},playerInventory:{coin:12,bread:2},day:3,weather:'clear',selectedEntity:{type:'object',id:'well'},hoverEntity:undefined,
  npcs:new Map(),wildlife:new Map(),objects:new Map(),renderer:{domElement:canvas},camera:{position:new THREE.Vector3(5,1.7,4)},orbit:{enabled:false},
  controls:{isLocked:false,addEventListener(){},lock(){locks++;this.isLocked=true;},unlock(){unlocks++;this.isLocked=false;}},
  persistenceReady:true,persistenceRevision:42,persistenceSaveInFlight:true,persistenceSaveQueued:true,movableDirty:true,persistenceConflict:false,
  budgetInputVersion:0,budgetSavedVersion:0,budgetApplyVersion:0,inFlight:2,wildlifeDecisionPending:true,nextWildlifeBatchAt:1234,movableSaveTimer:99,logs:['existing warning'],recentEvents:['existing event'],
  updateLocalizedUi(){renders++;renderClock.call(this);},gameTimeText:()=> '08:30',worldSeason:()=> 'spring',nearbyTags:()=>['town'],
  executePlayerInteraction(){actions++;},feedWildlifeForTaming(){actions++;},commandOwnedWildlife(){actions++;},toggleOwnedWildlifeBreeding(){actions++;},
  say(n:any,text:string){n.speech={text,until:9000};},remember(){},log(text:string){this.logs.push(text);},toast(text:string){ui.toast.textContent=text;},refreshHealth(){health++;}
 });
 if(fullUi){
  delete r.updateLocalizedUi;r.selectedEntity=undefined;r.logs=[{text:'existing warning',audience:'player'}];
  r.camera=new THREE.PerspectiveCamera();r.camera.position.set(5,1.7,4);
  Object.assign(r,{coarseWorld:new CoarseWorldRuntime(new THREE.Scene()),physics:{stats:()=>({terrainSurfaces:1,staticColliders:0,triggers:0})},visualTargets:[],assetLoadFailures:[],groundHeightAt:()=>0,playerInputSeconds:0,
   wildlifePresentation:{getDiagnosticsSummary:()=>({pending:0,ready:0,failed:0,count:0})},portables:{diagnostics:()=>({parcels:[]})},sunShadow:{diagnostics:()=>({mapSize:2048})},physicsDynamicColliders:()=>r.cameraMode==='firstPerson'?[{id:'player'}]:[],
   wildlifeLineage:new Map(),evolutionStatistics:()=>[],coevolutionStatistics:()=>[],interactionSelectionStatistics:()=>[],activeInteractionNetwork:()=>({chunks:0,edges:[],nodes:[],coverage:{predation:0,competition:0,disease:0}})});
 }
 if(actualBudget)delete r.refreshHealth;
 r.bindInput();
 const select=(locale:string)=>{ui.localeSelect.value=locale;ui.localeSelect.dispatchEvent(new w.Event('change',{bubbles:true}));};
 return {w,document,ui,r,i18n,requests,select,canvas,counts:()=>({locks,unlocks,renders,health,actions}),close:()=>w.close()};
}
function unchanged(r:any){return JSON.stringify({cameraMode:r.cameraMode,aiPaused:r.aiPaused,epoch:r.perceptionEpoch,budgetInput:r.budgetInputVersion,budgetSaved:r.budgetSavedVersion,budgetApply:r.budgetApplyVersion,player:r.playerPosition,inventory:r.playerInventory,day:r.day,weather:r.weather,selection:r.selectedEntity,interactionOpen:r.interactionOpen,object:r.interactionObjectId,wildlife:r.interactionWildlifeId,locked:r.controls.isLocked,persistenceReady:r.persistenceReady,revision:r.persistenceRevision,inFlight:r.inFlight,saveInFlight:r.persistenceSaveInFlight,saveQueued:r.persistenceSaveQueued,dirty:r.movableDirty,conflict:r.persistenceConflict,wildlifePending:r.wildlifeDecisionPending,nextBatch:r.nextWildlifeBatchAt,timer:r.movableSaveTimer,logs:r.logs,events:r.recentEvents});}
for(const mode of ['firstPerson','god'])for(const paused of [false,true])test(`${mode} paused=${paused}: four locales preserve runtime and DOM state`,()=>{
 const f=fixture(),r=f.r;r.cameraMode=mode;r.aiPaused=paused;r.orbit.enabled=mode==='god';const before=unchanged(r),nodes=[...f.document.querySelectorAll('*')];
 const text=f.document.querySelector<HTMLTextAreaElement>('#importText')!;text.value='unsent 中文 <draft>';text.focus();text.setSelectionRange(3,7);
 const format=f.document.querySelector<HTMLSelectElement>('#importFormat')!;format.value='jsonl';
 const file=f.document.querySelector<HTMLInputElement>('#importFile')!,chosen=new f.w.File(['draft'],'draft.txt');Object.defineProperty(file,'files',{value:[chosen]});
 const inputs=[...f.document.querySelectorAll<HTMLInputElement>('#jevBudgetPanel input')];inputs.forEach((e,i)=>e.value=String(i+11));
 const staticBindings=[...f.document.querySelectorAll<HTMLElement>('[data-i18n]')];assert.equal(staticBindings.length,22);assert.ok(staticBindings.every(e=>e.childElementCount===0));
 for(const locale of ['ja','es','zh-CN','en']){
  f.select(locale);assert.equal(r.locale,locale);assert.equal(f.i18n.locale,locale);assert.equal(f.document.documentElement.lang,locale);assert.equal(f.w.localStorage.getItem('latticefolk.locale'),locale);
  assert.equal(unchanged(r),before);assert.deepEqual([...f.document.querySelectorAll('*')],nodes);assert.equal(f.document.activeElement,text);assert.equal(text.value,'unsent 中文 <draft>');assert.equal(text.selectionStart,3);assert.equal(text.selectionEnd,7);assert.equal(file.files![0],chosen);assert.equal(format.value,'jsonl');inputs.forEach((e,i)=>assert.equal(e.value,String(i+11)));
  for(const e of staticBindings)assert.equal(e.textContent,f.i18n.t(e.dataset.i18n!));assert.equal(f.ui.modeBtn.textContent,f.i18n.t(mode==='god'?'mode.first':'mode.god'));assert.equal(f.document.querySelector('#pauseBtn')!.textContent,f.i18n.t(paused?'console.resume':'console.pause'));assert.ok(f.ui.clock.textContent.includes(f.i18n.t('weather.clear')));
 }
 assert.equal(f.counts().locks+f.counts().unlocks+f.counts().health,0);assert.equal(f.requests.length,0);f.close();
});
for(const owner of [undefined,'player','another'])test(`open wildlife menu owner=${owner} keeps nodes, focus and authority`,()=>{
 const f=fixture(),state={id:'pet',species:'sheep',domestication:{tameProgress:owner?100:67,ownerId:owner,command:'follow',breedingAllowed:true}},animal={state};f.r.wildlife.set('pet',animal);f.r.openWildlifeInteractionMenu(animal);
 assert.equal(state.domestication.ownerId,owner);const before=JSON.stringify(state),buttons=[...f.ui.interactionActions.children] as HTMLButtonElement[];assert.equal(buttons.length,owner==='player'?5:owner?0:1);buttons[0]?.focus();const focus=f.document.activeElement,counts=f.counts();
 for(const locale of ['ja','es','zh-CN','en']){f.select(locale);assert.equal(JSON.stringify(state),before);assert.deepEqual([...f.ui.interactionActions.children],buttons);assert.equal(f.document.activeElement,focus);assert.equal(f.r.interactionWildlifeId,'pet');assert.equal(f.r.interactionOpen,true);assert.ok(f.ui.interactionTitle.textContent.includes(f.i18n.t('domestication.title')));for(const b of buttons)assert.equal(b.textContent,f.i18n.t(b.dataset.i18n!));assert.equal(f.counts().locks,counts.locks);assert.equal(f.counts().unlocks,counts.unlocks);}
 if(buttons.length){buttons[0].click();assert.equal(f.counts().actions,1);assert.equal(f.r.interactionOpen,false);}f.close();
});
test('object menu follows wildlife without stale target and preserves action listeners',()=>{
 const f=fixture(),animal={state:{id:'pet',species:'sheep'}};f.r.wildlife.set('pet',animal);f.r.openWildlifeInteractionMenu(animal);
 const object={state:{id:'table',name:'Maker',kind:'workstation',tags:['work']}};f.r.objects.set('table',object);f.r.openInteractionMenu(object,['work','inspect']);assert.equal(f.r.interactionWildlifeId,undefined);
 const buttons=[...f.ui.interactionActions.children] as HTMLButtonElement[];buttons[1].focus();const before=unchanged(f.r);
 for(const locale of ['ja','es','zh-CN','en']){f.select(locale);assert.equal(unchanged(f.r),before);assert.equal(f.ui.interactionTitle.textContent,'Maker');assert.deepEqual([...f.ui.interactionActions.children],buttons);assert.equal(f.document.activeElement,buttons[1]);assert.equal(buttons[0].textContent,f.i18n.t('interaction.work'));}buttons[0].click();assert.equal(f.counts().actions,1);f.close();
});
test('offline label and existing parcel translate without health request or authoritative rename',()=>{
 const f=fixture(),parcel={id:'parcel',kind:'dropped_item',pickupable:true,name:'old English label',item:'bread',resourceAmount:3,capabilities:['pickup'],tags:[]};f.r.objects.set('parcel',{state:parcel});f.r.hoverEntity={type:'object',id:'parcel'};f.r.openInteractionMenu({state:parcel},['pickup']);f.ui.decision.dataset.i18n='backend.offline';
 const original=JSON.stringify(parcel);for(const locale of ['ja','es','zh-CN','en']){f.select(locale);assert.equal(f.ui.decision.textContent,f.i18n.t('backend.offline'));assert.ok(f.ui.prompt.textContent.includes(f.r.parcelLabel('bread',3)));assert.equal(f.ui.interactionTitle.textContent,f.r.parcelLabel('bread',3));assert.equal(JSON.stringify(parcel),original);}assert.equal(f.counts().health,0);assert.equal(f.requests.length,0);f.close();
});
for(const kind of ['playerTalk','npcTalkPlayerAuto','npcConversation','importDialogue'])test(`${kind}: pending request retains original locale and result ownership`,async()=>{
 const f=fixture(),a={state:{id:'a',name:'A',position:{x:0,z:0},social:10,relationships:{},role:'farmer',mood:'calm'}},b={state:{id:'b',name:'B',social:10,relationships:{}}};f.r.npcs.set('a',a);f.r.npcs.set('b',b);f.document.querySelector<HTMLTextAreaElement>('#importText')!.value='unsent lines';
 const call=()=>kind==='npcConversation'?f.r.npcConversation(a,b,'greet'):kind==='importDialogue'?f.r.importDialogue():f.r[kind](a,'greet');
 const pending=call();assert.equal(f.requests.length,1);assert.equal(f.requests[0].body.locale,'en');const epoch=f.r.perceptionEpoch;
 f.select('ja');assert.equal(f.requests.length,1);assert.equal(f.r.perceptionEpoch,epoch);assert.equal(f.r.inFlight,2);
 f.requests[0].resolve({ok:true,json:async()=>({text:'old English result',source:'test',relationEffect:'neutral',imported:1,total:3})});await pending;
 if(kind==='importDialogue'){assert.equal(f.counts().health,1);assert.ok(f.ui.toast.textContent.includes('1'));}else {assert.equal((a as any).speech.text,'old English result');assert.equal((a.state as any).lastDialogue,'old English result');}
 const next=call();assert.equal(f.requests[1].body.locale,'ja');f.requests[1].resolve({ok:true,json:async()=>({text:'new Japanese result',source:'test',relationEffect:'neutral',imported:1,total:4})});await next;f.close();
});
test('locale change neither reloads nor clears existing speech and historical alerts',()=>{
 const f=fixture(),speech={text:'Original utterance',until:7777},npc={state:{id:'a'},speech};f.r.npcs.set('a',npc);const logs=f.r.logs,events=f.r.recentEvents;
 for(let n=0;n<12;n++)f.select(SUPPORTED_LOCALES[n%4].code);assert.equal(npc.speech,speech);assert.equal(speech.until,7777);assert.equal(f.r.logs,logs);assert.equal(f.r.recentEvents,events);
 assert.doesNotMatch(methods.get('changeLocale')!,/reload|new Runtime|open.*Interaction|fetch\(|perceptionEpoch\s*\+|innerHTML/);assert.match(methods.get('bindInput')!,/localeSelect\.addEventListener\('change',\(\)=>this\.changeLocale/);f.close();
});

for(const mode of ['firstPerson','god'])test(`${mode}: current object and animal prompt translates without reselection`,()=>{
 const f=fixture();f.r.cameraMode=mode;const animal={state:{id:'sheep',species:'sheep'}};f.r.wildlife.set('sheep',animal);const hover={type:'wildlife',id:'sheep'};f.r.hoverEntity=hover;
 for(const {code:locale} of SUPPORTED_LOCALES){f.select(locale);assert.equal(f.r.hoverEntity,hover);assert.ok(f.ui.prompt.textContent.includes(f.i18n.t('wildlife.sheep')));assert.equal(f.ui.prompt.textContent,f.i18n.t(mode==='god'?'prompt.god':'prompt.domesticated',{name:f.i18n.t('wildlife.sheep')}));}f.close();
});
test('object details use the current parcel display label without renaming saved state',()=>{
 const f=fixture(),state={id:'parcel',name:'old label',kind:'dropped_item',pickupable:true,item:'bread',resourceAmount:3,capabilities:['inspect','pickup'],position:{x:1,z:2},tags:['dropped']};f.r.objects.set('parcel',{state});f.r.escape=(s:string)=>s;
 const branch=methods.get('updateLocalizedUi')!.split("} else if(entity?.type==='object'){",2)[1].split('} else ui.npc.classList',1)[0];
 const render=new Function('ui','entity',transpile(`return function(){${branch}}`))(f.ui,{id:'parcel'});const before=JSON.stringify(state);
 for(const {code:locale} of SUPPORTED_LOCALES){f.select(locale);render.call(f.r);assert.ok(f.ui.npc.textContent.includes(f.r.parcelLabel('bread',3)));assert.ok(f.ui.npc.textContent.includes(f.i18n.t('interaction.pickup')));assert.equal(JSON.stringify(state),before);}f.close();
});

for(const mode of ['firstPerson','god'])test(`${mode}: full updateUi and evolution renderer chain refreshes without world/permission changes`,()=>{
 const f=fixture('en',true);f.r.cameraMode=mode;f.r.updateUi();const chunks=[...f.r.coarseWorld.chunks.values()];const freeze=(v:any)=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);Object.values(v).forEach(freeze);}};chunks.forEach(freeze);const worldBefore=JSON.stringify(chunks);const before=unchanged(f.r),world=f.r.coarseWorld,inventory=f.r.playerInventory,canvas=f.canvas;
 for(const {code:locale} of SUPPORTED_LOCALES){f.select(locale);assert.equal(unchanged(f.r),before);assert.equal(f.r.coarseWorld,world);assert.equal(JSON.stringify([...world.chunks.values()]),worldBefore);assert.equal(f.r.playerInventory,inventory);assert.equal(f.document.querySelector('canvas'),canvas);assert.equal(f.ui.world.dataset.cameraMode,mode);assert.equal(f.ui.world.dataset.playerBodyPresent,String(mode==='firstPerson'));assert.ok(f.ui.clock.textContent.includes(f.i18n.t('weather.clear')));if(mode==='god'){assert.ok(f.ui.evolution.textContent.includes(f.i18n.t('evolution.title')));assert.ok(f.ui.evolution.textContent.includes(f.i18n.t('evolution.empty')));}else assert.ok(f.ui.evolution.classList.contains('hidden'));assert.ok(f.ui.log.textContent.includes('existing warning'));}
 assert.equal(f.requests.length,0);assert.equal(f.counts().health,0);f.close();
});

function editBudget(f:ReturnType<typeof fixture>,value:string){const input=f.document.querySelector<HTMLInputElement>('#budgetCallsMin')!;input.value=value;input.dispatchEvent(new f.w.Event('input',{bubbles:true}));return input;}
function healthReply(value:number){return {json:async()=>({decision:{active:'fallback',status:{budget:{config:{maxCallsPerMinute:value}}}}})};}
function applyReply(value:number,ok=true){return {ok,json:async()=>({config:{maxCallsPerMinute:value},error:ok?undefined:'rejected'})};}
test('older health response cannot overwrite a budget draft after locale moves focus',async()=>{
 const f=fixture('en',false,true),pending=f.r.refreshHealth(),input=editBudget(f,'999');f.ui.localeSelect.focus();f.select('ja');f.requests[0].resolve(healthReply(60));await pending;assert.equal(input.value,'999');assert.notEqual(f.r.budgetInputVersion,f.r.budgetSavedVersion);f.close();
});
test('apply reply preserves newer edit and does not clear its dirty version',async()=>{
 const f=fixture('en',false,true),input=editBudget(f,'111'),pending=f.r.applyBudgetFromUi();assert.equal(f.requests[0].body.maxCallsPerMinute,111);editBudget(f,'222');f.select('ja');f.requests[0].resolve(applyReply(111));await pending;assert.equal(input.value,'222');assert.notEqual(f.r.budgetInputVersion,f.r.budgetSavedVersion);f.close();
});
test('failed apply leaves the pending draft protected from health replies',async()=>{
 const f=fixture('en',false,true),input=editBudget(f,'999'),pending=f.r.applyBudgetFromUi();f.requests[0].resolve(applyReply(60,false));await pending;const health=f.r.refreshHealth();f.select('es');f.requests[1].resolve(healthReply(60));await health;assert.equal(input.value,'999');assert.notEqual(f.r.budgetInputVersion,f.r.budgetSavedVersion);f.close();
});
test('pre-apply health cannot roll a newly acknowledged budget back',async()=>{
 const f=fixture('en',false,true),input=editBudget(f,'999'),health=f.r.refreshHealth(),apply=f.r.applyBudgetFromUi();f.requests[1].resolve(applyReply(999));await apply;assert.equal(f.r.budgetInputVersion,f.r.budgetSavedVersion);f.select('ja');f.requests[0].resolve(healthReply(60));await health;assert.equal(input.value,'999');f.close();
});
test('older apply response cannot displace a newer acknowledged request',async()=>{
 const f=fixture('en',false,true),input=editBudget(f,'111'),first=f.r.applyBudgetFromUi();editBudget(f,'222');const second=f.r.applyBudgetFromUi();f.requests[1].resolve(applyReply(222));await second;f.select('ja');f.requests[0].resolve(applyReply(111));await first;assert.equal(input.value,'222');assert.equal(f.r.budgetInputVersion,f.r.budgetSavedVersion);f.close();
});
test('initial health sync and explicit apply still update untouched budget controls',async()=>{
 const f=fixture('en',false,true),health=f.r.refreshHealth();f.requests[0].resolve(healthReply(60));await health;const input=f.document.querySelector<HTMLInputElement>('#budgetCallsMin')!;assert.equal(input.value,'60');editBudget(f,'111');const apply=f.r.applyBudgetFromUi();f.requests[1].resolve(applyReply(100));await apply;assert.equal(input.value,'100');assert.equal(f.r.budgetInputVersion,f.r.budgetSavedVersion);f.close();
});

test('superseded failed apply cannot replace the newer success feedback',async()=>{
 const f=fixture('en',false,true);editBudget(f,'111');const first=f.r.applyBudgetFromUi();editBudget(f,'222');const second=f.r.applyBudgetFromUi();f.requests[1].resolve(applyReply(222));await second;const feedback=f.ui.toast.textContent;f.select('ja');f.requests[0].resolve(applyReply(111,false));await first;assert.equal(f.ui.toast.textContent,feedback);f.close();
});
test('explicit preset protects its pending values from pre-preset health',async()=>{
 const f=fixture('en',false,true),health=f.r.refreshHealth();f.r.applyBudgetPreset('economy');const input=f.document.querySelector<HTMLInputElement>('#budgetCallsMin')!,expected=input.value;assert.ok(f.r.budgetInputVersion>f.r.budgetSavedVersion);f.select('es');f.requests[0].resolve(healthReply(60));await health;assert.equal(input.value,expected);f.requests[1].resolve(applyReply(Number(expected)));await new Promise(resolve=>setImmediate(resolve));assert.equal(input.value,expected);assert.equal(f.r.budgetInputVersion,f.r.budgetSavedVersion);f.close();
});
