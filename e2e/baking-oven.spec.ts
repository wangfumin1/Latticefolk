import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import type { CoarseChunkState, WorldPersistenceSnapshot } from '../src/types.js';
import type { StaticCollider, PhysicsTrigger } from '../src/world/finePhysics.js';
import { planFineChunk } from '../src/world/materialization.js';
import { startFirstPerson } from './helpers/native-start.js';
import { lookForObject } from './helpers/relative-look.js';
import { waitForPlayerZBelow } from './helpers/frame-position.js';

interface OvenEvidence {id:string;asset:string;resolved:boolean;meshes:number;primitives:number;collider:StaticCollider;trigger:PhysicsTrigger}
async function ovens(page:Page):Promise<OvenEvidence[]> {
  return JSON.parse(await page.locator('#worldStatus').getAttribute('data-baking-ovens')??'[]');
}
async function savedWorld(request:APIRequestContext) {
  const response=await request.get('/api/world/state');expect(response.ok()).toBe(true);
  return response.json() as Promise<{revision:number;snapshot:WorldPersistenceSnapshot|null}>;
}
async function position(page:Page) {
  // Both normal callers have already observed ready worldStatus data. A direct
  // read avoids the extra locator/ElementHandle round trip measured in CI.
  return page.evaluate(()=>{
    const data=document.querySelector<HTMLElement>('#worldStatus')?.dataset;
    if(!data||!data.playerX?.trim()||!data.playerZ?.trim())throw new Error('Oven position data is missing');
    const x=Number(data.playerX),z=Number(data.playerZ);
    if(!Number.isFinite(x)||!Number.isFinite(z))throw new Error('Oven position data is not finite');
    return {x,z};
  });
}

const generated:CoarseChunkState={id:'chunk_2_-1',cx:2,cz:-1,biome:'plains',settlementLevel:2,population:23,
  food:68,wood:57,water:71,ecology:73,danger:18,prosperity:66,strategy:'trade_route',migrationPolicy:'attract',ecologyPolicy:'balance',lastDecisionAt:0,decisionVersion:3};
const bakery=planFineChunk(generated,24).objects.find(o=>o.state.id===`${generated.id}_bakery`)!.state;
const cases=[
  {name:'home-oven',id:'oven',title:'面包炉',anchor:{x:-10,z:-13},chunks:[] as CoarseChunkState[]},
  {name:'generated-bakery',id:bakery.id,title:bakery.name,anchor:bakery.position,chunks:[generated]}
];

