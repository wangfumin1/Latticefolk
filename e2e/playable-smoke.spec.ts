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
  assetFailures:number;
  licensedVisualTargets:number;
  licensedVisualsResolved:number;
}

async function runtime(page:Page):Promise<RuntimeSnapshot> {
  return page.evaluate(()=>{
    const el=document.querySelector<HTMLElement>('#worldStatus');
    if(!el)throw new Error('worldStatus runtime observability node is missing');
    const data=el.dataset;
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
      persistenceSavePending:data.persistenceSavePending==='true',
      assetFailures:read('assetFailures'),
      licensedVisualTargets:read('licensedVisualTargets'),
      licensedVisualsResolved:read('licensedVisualsResolved')
    };
  });
}

async function moveWithKeys(page:Page,keys:string[],durationMs:number) {
  for(const key of keys)await page.keyboard.down(key);
  await page.waitForTimeout(durationMs);
  for(const key of [...keys].reverse())await page.keyboard.up(key);
  await page.waitForTimeout(120);
}

async function moveUntil(
  page:Page,
  keys:string[],
  reached:(state:RuntimeSnapshot)=>boolean,
  timeoutMs=10_000
) {
  for(const key of keys)await page.keyboard.down(key);
  try{
    await expect.poll(async()=>reached(await runtime(page)),{timeout:timeoutMs,intervals:[120]}).toBe(true);
  }finally{
    for(const key of [...keys].reverse())await page.keyboard.up(key);
  }
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
  test.setTimeout(300_000);
  const pageErrors:string[]=[];
  page.on('pageerror',(error)=>pageErrors.push(error.message));

  await page.goto('/');
  await expect(page.locator('#game canvas')).toBeVisible();
  await expect.poll(async()=>(await runtime(page)).terrainSurfaces,{timeout:15_000}).toBeGreaterThan(0);
  await expect.poll(async()=>(await runtime(page)).cartVisualChildren,{timeout:15_000}).toBeGreaterThan(0);
  await expect.poll(async()=>(await runtime(page)).assetFailures,{timeout:15_000}).toBe(0);
  await expect.poll(async()=>{const state=await runtime(page);return state.licensedVisualTargets>0&&state.licensedVisualsResolved===state.licensedVisualTargets;},{timeout:15_000}).toBe(true);

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
  await expect.poll(async()=>{const state=await runtime(page);return !state.persistenceSavePending&&!state.movableDirty;},{timeout:30_000}).toBe(true);

  await page.unroute('**/api/world/state');
  await page.reload();
  await expect.poll(async()=>(await runtime(page)).terrainSurfaces,{timeout:15_000}).toBeGreaterThan(0);
  await expect.poll(async()=>(await runtime(page)).cartVisualChildren,{timeout:15_000}).toBeGreaterThan(0);
  await expect.poll(async()=>(await runtime(page)).assetFailures,{timeout:15_000}).toBe(0);
  await expect.poll(async()=>{const state=await runtime(page);return state.licensedVisualTargets>0&&state.licensedVisualsResolved===state.licensedVisualTargets;},{timeout:15_000}).toBe(true);
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
  await expect.poll(async()=>page.evaluate(()=>document.pointerLockElement?.tagName??''),{timeout:10_000}).toBe('CANVAS');
  const firstRestored=await runtime(page);
  expect(firstRestored.physicsBodies).toBe(godAfter.physicsBodies+1);

  // Real first-person tool interaction. The persisted cart rests at z≈2 against the central
  // well, so the centerline is intentionally impassable. Route around authoritative geometry:
  // west of cart/well -> south cross-town lane -> east of the apple tree -> north-side approach.
  // Waypoints use observed world coordinates rather than assuming wall-clock time maps to distance.
  await moveUntil(page,['ShiftLeft','KeyA'],state=>state.playerX<-3.5,10_000);
  await moveUntil(page,['ShiftLeft','KeyS'],state=>state.playerZ>9.0,10_000);
  await moveUntil(page,['ShiftLeft','KeyA'],state=>state.playerX<-14.0,18_000);
  await moveUntil(page,['ShiftLeft','KeyW'],state=>state.playerZ<-2.3,20_000);
  // Align the first-person center ray with the tree trunk at x=-8 using normal strafe
  // speed. Sprinting across this final short leg can stop inside the interaction trigger
  // while leaving the narrow trunk off-center, which is not a valid visual acquisition.
  await moveUntil(page,['KeyD'],state=>state.playerX>-8.2,14_000);
  const treeApproach=await runtime(page);
  expect(treeApproach.playerX).toBeGreaterThan(-8.2);
  expect(treeApproach.playerX).toBeLessThan(-7.7);
  expect(treeApproach.playerZ).toBeLessThan(-2.3);
  await expect(page.locator('#prompt')).toContainText('苹果树',{timeout:10_000});
  await page.keyboard.press('KeyE');
  await expect(page.locator('#interactionMenu')).not.toHaveClass(/hidden/);
  await expect(page.locator('#interactionTitle')).toContainText('苹果树');
  const treeActions=page.locator('#interactionActions button');
  await expect(treeActions).toHaveCount(3);
  await treeActions.nth(2).click();
  await expect(page.locator('#toast')).toContainText('木料 ×2');
  await page.screenshot({path:testInfo.outputPath('first-person-tool-contact.png'),fullPage:true});

  expect(pageErrors).toEqual([]);
});
