import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';
import {expect} from '@playwright/test';
import {captureLocaleDom,readLocaleDom} from '../e2e/helpers/locale-dom.js';
const {JSDOM}=createRequire(import.meta.url)('jsdom');
function fixture(){
 const w=new JSDOM('<html lang="ja"><div id="game"><canvas></canvas></div><div id="worldStatus" data-player-x="5.2" data-player-z="4" data-camera-mode="firstPerson" data-player-body-present="true" data-discovered-chunks="72" data-materialized-chunks="0"></div><span id="modeHint">観察者</span><div id="interactionMenu" class="panel interaction-menu"><div id="interactionActions"><button>調べる</button><button>働く</button><button>製作</button></div></div></html>').window;
 const document=w.document as Document;
 // Run the exact serializable callbacks against a real DOM, not copied selectors.
 const capture=new Function('document',`return (${captureLocaleDom.toString()});`)(document) as typeof captureLocaleDom;
 const read=new Function('document',`return (${readLocaleDom.toString()});`)(document) as typeof readLocaleDom;
 return {w,document,capture,read,reference:capture(1),status:document.querySelector<HTMLElement>('#worldStatus')!,close:()=>w.close()};
}
test('one read-only sample contains every original language/menu/state condition',()=>{
 const f=fixture(),before=f.document.documentElement.outerHTML;assert.deepEqual(f.read(f.reference),{lang:'ja',modeHint:'観察者',mode:'firstPerson',playerBody:'true',discovered:72,materialized:0,sameCanvas:true,menuOpen:true,sameButtons:true,actionText:'働く',inventory:undefined,details:undefined,title:undefined,focus:'',samePosition:true});assert.equal(f.document.documentElement.outerHTML,before);f.close();
});
test('delayed language and label changes stay observable on each fresh poll',()=>{
 const f=fixture();f.document.documentElement.lang='en';f.document.querySelectorAll('button')[1].textContent='Work';let s=f.read(f.reference);assert.equal(s.lang,'en');assert.equal(s.actionText,'Work');f.document.documentElement.lang='ja';s=f.read(f.reference);assert.equal(s.lang,'ja');assert.equal(s.actionText,'Work','language alone does not manufacture translated text');f.document.querySelectorAll('button')[1].textContent='働く';assert.equal(f.read(f.reference).actionText,'働く');f.close();
});
test('a remounted canvas or menu cannot pass identity checks',()=>{
 const f=fixture();const canvas=f.document.querySelector('canvas')!;canvas.replaceWith(canvas.cloneNode());assert.equal(f.read(f.reference).sameCanvas,false);const button=f.document.querySelectorAll('button')[1];button.replaceWith(button.cloneNode(true));assert.equal(f.read(f.reference).sameButtons,false);f.close();
});
test('menu dismissal, position drift and changed observer authority remain failures',()=>{
 const f=fixture();f.document.querySelector('#interactionMenu')!.classList.add('hidden');f.status.dataset.playerX='5.3';f.status.dataset.cameraMode='god';f.status.dataset.playerBodyPresent='false';const s=f.read(f.reference);assert.equal(s.menuOpen,false);assert.equal(s.samePosition,false);assert.equal(s.mode,'god');assert.equal(s.playerBody,'false');f.close();
});
test('discovery and materialization values are sampled without normalization',()=>{
 const f=fixture();f.status.dataset.discoveredChunks='73';f.status.dataset.materializedChunks='1';let s=f.read(f.reference);assert.equal(s.discovered,73);assert.equal(s.materialized,1);delete f.status.dataset.discoveredChunks;s=f.read(f.reference);assert.ok(Number.isNaN(s.discovered));f.close();
});
test('missing original nodes cannot compare equal by both being absent',()=>{
 const f=fixture();f.document.querySelector('canvas')!.remove();delete f.status.dataset.playerX;const reference=f.capture(1);assert.equal(f.read(reference).sameCanvas,false);assert.equal(f.read(reference).samePosition,false);f.close();
});
test('all original menu button identities must remain, not only the clicked action',()=>{
 const f=fixture();const first=f.document.querySelector('button')!;first.replaceWith(first.cloneNode(true));const s=f.read(f.reference);assert.equal(s.actionText,'働く');assert.equal(s.sameButtons,false);f.close();
});

test('real Playwright compound polling waits until asynchronous fields agree together',async()=>{
 const f=fixture();f.document.documentElement.lang='en';f.document.querySelectorAll('button')[1].textContent='Work';let reads=0;
 await expect.poll(()=>{const sample=f.read(f.reference);reads++;if(reads===1)f.document.documentElement.lang='ja';if(reads===2)f.document.querySelectorAll('button')[1].textContent='働く';return sample;},{timeout:2000,intervals:[1]}).toMatchObject({lang:'ja',actionText:'働く',menuOpen:true,sameCanvas:true,sameButtons:true,samePosition:true});
 assert.ok(reads>=3);f.close();
});
test('real Playwright compound polling still fails a persistently dismissed menu',async()=>{
 const f=fixture();f.document.querySelector('#interactionMenu')!.classList.add('hidden');
 await assert.rejects(async()=>{await expect.poll(()=>f.read(f.reference),{timeout:50,intervals:[5]}).toMatchObject({lang:'ja',actionText:'働く',menuOpen:true});},/menuOpen/);f.close();
});


test('HUD labels, authored title and focus share the current locale sample without masking drift',()=>{
 const f=fixture();
 f.document.body.insertAdjacentHTML('beforeend','<div id="inventory">Inventory 10</div><div id="npcPanel">Position 1, 2 · Tags work · Interactions Work</div><b id="interactionTitle">原始工作台</b><select id="localeSelect"><option>English</option></select>');
 const select=f.document.querySelector<HTMLSelectElement>('#localeSelect')!;select.focus();
 const before=f.document.documentElement.outerHTML;
 const english=f.read(f.reference);
 assert.equal(english.inventory,'Inventory 10');assert.equal(english.details,'Position 1, 2 · Tags work · Interactions Work');assert.equal(english.title,'原始工作台');assert.equal(english.focus,'localeSelect');
 assert.equal(f.document.documentElement.outerHTML,before);assert.equal(f.document.activeElement,select);
 f.document.documentElement.lang='ja';
 const pending=f.read(f.reference);assert.equal(pending.lang,'ja');assert.equal(pending.inventory,'Inventory 10','locale alone cannot manufacture a translated HUD');
 f.document.querySelector('#inventory')!.textContent='所持品 10';f.document.querySelector('#npcPanel')!.textContent='位置 1, 2 · タグ work · 操作 働く';
 const translated=f.read(f.reference);assert.equal(translated.inventory,'所持品 10');assert.equal(translated.details,'位置 1, 2 · タグ work · 操作 働く');assert.equal(translated.title,'原始工作台');assert.equal(translated.focus,'localeSelect');
 f.document.querySelector<HTMLButtonElement>('button')!.focus();assert.notEqual(f.read(f.reference).focus,'localeSelect','sampling does not restore lost focus');
 f.document.querySelector('#interactionTitle')!.textContent='Unexpected rename';assert.equal(f.read(f.reference).title,'Unexpected rename');
 f.document.querySelector('#inventory')!.remove();assert.equal(f.read(f.reference).inventory,undefined,'a missing HUD cannot pass by returning stale data');
 f.close();
});
