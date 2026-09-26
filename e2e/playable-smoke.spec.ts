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
  let last:RuntimeSnapshot|undefined;
  const deadline=Date.now()+timeoutMs;
  try{
    while(true){
      last=await runtime(page);
      if(reached(last))break;
      if(Date.now()>=deadline){
        // page.evaluate can finish after the nominal deadline on software WebGL runners.
        // Accept the final authoritative sample if movement reached the waypoint meanwhile.
        last=await runtime(page);
        if(reached(last))break;
        throw new Error(`movement waypoint timed out after ${timeoutMs}ms at (${last.playerX.toFixed(3)}, ${last.playerZ.toFixed(3)})`);
      }
      await page.waitForTimeout(120);
    }
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

  // Real first-person tool interaction. Use the east apple tree at (14, 1.5).
  // First clear the central cart/well laterally, then enter the open z≈3 cross-town lane.
  // This keeps all NPC/wildlife dynamic collision enabled while avoiding the observed
  // z=6.325 traffic line rather than disabling or bypassing authoritative physics.
  await moveUntil(page,['ShiftLeft','KeyD'],state=>state.playerX>4.0,10_000);
  // Stop one polling interval early under software WebGL so the player remains north
  // of the tree while lateral alignment happens; the observed stop is around z=4.0.
  await moveUntil(page,['ShiftLeft','KeyW'],state=>state.playerZ<4.5,10_000);
  await moveUntil(page,['ShiftLeft','KeyD'],state=>state.playerX>13.0,16_000);
  let eastAligned=await runtime(page);
  // Precision alignment uses short real-input pulses with the key released before each
  // observability read. This prevents software-rendered CI from moving another meter while
  // a slow page.evaluate sample is in flight.
  for(let i=0;i<12&&(eastAligned.playerX<13.65||eastAligned.playerX>14.35);i++){
    await moveWithKeys(page,[eastAligned.playerX<13.65?'KeyD':'KeyA'],80);
    eastAligned=await runtime(page);
  }
  expect(eastAligned.playerX).toBeGreaterThan(13.65);
  expect(eastAligned.playerX).toBeLessThan(14.35);

  // Approach tree_apple_2 with the same released-before-sample input pulses. If lateral
  // movement has already drifted into the semantic trigger, keep that valid physical state;
  // otherwise advance until trigger reach. The authoritative trunk collider still prevents
  // penetration before the player can pass through the tree.
  let treeApproach=eastAligned;
  for(let i=0;i<10&&treeApproach.playerZ>=2.65;i++){
    await moveWithKeys(page,['KeyW'],80);
    treeApproach=await runtime(page);
  }
  expect(treeApproach.playerX).toBeGreaterThan(13.65);
  expect(treeApproach.playerX).toBeLessThan(14.35);
  expect(treeApproach.playerZ).toBeLessThan(2.65);
  expect(treeApproach.playerZ).toBeGreaterThan(2.05);
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