for(const scenario of cases){
  test(`${scenario.name}: visible oven, physical approach, ingredient-conserving baking and reload`,async({page,request},testInfo)=>{
    test.setTimeout(240_000);
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    const reset=await request.delete('/api/world/state');expect(reset.ok()).toBe(true);
    const resetAck=await reset.json() as {revision:number};
    // Legal pre-boot save fixture, not teleportation during play or a claimed exploration journey.
    const seed:WorldPersistenceSnapshot={version:1,
      meta:{day:1,minuteOfDay:495,weather:'clear',playerPosition:{x:scenario.anchor.x,z:scenario.anchor.z+3.2},
        playerInventory:{apple:0,bread:0,wood:0,coin:10,flower:0,grain:0,flour:2,water:1,stone:0,plank:0,tool:0}},
      coarseChunks:scenario.chunks,fineChunks:[],homeNpcs:[],homeObjects:[]};
    const seeded=await request.post('/api/world/state',{data:{expectedRevision:resetAck.revision,snapshot:seed}});
    expect(seeded.ok()).toBe(true);const seedAck=await seeded.json() as {revision:number};
    try {
      await page.addInitScript(()=>localStorage.setItem('latticefolk.locale','en'));
      await page.goto('/');
      const status=page.locator('#worldStatus');
      await expect(page.locator('#game canvas')).toBeVisible();
      await expect.poll(async()=>(await ovens(page)).some(o=>o.id===scenario.id&&o.resolved&&o.meshes>0&&o.primitives===0&&!!o.collider),{timeout:45_000}).toBe(true);
      await expect(status).toHaveAttribute('data-asset-failures','0');
      await expect(status).toHaveAttribute('data-persistence-conflict','false');
      const oven=(await ovens(page)).find(o=>o.id===scenario.id)!;
      expect(oven.asset).toBe('bakingOvenAsset');expect(oven.collider.id).toBe(`object:${scenario.id}`);
      expect(oven.trigger.maxZ-oven.collider.maxZ).toBeCloseTo(.5,4);
      const before=await position(page);expect(before.x).toBeCloseTo(scenario.anchor.x,3);
      await startFirstPerson(page);
      await testInfo.attach(`${scenario.name}-approach-overview`,{body:await page.screenshot(),contentType:'image/png'});
      // Real forward input must reach the oven's calibrated collision face and must not
      // pass through it. A wrong heading or an obstructing NPC is a failing precondition.
      try {
        await page.keyboard.down('KeyW');
        await waitForPlayerZBelow(page,oven.collider.maxZ+.43,20_000);
        await page.waitForTimeout(450);
      } finally {await page.keyboard.up('KeyW');}
      const contact=await position(page);
      expect(contact.x).toBeCloseTo(before.x,1);
      expect(before.z-contact.z).toBeGreaterThan(1.8);
      expect(contact.z).toBeGreaterThanOrEqual(oven.collider.maxZ+.3-.015);
      expect(contact.z).toBeLessThan(oven.collider.maxZ+.43);
      await lookForObject(page,scenario.title,0,1.15);
      await testInfo.attach(`${scenario.name}-visible-collision-closeup`,{body:await page.screenshot(),contentType:'image/png'});
      await page.keyboard.press('KeyE');
      await expect(page.locator('#interactionTitle')).toHaveText(scenario.title);
      const actions=page.locator('#interactionActions button');await expect(actions).toHaveCount(3);
      await actions.nth(2).press('Enter');
      await expect(page.locator('#toast')).toContainText('制作：烘烤面包');
      await expect.poll(async()=>{
        const saved=await savedWorld(request),inv=saved.snapshot?.meta.playerInventory;
        return saved.revision>seedAck.revision&&inv?.flour===1&&inv.water===0&&inv.bread===2&&inv.coin===10;
      },{timeout:45_000}).toBe(true);
      const accepted=await savedWorld(request);
      const snapshot=accepted.snapshot!;
      const state=scenario.id==='oven'?snapshot.homeObjects?.find(o=>o.id===scenario.id):snapshot.fineChunks.flatMap(c=>c.objectStates).find(o=>o.id===scenario.id);
      expect(state?.id).toBe(scenario.id);expect(state?.position).toEqual(scenario.anchor);
      if(scenario.id==='oven')expect(snapshot.homeNpcs?.find(n=>n.id==='ren')?.workAt).toBe('oven');
      await testInfo.attach(`${scenario.name}-production-and-physics`,{body:Buffer.from(JSON.stringify({seedRevision:seedAck.revision,revision:accepted.revision,before,contact,oven,object:state,inventory:snapshot.meta.playerInventory},null,2)),contentType:'application/json'});
      await testInfo.attach(`${scenario.name}-baked-result`,{body:await page.screenshot(),contentType:'image/png'});

      await page.reload();
      await expect.poll(async()=>Number(await status.getAttribute('data-persistence-revision'))).toBeGreaterThanOrEqual(accepted.revision);
      await expect.poll(async()=>(await ovens(page)).some(o=>o.id===scenario.id&&o.resolved&&o.primitives===0),{timeout:45_000}).toBe(true);
      await expect(status).toHaveAttribute('data-persistence-conflict','false');
      await startFirstPerson(page);
      await lookForObject(page,scenario.title,0,1.15);
      await testInfo.attach(`${scenario.name}-reloaded-closeup`,{body:await page.screenshot(),contentType:'image/png'});
      await page.keyboard.press('KeyE');await expect(page.locator('#interactionTitle')).toHaveText(scenario.title);
      await page.locator('#interactionActions button').nth(2).press('Enter');
      await expect(page.locator('#toast')).toContainText('缺少：');
      // Flour remains after the first bake. Missing water must not consume it or produce
      // additional bread, including after an ordinary acknowledged save following reload.
      await expect.poll(async()=>{
        const saved=await savedWorld(request),inv=saved.snapshot?.meta.playerInventory;
        return saved.revision>accepted.revision&&inv?.flour===1&&inv.water===0&&inv.bread===2&&inv.coin===10;
      },{timeout:45_000}).toBe(true);
      await testInfo.attach(`${scenario.name}-reloaded-missing-water`,{body:await page.screenshot(),contentType:'image/png'});
      expect(errors).toEqual([]);
    } catch(error) {
      // Capture before fixture teardown, so a failed physical approach never loses
      // its visible scene and real actor/physics state to page.close().
      try {
        const current=await savedWorld(request);
        const actors=[...(current.snapshot?.homeNpcs??[]),...(current.snapshot?.fineChunks??[]).flatMap(chunk=>chunk.npcStates)];
        await testInfo.attach(`${scenario.name}-failure-state`,{body:Buffer.from(JSON.stringify({
          player:await position(page),ovens:await ovens(page),prompt:await page.locator('#prompt').innerText(),
          worldStatus:await page.locator('#worldStatus').evaluate(el=>el.outerHTML),pageErrors:errors,
          savedRevision:current.revision,actors:actors.map(actor=>({id:actor.id,position:actor.position,workAt:actor.workAt,currentAction:actor.currentAction}))
        },null,2)),contentType:'application/json'});
        await testInfo.attach(`${scenario.name}-failure-before-teardown`,{body:await page.screenshot(),contentType:'image/png'});
      } catch(diagnosticError) {
        await testInfo.attach(`${scenario.name}-diagnostic-error`,{body:Buffer.from(String(diagnosticError)),contentType:'text/plain'});
      }
      throw error;
    } finally {
      await page.keyboard.up('KeyW');await page.keyboard.up('KeyS');
      await page.close();
      const cleared=await request.delete('/api/world/state');expect(cleared.ok()).toBe(true);
    }
  });
}
