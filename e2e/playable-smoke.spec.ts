import { test, expect, type Page } from '@playwright/test';

interface RuntimeSnapshot {
  cameraMode:string;
  discoveredChunks:number;
  materializedChunks:number;
  physicsBodies:number;
  terrainSurfaces:number;
  playerX:number;
  playerZ:number;
  movableBodies:number;
  cartX:number;
  cartZ:number;
  cartVisualChildren:number;
  movableDirty:boolean;
  persistenceSavePending:boolean;
}

async function runtime(page:Page):Promise<RuntimeSnapshot> {
  return page.locator('#worldStatus').evaluate((el)=>{
    const data=(el as HTMLElement).dataset;
    const read=(key:string)=>Number(data[key]??'NaN');
    return {
      cameraMode:data.cameraMode??'',
      discoveredChunks:read('discoveredChunks'),
      materializedChunks:read('materializedChunks'),
      physicsBodies:read('physicsBodies'),
      terrainSurfaces:read('terrainSurfaces'),
      playerX:read('playerX'),
      playerZ:read('playerZ'),
      movableBodies:read('movableBodies'),
      cartX:read('cartX'),
      cartZ:read('cartZ'),
      cartVisualChildren:read('cartVisualChildren'),
      movableDirty:data.movableDirty==='true',
      persistenceSavePending:data.persistenceSavePending==='true'
    };
  });
}

async function moveWithKeys(page:Page,keys:string[],durationMs:number) {
  for(const key of keys)await page.keyboard.down(key);
  await page.waitForTimeout(durationMs);
  for(const key of [...keys].reverse())await page.keyboard.up(key);
  await page.waitForTimeout(120);
}

async function persistedCartZ(page:Page):Promise<number> {
  return page.evaluate(async()=>{
    const response=await fetch('/api/world/state',{cache:'no-store'});
    if(!response.ok)return Number.NaN;
    const data=await response.json() as {snapshot?:{homeObjects?:Array<{id?:string;position?:{z?:number}}>}|null};
    const cart=data.snapshot?.homeObjects?.find(object=>object.id==='cart_town');
    return Number(cart?.position?.z??Number.NaN);
  });
}

test('real playable scene keeps God View observer-only and uses authoritative ground', async ({ page }, testInfo) => {
  // Software-rendered Chromium can spend most of the default 60s budget loading the real 3D asset set on hosted runners.
  // Keep assertions individually bounded while allowing the full playable path enough wall-clock time to finish.
  test.setTimeout(180_000);
  const pageErrors:string[]=[];
  page.on('pageerror',(error)=>pageErrors.push(error.message));

  await page.goto('/');
  await expect(page.locator('#game canvas')).toBeVisible();
  await expect.poll(async()=>(await runtime(page)).terrainSurfaces,{timeout:15_000}).toBeGreaterThan(0);
  await expect.poll(async()=>(await runtime(page)).cartVisualChildren,{timeout:15_000}).toBeGreaterThan(0);

  const home=await runtime(page);
  expect(home.movableBodies).toBeGreaterThanOrEqual(1);
  expect(home.materializedChunks).toBe(0);
  expect(home.terrainSurfaces).toBeGreaterThanOrEqual(1);

  await page.locator('#startBtn').click();
  await expect(page.locator('#startOverlay')).toHaveClass(/hidden/);
  await expect.poll(async()=>page.evaluate(()=>document.pointerLockElement?.tagName??''),{timeout:10_000}).toBe('CANVAS');

  let injectedSaveFailure=false;
  let releaseSaveRetry=()=>{};
  const saveRetryGate=new Promise<void>(resolve=>{releaseSaveRetry=resolve;});
  await page.route('**/api/world/state',async route=>{
    if(route.request().method()!=='POST'){
      await route.continue();
      return;
    }
    if(!injectedSaveFailure){
      injectedSaveFailure=true;
      await route.fulfill({status:503,contentType:'application/json',body:'{"error":"e2e-injected-save-failure"}'});
      return;
    }
    await saveRetryGate;
    await route.continue();
  });

  const firstBefore=await runtime(page);
  expect(firstBefore.cameraMode).toBe('firstPerson');
  await moveWithKeys(page,['ShiftLeft','KeyW'],650);
  const firstAfter=await runtime(page);
  expect(Math.hypot(firstAfter.playerX-firstBefore.playerX,firstAfter.playerZ-firstBefore.playerZ)).toBeGreaterThan(.25);
  expect(firstAfter.terrainSurfaces).toBeGreaterThanOrEqual(1);
  expect(firstAfter.cartZ).toBeLessThan(firstBefore.cartZ-.08);
  expect(firstAfter.movableBodies).toBe(home.movableBodies);

  const pushedCartZ=firstAfter.cartZ;
  await moveWithKeys(page,['KeyS'],650);

  await expect.poll(()=>injectedSaveFailure,{timeout:8_000}).toBe(true);
  await expect.poll(async()=>(await runtime(page)).movableDirty,{timeout:8_000}).toBe(true);
  releaseSaveRetry();

  const worldStatusBox=await page.locator('#worldStatus').boundingBox();
  expect(worldStatusBox).not.toBeNull();
  expect(worldStatusBox!.width).toBeLessThanOrEqual(541);

  await page.screenshot({path:testInfo.outputPath('first-person-cart-pushed.png'),fullPage:true});
  await expect.poll(async()=>Math.abs((await persistedCartZ(page))-pushedCartZ),{timeout:45_000}).toBeLessThan(.08);
  await expect.poll(async()=>(await runtime(page)).movableDirty,{timeout:8_000}).toBe(false);

  await page.unroute('**/api/world/state');
  await page.reload();
  await expect.poll(async()=>(await runtime(page)).terrainSurfaces,{timeout:15_000}).toBeGreaterThan(0);
  await expect.poll(async()=>(await runtime(page)).cartVisualChildren,{timeout:15_000}).toBeGreaterThan(0);
  await expect.poll(async()=>Math.abs((await runtime(page)).cartZ-pushedCartZ),{timeout:8_000}).toBeLessThan(.08);
  await page.locator('#startBtn').click();
  await expect.poll(async()=>page.evaluate(()=>document.pointerLockElement?.tagName??''),{timeout:10_000}).toBe('CANVAS');

  await page.keyboard.press('KeyG');
  await expect.poll(async()=>(await runtime(page)).cameraMode).toBe('god');
  const godBefore=await runtime(page);
  expect(godBefore.physicsBodies).toBe(firstAfter.physicsBodies-1);
  expect(godBefore.terrainSurfaces).toBe(firstAfter.terrainSurfaces);

  await moveWithKeys(page,['KeyW'],500);
  const godAfter=await runtime(page);
  expect(godAfter.discoveredChunks).toBe(godBefore.discoveredChunks);
  expect(godAfter.materializedChunks).toBe(godBefore.materializedChunks);
  expect(godAfter.playerX).toBe(godBefore.playerX);
  expect(godAfter.playerZ).toBe(godBefore.playerZ);
  expect(godAfter.physicsBodies).toBe(godBefore.physicsBodies);
  expect(godAfter.terrainSurfaces).toBe(godBefore.terrainSurfaces);

  await page.screenshot({path:testInfo.outputPath('god-view.png'),fullPage:true});

  await page.keyboard.press('KeyG');
  await expect.poll(async()=>(await runtime(page)).cameraMode).toBe('firstPerson');
  const firstRestored=await runtime(page);
  expect(firstRestored.physicsBodies).toBe(godAfter.physicsBodies+1);
  expect(pageErrors).toEqual([]);
});
