import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';
import {expect} from '@playwright/test';
import {readOvenInspection,readOvenMenu} from '../e2e/helpers/oven-observation.js';
const {JSDOM}=createRequire(import.meta.url)('jsdom');
function fixture(){
 const w=new JSDOM('<div id="worldStatus" data-player-x="-10" data-player-z="-9.8" data-asset-failures="0" data-persistence-conflict="false"></div><b id="interactionTitle">面包炉</b><div id="interactionActions"><button>Inspect</button><button>Work</button><button>Craft</button></div>').window;
 const document=w.document as Document,status=document.querySelector<HTMLElement>('#worldStatus')!;
 const oven={id:'oven',asset:'bakingOvenAsset',resolved:true,meshes:3,primitives:0,collider:{id:'object:oven',maxZ:-12.19},trigger:{maxZ:-11.69}};
 status.dataset.bakingOvens=JSON.stringify([oven]);
 const read=new Function('document',`return (${readOvenInspection.toString()})`)(document) as typeof readOvenInspection;
 const menu=new Function('document',`return (${readOvenMenu.toString()})`)(document) as typeof readOvenMenu;
 return {w,document,status,oven,read,menu,close:()=>w.close()};
}
test('inspection snapshot equals all four former DOM reads without mutation',()=>{
 const f=fixture(),before=f.document.documentElement.outerHTML;
 const original={assetFailures:f.status.getAttribute('data-asset-failures'),persistenceConflict:f.status.getAttribute('data-persistence-conflict'),ovens:JSON.parse(f.status.getAttribute('data-baking-ovens')!),position:{x:Number(f.status.dataset.playerX),z:Number(f.status.dataset.playerZ)}};
 assert.deepEqual(f.read(),original);assert.equal(f.document.documentElement.outerHTML,before);f.close();
});
test('inspection snapshot retains zero coordinates and raw oven diagnostics',()=>{
 const f=fixture();f.status.dataset.playerX='0';f.status.dataset.playerZ='0';f.oven.resolved=false;f.oven.primitives=2;f.status.dataset.bakingOvens=JSON.stringify([f.oven]);
 const sample=f.read();assert.deepEqual(sample.position,{x:0,z:0});assert.deepEqual(sample.ovens,[f.oven]);f.close();
});
test('missing or nonfinite position and malformed diagnostics cannot become valid samples',()=>{
 const f=fixture();delete f.status.dataset.playerX;assert.throws(f.read,/missing/);f.status.dataset.playerX=' ';assert.throws(f.read,/missing/);
 f.status.dataset.playerX='NaN';assert.throws(f.read,/not finite/);f.status.dataset.playerX='Infinity';assert.throws(f.read,/not finite/);
 f.status.dataset.playerX='-10';f.status.dataset.bakingOvens='{bad';assert.throws(f.read);delete f.status.dataset.bakingOvens;assert.deepEqual(f.read().ovens,[]);f.close();
});
test('one coherent flag poll waits for both flags and returns the same accepted oven/position sample',async()=>{
 const f=fixture();f.status.dataset.assetFailures='1';f.status.dataset.persistenceConflict='true';let calls=0,sample:ReturnType<typeof readOvenInspection>;
 await expect.poll(()=>{calls++;sample=f.read();if(calls===1)f.status.dataset.assetFailures='0';if(calls===2){f.status.dataset.persistenceConflict='false';f.status.dataset.playerZ='-8';}return sample;},{timeout:2000,intervals:[1]}).toMatchObject({assetFailures:'0',persistenceConflict:'false'});
 assert.equal(calls,3);assert.deepEqual(sample!.position,{x:-10,z:-8});assert.deepEqual(sample!.ovens,[f.oven]);f.close();
});
for(const field of ['assetFailures','persistenceConflict'] as const)test(`persistent ${field} defect still fails the combined expectation`,async()=>{
 const f=fixture();f.status.dataset[field]=field==='assetFailures'?'1':'true';
 await assert.rejects(()=>expect.poll(f.read,{timeout:50,intervals:[5]}).toMatchObject({assetFailures:'0',persistenceConflict:'false'}));f.close();
});
test('menu snapshot equals normalized title and action count, with no stale fallback',()=>{
 const f=fixture();f.document.querySelector('#interactionTitle')!.textContent=' \n \u200b面包\u00ad炉 \t ';
 const before=f.document.documentElement.outerHTML;assert.deepEqual(f.menu(),{title:'面包炉',actions:3});assert.equal(f.document.documentElement.outerHTML,before);
 f.document.querySelector('#interactionTitle')!.textContent='Another target';assert.equal(f.menu().title,'Another target');f.document.querySelector('button')!.remove();assert.equal(f.menu().actions,2);
 f.document.querySelector('#interactionActions')!.remove();assert.equal(f.menu().actions,0);f.document.querySelector('#interactionTitle')!.remove();assert.throws(f.menu,/exactly one/);f.close();
});
for(const defect of ['title','actions'])test(`incorrect menu ${defect} still fails instead of executing an action`,async()=>{
 const f=fixture();if(defect==='title')f.document.querySelector('#interactionTitle')!.textContent='Wrong target';else f.document.querySelector('button')!.remove();
 let clicks=0;f.document.addEventListener('click',()=>clicks++);
 await assert.rejects(()=>expect.poll(f.menu,{timeout:50,intervals:[5]}).toEqual({title:'面包炉',actions:3}));assert.equal(clicks,0);f.close();
});


test('duplicate status or title remains invalid instead of selecting the first match',()=>{
 const f=fixture(),duplicate=f.status.cloneNode(true);f.document.body.append(duplicate);assert.throws(f.read,/exactly one/);f.document.body.removeChild(duplicate);
 const title=f.document.querySelector('#interactionTitle')!;f.document.body.append(title.cloneNode(true));assert.throws(f.menu,/exactly one/);
 f.status.remove();assert.throws(f.read,/exactly one/);f.close();
});
