import { test,expect,type Page,type APIRequestContext } from '@playwright/test';
import type { WorldPersistenceSnapshot } from '../src/types.js';
import type { StaticCollider,PhysicsTrigger } from '../src/world/finePhysics.js';
import { startFirstPerson } from './helpers/native-start.js';
import { lookForObject } from './helpers/relative-look.js';

interface TreeView {id:string;height:number;position:{x:number;z:number};collider:StaticCollider;trigger:PhysicsTrigger;}
interface SoleView {id:string;animation:string;vertices:number;ground:number;sole:number;position:{x:number;z:number};}
const status=(page:Page)=>page.locator('#worldStatus');
const trees=async(page:Page):Promise<TreeView[]>=>JSON.parse(await status(page).getAttribute('data-tree-presentation')??'[]');
const soles=async(page:Page):Promise<SoleView[]>=>JSON.parse(await status(page).getAttribute('data-character-soles')??'[]');
async function player(page:Page){return status(page).evaluate(el=>({x:Number((el as HTMLElement).dataset.playerX),z:Number((el as HTMLElement).dataset.playerZ)}));}
async function saved(request:APIRequestContext){const r=await request.get('/api/world/state');expect(r.ok()).toBe(true);return r.json() as Promise<{revision:number;snapshot:WorldPersistenceSnapshot}>;}
async function seed(request:APIRequestContext,position:{x:number;z:number}){
  const r=await request.delete('/api/world/state');expect(r.ok()).toBe(true);const {revision}=await r.json();
  const snapshot:WorldPersistenceSnapshot={version:1,meta:{day:1,minuteOfDay:495,weather:'clear',playerPosition:position,
    playerInventory:{apple:0,bread:0,wood:0,coin:10,flower:0,grain:0,flour:0,water:0,stone:0,plank:0,tool:0}},
    coarseChunks:[],fineChunks:[],homeNpcs:[],homeObjects:[]};
  const written=await request.post('/api/world/state',{data:{expectedRevision:revision,snapshot}});expect(written.ok()).toBe(true);
  return (await written.json()).revision as number;
}
async function pauseWithUi(page:Page){
  await page.locator('#startBtn').waitFor();
  await page.keyboard.press('Tab');
  const pause=page.locator('#pauseBtn');await expect(pause).toBeVisible();
  await pause.press('Enter');await expect(pause).toContainText('Resume');
  await page.keyboard.press('Tab');
}

test.afterEach(async({page,request})=>{await page.close();const r=await request.delete('/api/world/state');expect(r.ok()).toBe(true);});

test('adult sourced tree has reachable trunk contact, visible approach and conserved chop after reload',async({page,request},info)=>{
  test.setTimeout(240_000);
  const revision=await seed(request,{x:14,z:4.8});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  try {
    await page.addInitScript(()=>localStorage.setItem('latticefolk.locale','en'));
    await page.goto('/',{waitUntil:'domcontentloaded'});
    // Ordinary console pause isolates the resource action, without removing any NPC/body.
    await pauseWithUi(page);
    await expect.poll(async()=>(await trees(page)).some(t=>t.id==='tree_apple_2'&&!!t.collider),{timeout:45_000}).toBe(true);
    await expect(status(page)).toHaveAttribute('data-asset-failures','0');
    const tree=(await trees(page)).find(t=>t.id==='tree_apple_2')!;
    expect(tree.height).toBeCloseTo(8.4,4);expect(tree.position).toEqual({x:14,z:1.5});
    await startFirstPerson(page);
    await info.attach('tree-adult-approach',{body:await page.screenshot(),contentType:'image/png'});
    const before=await player(page);
    try{
      await page.keyboard.down('KeyW');
      await expect.poll(async()=>(await player(page)).z,{timeout:20_000,intervals:[120]}).toBeLessThan(tree.collider.maxZ+.43);
      await page.waitForTimeout(450);
    }finally{await page.keyboard.up('KeyW');}
    const contact=await player(page);
    expect(contact.x).toBeCloseTo(14,1);expect(before.z-contact.z).toBeGreaterThan(1.5);
    expect(contact.z).toBeGreaterThanOrEqual(tree.collider.maxZ+.3-.015);
    expect(contact.z).toBeLessThan(2.65);
    await lookForObject(page,'苹果树',0,.35);
    await info.attach('tree-trunk-contact-closeup',{body:await page.screenshot(),contentType:'image/png'});
    await page.keyboard.press('KeyE');await expect(page.locator('#interactionTitle')).toContainText('苹果树');
    await page.locator('#interactionActions button').nth(2).press('Enter');
    await expect(page.locator('#toast')).toContainText('木料 ×2');
    await expect.poll(async()=>{const s=await saved(request);return s.revision>revision&&s.snapshot?.meta.playerInventory.wood===2;},{timeout:45_000}).toBe(true);
    const accepted=await saved(request);const object=accepted.snapshot.homeObjects?.find(o=>o.id===tree.id);
    expect(object?.position).toEqual(tree.position);expect(object?.kind).toBe('tree');
    expect(object?.resourceAmount).toBe(3); // The normal first chop consumes one of the default four units.
    await info.attach('tree-contact-and-accepted-save',{body:Buffer.from(JSON.stringify({before,contact,tree,revision:accepted.revision,object,inventory:accepted.snapshot.meta.playerInventory},null,2)),contentType:'application/json'});
    await page.reload();
    await expect.poll(async()=>Number(await status(page).getAttribute('data-persistence-revision'))).toBeGreaterThanOrEqual(accepted.revision);
    await expect.poll(async()=>(await trees(page)).some(t=>t.id===tree.id&&!!t.collider),{timeout:45_000}).toBe(true);
    const reloaded=(await trees(page)).find(t=>t.id===tree.id)!;
    expect(reloaded.collider).toEqual(tree.collider);expect(reloaded.trigger).toEqual(tree.trigger);
    const restored=await saved(request);
    expect(restored.snapshot.meta.playerInventory.wood).toBe(2);
    expect(restored.snapshot.homeObjects?.find(o=>o.id===tree.id)?.resourceAmount).toBe(3);
    await startFirstPerson(page);await lookForObject(page,'苹果树',0,.35);
    await info.attach('tree-reloaded-trunk',{body:await page.screenshot(),contentType:'image/png'});
    expect(errors).toEqual([]);
  }catch(error){
    await info.attach('tree-failure-state',{body:Buffer.from(JSON.stringify({player:await player(page),trees:await trees(page),errors,prompt:await page.locator('#prompt').innerText()},null,2)),contentType:'application/json'});
    await info.attach('tree-failure-before-teardown',{body:await page.screenshot(),contentType:'image/png'});throw error;
  }finally{await page.keyboard.up('KeyW');}
});

