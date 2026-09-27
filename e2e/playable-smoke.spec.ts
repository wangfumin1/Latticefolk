import { test, expect, type APIRequestContext, type Page } from '@playwright/test';


interface ChunkDecisionRequestForE2E {
  chunks:Array<{id:string}>;
}

interface RuntimeSnapshot {
  cameraMode:string;
  discoveredChunks:number;
  materializedChunks:number;
  coarseDecidedChunks:number;
  coarseLastSource:string;
  coarseLastBatchSize:number;
  coarseRequestTimeouts:number;
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
  persistenceRevision:number;
  persistenceConflict:boolean;
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
      coarseDecidedChunks:read('coarseDecidedChunks'),
      coarseLastSource:data.coarseLastSource??'',
      coarseLastBatchSize:read('coarseLastBatchSize'),
      coarseRequestTimeouts:read('coarseRequestTimeouts'),
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
      persistenceRevision:read('persistenceRevision'),
      persistenceConflict:data.persistenceConflict==='true',
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

async function serverPersistence(request:APIRequestContext){
  const response=await request.get('/api/world/state',{failOnStatusCode:false});
  if(!response.ok())throw new Error(`world-state GET failed: HTTP ${response.status()}`);
  return response.json() as Promise<{
    revision:number;
    snapshot?:{homeObjects?:Array<{id?:string;position?:{z?:number}}>}|null;
  }>;
}

async function worldStatusNumber(page:Page,attribute:string){
  const value=await page.locator('#worldStatus').getAttribute(attribute);
  return Number(value??Number.NaN);
}

test('real playable scene keeps God View observer-only and uses authoritative ground', async ({ page }, testInfo) => {
  // Software-rendered Chromium can spend most of the default 60s budget loading the real 3D asset set on hosted runners.
  // Keep assertions individually bounded while allowing the full playable path enough wall-clock time to finish.
  test.setTimeout(420_000);
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
  for(let i=0;i<30&&(eastAligned.playerX<13.65||eastAligned.playerX>14.35);i++){
    await moveWithKeys(page,[eastAligned.playerX<13.65?'KeyD':'KeyA'],100);
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


test('revision CAS rejects a delayed stale browser writer and stale final beacon', async ({ browser, request }) => {
  test.setTimeout(300_000);

  const reset=await request.delete('/api/world/state',{failOnStatusCode:false});
  expect(reset.ok()).toBe(true);
  const resetBody=await reset.json() as {revision:number};
  const baseRevision=resetBody.revision;
  expect(Number.isSafeInteger(baseRevision)).toBe(true);

  const contextA=await browser.newContext();
  const contextB=await browser.newContext();
  let contextAClosed=false;
  const pageA=await contextA.newPage();
  const pageB=await contextB.newPage();
  let releaseDelayed=()=>{};
  const delayedGate=new Promise<void>(resolve=>{releaseDelayed=resolve;});
  let delayedCaptured=false;
  let delayedExpectedRevision=Number.NaN;

  try{
    await Promise.all([pageA.goto('/'),pageB.goto('/')]);
    const worldStatusA=pageA.locator('#worldStatus');
    const worldStatusB=pageB.locator('#worldStatus');
    await expect(worldStatusA).toHaveAttribute('data-persistence-revision',String(baseRevision),{timeout:30_000});
    await expect(worldStatusB).toHaveAttribute('data-persistence-revision',String(baseRevision),{timeout:30_000});
    await expect(worldStatusA).toHaveAttribute('data-persistence-conflict','false',{timeout:30_000});
    await expect(worldStatusB).toHaveAttribute('data-persistence-conflict','false',{timeout:30_000});
    await expect.poll(()=>worldStatusNumber(pageA,'data-movable-bodies'),{timeout:30_000}).toBeGreaterThanOrEqual(1);
    await expect.poll(()=>worldStatusNumber(pageB,'data-movable-bodies'),{timeout:30_000}).toBeGreaterThanOrEqual(1);

    await pageB.route('**/api/world/state',async route=>{
      if(route.request().method()==='POST'&&!delayedCaptured){
        delayedCaptured=true;
        const body=JSON.parse(route.request().postData()||'{}') as {expectedRevision?:number};
        delayedExpectedRevision=Number(body.expectedRevision);
        await delayedGate;
        await route.continue();
        return;
      }
      await route.continue();
    });

    await pageB.locator('#startBtn').click();
    await expect.poll(async()=>pageB.evaluate(()=>document.pointerLockElement?.tagName??''),{timeout:10_000}).toBe('CANVAS');
    await moveWithKeys(pageB,['ShiftLeft','KeyW'],650);
    await expect.poll(()=>delayedCaptured,{timeout:10_000}).toBe(true);
    expect(delayedExpectedRevision).toBe(baseRevision);

    await pageA.locator('#startBtn').click();
    await expect.poll(async()=>pageA.evaluate(()=>document.pointerLockElement?.tagName??''),{timeout:10_000}).toBe('CANVAS');
    await moveWithKeys(pageA,['ShiftLeft','KeyW'],650);
    await expect.poll(()=>worldStatusNumber(pageA,'data-persistence-revision'),{timeout:30_000}).toBeGreaterThan(baseRevision);
    const authoritativeCartZ=await worldStatusNumber(pageA,'data-cart-z');

    releaseDelayed();
    await expect(worldStatusB).toHaveAttribute('data-persistence-conflict','true',{timeout:30_000});
    await expect(worldStatusB).toHaveAttribute('data-persistence-save-pending','false',{timeout:30_000});

    const afterConflict=await serverPersistence(request);
    expect(afterConflict.revision).toBeGreaterThan(baseRevision);
    const storedCartZ=Number(afterConflict.snapshot?.homeObjects?.find(object=>object.id==='cart_town')?.position?.z??Number.NaN);
    expect(Math.abs(storedCartZ-authoritativeCartZ)).toBeLessThan(.08);
    const conflictedLocalRevision=await worldStatusNumber(pageB,'data-persistence-revision');
    await pageB.waitForTimeout(1_800);
    expect(await worldStatusNumber(pageB,'data-persistence-revision')).toBe(conflictedLocalRevision);
    await expect(worldStatusB).toHaveAttribute('data-persistence-conflict','true');

    // Stop the authoritative writer before reloading the stale tab. Keeping page A alive
    // would let its normal periodic autosave legitimately advance the revision again while
    // page B is adopting the conflict winner, turning this recovery assertion into a fresh race.
    await contextA.close();
    contextAClosed=true;
    await pageB.waitForTimeout(500);

    await pageB.reload();
    await expect.poll(()=>worldStatusNumber(pageB,'data-persistence-revision'),{timeout:30_000}).toBeGreaterThanOrEqual(afterConflict.revision);
    await expect(worldStatusB).toHaveAttribute('data-persistence-conflict','false',{timeout:30_000});
    await expect.poll(async()=>Math.abs((await worldStatusNumber(pageB,'data-cart-z'))-authoritativeCartZ),{timeout:30_000}).toBeLessThan(.08);

    await expect(worldStatusB).toHaveAttribute('data-persistence-save-pending','false',{timeout:30_000});
    await expect.poll(async()=>{
      const localRevision=await worldStatusNumber(pageB,'data-persistence-revision');
      return localRevision===(await serverPersistence(request)).revision;
    },{timeout:30_000}).toBe(true);

    const beforeFinalSave=(await serverPersistence(request)).revision;
    await pageB.evaluate(()=>window.dispatchEvent(new Event('beforeunload')));
    await expect.poll(async()=>(await serverPersistence(request)).revision,{timeout:10_000}).toBeGreaterThan(beforeFinalSave);
    const afterFinalSave=(await serverPersistence(request)).revision;
    expect(await worldStatusNumber(pageB,'data-persistence-revision')).toBeLessThan(afterFinalSave);

    await pageB.evaluate(()=>window.dispatchEvent(new Event('beforeunload')));
    await pageB.waitForTimeout(1_000);
    expect((await serverPersistence(request)).revision).toBe(afterFinalSave);
  }finally{
    releaseDelayed();
    if(!contextAClosed)await contextA.close();
    await contextB.close();
  }
});


test('coarse policy reply crossing a real materialize-unload transition is discarded and retry recovers', async ({ page, request }, testInfo) => {
  test.setTimeout(420_000);

  const reset=await request.delete('/api/world/state',{failOnStatusCode:false});
  expect(reset.ok()).toBe(true);

  await page.goto('/');
  await expect(page.locator('#game canvas')).toBeVisible();
  await expect.poll(async()=>(await runtime(page)).assetFailures,{timeout:30_000}).toBe(0);
  await page.locator('#startBtn').click();
  await expect.poll(async()=>page.evaluate(()=>document.pointerLockElement?.tagName??''),{timeout:10_000}).toBe('CANVAS');

  // Let the first ordinary coarse batch complete, then move to just inside the home/coarse
  // ownership boundary. The next batch is held only after positioning, so the real
  // materialize -> unload round trip can complete well inside the production 8s deadline.
  await expect.poll(async()=>(await runtime(page)).coarseDecidedChunks,{timeout:20_000}).toBeGreaterThan(0);
  await moveUntil(page,['ShiftLeft','KeyD'],state=>state.playerX>4.0,12_000);
  await moveUntil(page,['ShiftLeft','KeyW'],state=>state.playerZ<4.2,12_000);
  await moveUntil(page,['ShiftLeft','KeyD'],state=>state.playerX>34.4,55_000);
  let staged=await runtime(page);
  for(let i=0;i<12&&staged.playerX<35.1;i++){
    await moveWithKeys(page,['KeyD'],70);
    staged=await runtime(page);
  }
  expect(staged.playerX).toBeGreaterThan(35.0);
  expect(staged.playerX).toBeLessThan(36.0);
  expect(staged.materializedChunks).toBe(0);

  let heldRequest:ChunkDecisionRequestForE2E|undefined;
  let releaseHeld=()=>{};
  const heldGate=new Promise<void>(resolve=>{releaseHeld=resolve;});
  let heldCompleted=false;
  await page.route('**/api/world/chunks/decide',async route=>{
    if(heldRequest){
      await route.continue();
      return;
    }
    heldRequest=JSON.parse(route.request().postData()||'{}') as ChunkDecisionRequestForE2E;
    await heldGate;
    const payload={
      source:'e2e-stale-transition',
      decisions:heldRequest.chunks.map(chunk=>({
        chunkId:chunk.id,
        strategy:'fortify',
        migrationPolicy:'retain',
        ecologyPolicy:'protect',
        confidence:.9,
        reasonCode:'e2e_stale_transition',
        source:'e2e-stale-transition'
      }))
    };
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload)});
    heldCompleted=true;
  });

  try{
    await expect.poll(()=>Boolean(heldRequest),{timeout:15_000}).toBe(true);
    const before=await runtime(page);

    await moveWithKeys(page,['ShiftLeft','KeyD'],350);
    await expect.poll(async()=>(await runtime(page)).materializedChunks,{timeout:3_000}).toBeGreaterThan(0);
    await page.screenshot({path:testInfo.outputPath('coarse-request-materialized-transition.png'),fullPage:true});

    await moveWithKeys(page,['ShiftLeft','KeyA'],550);
    await expect.poll(async()=>(await runtime(page)).materializedChunks,{timeout:3_000}).toBe(0);

    releaseHeld();
    await expect.poll(()=>heldCompleted,{timeout:3_000}).toBe(true);
    await page.waitForTimeout(250);
    const afterStale=await runtime(page);
    expect(afterStale.coarseRequestTimeouts).toBe(before.coarseRequestTimeouts);
    expect(afterStale.coarseDecidedChunks).toBe(before.coarseDecidedChunks);
    expect(afterStale.coarseLastBatchSize).toBe(before.coarseLastBatchSize);
    expect(afterStale.coarseLastSource).not.toBe('e2e-stale-transition');

    await page.unroute('**/api/world/chunks/decide');
    await expect.poll(async()=>(await runtime(page)).coarseDecidedChunks,{timeout:40_000}).toBeGreaterThan(before.coarseDecidedChunks);
    const recovered=await runtime(page);
    expect(recovered.coarseLastBatchSize).toBeGreaterThan(0);
    expect(recovered.coarseLastSource).not.toBe('e2e-stale-transition');
  }finally{
    releaseHeld();
    await page.unroute('**/api/world/chunks/decide').catch(()=>{});
  }
});
