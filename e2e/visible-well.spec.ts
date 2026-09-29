import { test, expect } from '@playwright/test';
import type { WorldPersistenceSnapshot } from '../src/types.js';
import { WELL_RUNTIME_SHA256 } from '../scripts/lib/well-materials.mjs';
import { lookForObject } from './helpers/relative-look.js';

test('prepared opaque well is served, targeted and usable with a persisted water result', async ({page,request},testInfo) => {
  test.setTimeout(180_000);
  const reset = await request.delete('/api/world/state');
  expect(reset.ok()).toBe(true);
  const {revision} = await reset.json() as {revision:number};
  const seed:WorldPersistenceSnapshot = {
    version:1,
    meta:{day:1,minuteOfDay:495,weather:'clear',playerPosition:{x:0,z:1.55},
      playerInventory:{apple:0,bread:0,wood:0,coin:10,flower:0,grain:0,flour:0,water:0,stone:0,plank:0,tool:0}},
    coarseChunks:[],fineChunks:[],homeNpcs:[],homeObjects:[]
  };
  const seeded = await request.post('/api/world/state',{data:{expectedRevision:revision,snapshot:seed}});
  expect(seeded.ok()).toBe(true);
  const seedAck = await seeded.json() as {revision:number};
  const errors:string[]=[]; page.on('pageerror',error=>errors.push(error.message));
  try {
    await page.goto('/');
    const status=page.locator('#worldStatus');
    await expect(page.locator('#game canvas')).toBeVisible();
    await expect.poll(async()=>Number(await status.getAttribute('data-well-visual-height')),{timeout:45_000}).toBeGreaterThan(2.3);
    const runtimeHash=await page.evaluate(async()=>{
      const response=await fetch('/assets/quaternius/medieval-village/Well.fbx');
      if(!response.ok)throw new Error(`well asset HTTP ${response.status}`);
      const hash=await crypto.subtle.digest('SHA-256',await response.arrayBuffer());
      return Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('');
    });
    expect(runtimeHash).toBe(WELL_RUNTIME_SHA256);
    await page.locator('#startBtn').click();
    await lookForObject(page,'中央水井',0,.90);
    await testInfo.attach('visible-opaque-well',{body:await page.screenshot(),contentType:'image/png'});
    await page.keyboard.press('KeyE');
    await expect(page.locator('#interactionTitle')).toHaveText('中央水井');
    const actions=page.locator('#interactionActions button');
    await expect(actions).toHaveCount(4);
    await actions.nth(1).click();
    await expect(page.locator('#toast')).toContainText('打了一份井水');
    await expect.poll(async()=>{
      const response=await request.get('/api/world/state');
      expect(response.ok()).toBe(true);
      const saved=await response.json() as {revision:number;snapshot:WorldPersistenceSnapshot|null};
      return saved.revision>seedAck.revision&&saved.snapshot?.meta.playerInventory.water===1;
    },{timeout:45_000}).toBe(true);
    await testInfo.attach('well-water-persisted',{body:await page.screenshot(),contentType:'image/png'});
    expect(errors).toEqual([]);
  } finally {
    await page.close();
    const cleared=await request.delete('/api/world/state');
    expect(cleared.ok()).toBe(true);
  }
});