test('rendered NPC soles remain supported through ordinary idle and moving simulation poses',async({page,request},info)=>{
  test.setTimeout(180_000);
  await seed(request,{x:-9,z:-7.5});
  await page.addInitScript(()=>localStorage.setItem('latticefolk.locale','en'));
  await page.goto('/',{waitUntil:'domcontentloaded'});await pauseWithUi(page);
  await expect.poll(async()=>(await soles(page)).length,{timeout:45_000}).toBeGreaterThanOrEqual(10);
  await startFirstPerson(page);
  // Decision pause does not freeze paths/animations. Track the nearest source actor
  // through ordinary relative-look input rather than photographing an empty fixed view.
  const canvas=page.locator('#game canvas');
  let heading=0;
  const frameActor=async()=>{
    const origin=await player(page);
    const actors=await soles(page);
    const actor=actors.sort((a,b)=>Math.hypot(a.position.x-origin.x,a.position.z-origin.z)-Math.hypot(b.position.x-origin.x,b.position.z-origin.z))[0];
    expect(actor).toBeTruthy();
    const dx=actor.position.x-origin.x,dz=actor.position.z-origin.z;
    const distance=Math.hypot(dx,dz);
    expect(distance).toBeLessThan(12);
    const nextHeading=Math.atan2(dx,-dz);
    const turn=Math.atan2(Math.sin(nextHeading-heading),Math.cos(nextHeading-heading));
    await canvas.dispatchEvent('mousemove',{movementX:turn/.002,movementY:0});heading=nextHeading;
    const pitch=Math.atan2(1.7-.9,distance);
    await canvas.dispatchEvent('mousemove',{movementX:0,movementY:2000});
    await canvas.dispatchEvent('mousemove',{movementX:0,movementY:(pitch-Math.PI/2)/.002});
    await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));
    return {actor,origin,heading,pitch};
  };
  const pausedFraming=await frameActor();
  await info.attach('npc-decision-paused-support-context',{body:await page.screenshot(),contentType:'image/png'});
  const decisionPaused=await soles(page);
  for(const actor of decisionPaused){expect(actor.vertices).toBeGreaterThan(0);expect(Math.abs(actor.sole-actor.ground)).toBeLessThan(.001);}
  await page.keyboard.press('Tab');await page.locator('#pauseBtn').press('Enter');await page.keyboard.press('Tab');
  await expect.poll(async()=>(await soles(page)).some(a=>a.animation==='Walk'||a.animation==='Run'),{timeout:30_000}).toBe(true);
  const frames=await page.evaluate(async()=>{
    const samples:unknown[]=[];
    for(let frame=0;frame<48;frame++){
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
      if(frame%4===0)samples.push(JSON.parse(document.querySelector<HTMLElement>('#worldStatus')!.dataset.characterSoles!));
    }
    return samples as SoleView[][];
  });
  expect(frames.flat().some(a=>a.animation==='Walk'||a.animation==='Run')).toBe(true);
  for(const actor of frames.flat())expect(Math.abs(actor.sole-actor.ground)).toBeLessThan(.001);
  const movingFraming=await frameActor();
  await info.attach('npc-current-skin-support-samples',{body:Buffer.from(JSON.stringify({decisionPaused,frames,pausedFraming,movingFraming},null,2)),contentType:'application/json'});
  await info.attach('npc-moving-pose-context',{body:await page.screenshot(),contentType:'image/png'});
});
