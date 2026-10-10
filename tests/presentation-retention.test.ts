import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import ts from 'typescript';
import {I18n} from '../src/i18n.js';
import {visibleHudLogs} from '../src/ui/hudDiagnostics.js';
import {wildlifeSpeciesProfile} from '../src/world/wildlifeSpecies.js';
import {normalizeWildlifeDomestication} from '../src/world/domestication.js';
import {wildlifeFunctionalPhenotype} from '../src/world/wildlifePhenotype.js';
import {wildlifeOrganismLocomotion} from '../src/world/organismFamilies.js';
import {droppedParcelLabel} from '../src/scene/droppedParcel.js';
import {droppedItemCount} from '../src/world/portableObjects.js';
const {JSDOM}=createRequire(import.meta.url)('jsdom');
const source=fs.readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true),methods=new Map<string,string>();
function visit(n:ts.Node){if(ts.isMethodDeclaration(n))methods.set(n.name.getText(ast),n.getText(ast));ts.forEachChild(n,visit);}visit(ast);
const names=['updateLocalizedUi','escape','objectDisplayName','interactionLabel','itemName','parcelLabel','gameTimeText','worldSeason','wildlifeName'];
const compiled=ts.transpileModule(`(class Presentation {${names.map(name=>methods.get(name)).join('\n')}})`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;

function fixture(){
 const dom=new JSDOM('<div id="clock"></div><div id="inv"></div><div id="npc" class="hidden"></div><div id="log"></div><div id="admin" class="hidden"></div><div id="evolution"></div><input id="draft"><div id="menu"><button>Existing action</button></div>',{pretendToBeVisual:true});
 const w=dom.window,document=w.document;
 const ui=Object.fromEntries(['clock','inv','npc','log','admin','evolution'].map(key=>[key,document.getElementById(key)]));
 const i18n=new I18n('en');
 const C=vm.runInNewContext(compiled,{ui,i18n,visibleHudLogs,wildlifeSpeciesProfile,normalizeWildlifeDomestication,wildlifeFunctionalPhenotype,wildlifeOrganismLocomotion,droppedParcelLabel,droppedItemCount});
 const r=new C();const evolutionObservations:string[]=[];
 const oven={id:'oven',kind:'workstation',name:'Oven <safe>',position:{x:-10,z:-13},tags:['work','baker','bread'],capabilities:['inspect','work','craft']};
 const npc={id:'ren',name:'Ren',role:'baker',mood:'happy',hunger:30,energy:80,social:65,money:10,currentAction:'work',goal:'Bake <bread>',inventory:[{kind:'flour',count:2}],memories:[{summary:'Existing memory'}]};
 const wildlife={id:'animal',chunkId:'chunk_0_0',species:'rabbit',position:{x:1,z:2},sex:'female',generation:1,health:88,hunger:15,thirst:16,energy:84,currentAction:'rest',ageDays:3,diseaseLoad:0,traits:{speed:1,size:1,fertility:.4,wariness:.5}};
 Object.assign(r,{day:1,minuteOfDay:508,weather:'clear',cameraMode:'firstPerson',hoverEntity:{type:'object',id:'oven'},selectedEntity:undefined,
  objects:new Map([['oven',{state:oven}]]),npcs:new Map([['ren',{state:npc}]]),wildlife:new Map([['animal',{state:wildlife}]]),wildlifeLineage:new Map(),coarseWorld:{chunks:new Map()},
  playerInventory:{apple:0,bread:2,wood:0,grain:0,flour:1,water:0,plank:0,stone:0,tool:0,coin:10},
  logs:[{text:'existing player feedback',audience:'player'},{text:'existing developer feedback',audience:'developer'}],
  renderEvolutionPanel(){evolutionObservations.push(ui.npc.textContent);}});
 const render=()=>r.updateLocalizedUi();const close=()=>w.close();return {w,document,ui,i18n,r,oven,npc,wildlife,render,close,evolutionObservations};
}

test('unchanged detail and log subtrees preserve listeners, focus, selection and scroll',()=>{
 const f=fixture();f.render();const details=f.ui.npc.querySelector('b')!,row=f.ui.log.firstChild!;
 details.tabIndex=0;details.focus();f.ui.npc.scrollTop=27;f.ui.log.scrollTop=41;
 let clicks=0;details.addEventListener('click',()=>clicks++);
 const range=f.document.createRange();range.selectNodeContents(details);const selection=f.w.getSelection()!;selection.removeAllRanges();selection.addRange(range);
 const selectedNode=selection.anchorNode;
 const observer=new f.w.MutationObserver(()=>{});observer.observe(f.ui.npc,{subtree:true,childList:true});observer.observe(f.ui.log,{subtree:true,childList:true});
 for(let i=0;i<100;i++)f.render();
 assert.equal(f.ui.npc.querySelector('b'),details);assert.equal(f.ui.log.firstChild,row);
 assert.equal(f.document.activeElement,details);assert.equal(selection.anchorNode,selectedNode);
 assert.equal(f.ui.npc.scrollTop,27);assert.equal(f.ui.log.scrollTop,41);
 details.dispatchEvent(new f.w.MouseEvent('click'));assert.equal(clicks,1);assert.equal(observer.takeRecords().length,0);
 observer.disconnect();f.close();
});

test('changed details are visible immediately and before evolution rendering',()=>{
 const f=fixture();f.render();const old=f.ui.npc.firstChild;
 f.oven.name='New <oven>';f.oven.position.x=2.5;f.oven.capabilities=['inspect','craft'];f.render();
 assert.notEqual(f.ui.npc.firstChild,old);assert.ok(f.ui.npc.textContent.includes('New <oven>'));
 assert.ok(f.ui.npc.textContent.includes('2.5'));assert.ok(!f.ui.npc.innerHTML.includes('<oven>'));
 assert.equal(f.evolutionObservations.at(-1),f.ui.npc.textContent);f.close();
});

test('four locales update action text and returning to a locale is never stale',()=>{
 const f=fixture();const text=[];
 for(const locale of ['en','ja','es','zh-CN','en']){f.i18n.setLocale(locale);f.render();text.push(f.ui.npc.textContent);assert.ok(f.ui.npc.textContent.includes(f.i18n.t('interaction.work')));}
 assert.equal(text[0],text[4]);assert.notEqual(text[0],text[1]);f.close();
});

test('NPC, wildlife, object, missing target and re-show transitions retain current output',()=>{
 const f=fixture();
 f.r.hoverEntity={type:'npc',id:'ren'};f.render();assert.ok(f.ui.npc.textContent.includes('Ren'));
 f.npc.money=13;f.npc.goal='A new goal';f.npc.memories.push({summary:'New memory'});f.render();assert.ok(f.ui.npc.textContent.includes('A new goal'));assert.ok(f.ui.npc.textContent.includes('New memory'));
 f.r.hoverEntity={type:'wildlife',id:'animal'};f.render();assert.ok(f.ui.npc.textContent.includes(f.i18n.t('wildlife.health')));
 f.wildlife.health=42;f.render();assert.ok(f.ui.npc.textContent.includes('42'));
 f.r.hoverEntity={type:'wildlife',id:'missing'};f.render();assert.ok(f.ui.npc.classList.contains('hidden'));
 f.r.hoverEntity={type:'object',id:'oven'};f.render();assert.ok(!f.ui.npc.classList.contains('hidden'));const details=f.ui.npc.firstChild;
 f.r.hoverEntity=undefined;f.render();assert.ok(f.ui.npc.classList.contains('hidden'));
 f.r.hoverEntity={type:'object',id:'oven'};f.render();assert.equal(f.ui.npc.firstChild,details);assert.ok(!f.ui.npc.classList.contains('hidden'));f.close();
});

test('God View selected target precedence and log audience remain immediate',()=>{
 const f=fixture();f.r.cameraMode='god';f.r.selectedEntity={type:'npc',id:'ren'};f.render();
 assert.ok(f.ui.npc.textContent.includes('Ren'));assert.ok(f.ui.log.textContent.includes('developer'));
 f.r.cameraMode='firstPerson';f.render();assert.ok(f.ui.npc.textContent.includes('Oven'));assert.ok(!f.ui.log.textContent.includes('developer'));
 f.ui.admin.classList.remove('hidden');f.render();assert.ok(f.ui.log.textContent.includes('developer'));
 f.ui.admin.classList.add('hidden');f.render();assert.ok(!f.ui.log.textContent.includes('developer'));f.close();
});

test('log edits, clearing and seven-row window are never cached by array identity',()=>{
 const f=fixture();f.render();f.r.logs[0].text='changed in place <safe>';f.render();assert.equal(f.ui.log.textContent,'changed in place <safe>');
 for(let i=0;i<10;i++)f.r.logs.push({text:'message '+i,audience:'player'});f.render();assert.equal(f.ui.log.children.length,7);assert.ok(!f.ui.log.textContent.includes('message 2'));assert.ok(f.ui.log.textContent.includes('message 9'));
 f.r.logs.length=0;f.render();assert.equal(f.ui.log.innerHTML,'');assert.ok(f.ui.log.classList.contains('hidden'));
 f.r.logs.push({text:'new feedback',audience:'player'});f.render();assert.equal(f.ui.log.textContent,'new feedback');assert.ok(!f.ui.log.classList.contains('hidden'));f.close();
});

test('unrelated input focus/value, existing menu nodes and handlers survive changed details',()=>{
 const f=fixture(),draft=f.document.querySelector('#draft')!,button=f.document.querySelector('#menu button')!;
 draft.value='unsent input';draft.focus();draft.setSelectionRange(2,5);let clicks=0;button.addEventListener('click',()=>clicks++);
 for(const name of ['one','two','three']){f.oven.name=name;f.render();}
 assert.equal(f.document.activeElement,draft);assert.equal(draft.value,'unsent input');assert.equal(draft.selectionStart,2);assert.equal(draft.selectionEnd,5);
 assert.equal(f.document.querySelector('#menu button'),button);button.click();assert.equal(clicks,1);f.close();
});

test('authoritative object/NPC/wildlife/inventory state is not used as a cache store',()=>{
 const f=fixture();const data=()=>JSON.stringify({oven:f.oven,npc:f.npc,wildlife:f.wildlife,inventory:f.r.playerInventory,logs:f.r.logs});const before=data();
 for(const target of [{type:'object',id:'oven'},{type:'npc',id:'ren'},{type:'wildlife',id:'animal'}]){f.r.hoverEntity=target;f.render();f.render();}
 assert.equal(data(),before);assert.equal(Object.hasOwn(f.oven,'lastNpcDetailsHtml'),false);f.close();
});
