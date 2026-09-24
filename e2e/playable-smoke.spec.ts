import { test, expect, type Page } from '@playwright/test';

interface RuntimeSnapshot {
  cameraMode:string;
  discoveredChunks:number;
  materializedChunks:number;
  physicsBodies:number;
  terrainSurfaces:number;
  playerX:number;
  playerZ:number;
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
      playerZ:read('playerZ')
    };
  });
}

async function moveWithKeys(page:Page,keys:string[],durationMs:number) {
  for(const key of keys)await page.keyboard.down(key);
  await page.waitForTimeout(durationMs);
  for(const key of [...keys].reverse())await page.keyboard.up(key);
  await page.waitForTimeout(100);
}

async function exploreToDistantChunk(page:Page):Promise<RuntimeSnapshot> {
  let previous=await runtime(page);
  for(let attempt=0;attempt<14;attempt++){
    await moveWithKeys(page,['ShiftLeft','KeyW'],900);
    let current=await runtime(page);
    if(current.materializedChunks>0&&current.terrainSurfaces>0)return current;

    const progress=Math.hypot(current.playerX-previous.playerX,current.playerZ-previous.playerZ);
    if(progress<1){
      // A real collider/body stopped forward travel. Sidestep, then continue; alternate sides
      // so the smoke test navigates the live town instead of bypassing physics.
      const strafe=attempt%2===0?'KeyD':'KeyA';
      await moveWithKeys(page,['ShiftLeft',strafe],650);
      current=await runtime(page);
    }
    previous=current;
  }
  return runtime(page);
}

test('real playable scene keeps God View observer-only and uses authoritative terrain', async ({ page }, testInfo) => {
  const pageErrors:string[]=[];
  page.on('pageerror',(error)=>pageErrors.push(error.message));

  await page.goto('/');
  await expect(page.locator('#game canvas')).toBeVisible();

  // The authored home town is deliberately not a coarse materialized chunk.
  // Terrain v2 becomes active only after real first-person exploration reaches a distant chunk.
  const home=await runtime(page);
  expect(home.materializedChunks).toBe(0);
  expect(home.terrainSurfaces).toBe(0);

  await page.locator('#startBtn').click();
  await expect(page.locator('#startOverlay')).toHaveClass(/hidden/);
  await expect.poll(async()=>page.evaluate(()=>document.pointerLockElement?.tagName??''),{timeout:10_000}).toBe('CANVAS');

  const firstBefore=await runtime(page);
  expect(firstBefore.cameraMode).toBe('firstPerson');

  // Default camera faces -Z. Traverse the live town with real keyboard input.
  // If authoritative collision stops the player, the helper sidesteps rather than bypassing physics.
  const firstAfter=await exploreToDistantChunk(page);
  expect(firstAfter.materializedChunks).toBeGreaterThan(0);
  expect(firstAfter.terrainSurfaces).toBeGreaterThan(0);
  expect(Math.hypot(firstAfter.playerX-firstBefore.playerX,firstAfter.playerZ-firstBefore.playerZ)).toBeGreaterThan(30);
  expect(firstAfter.terrainSurfaces).toBeGreaterThanOrEqual(firstAfter.materializedChunks);

  await page.screenshot({
    path:testInfo.outputPath('first-person.png'),
    fullPage:true
  });

  await page.locator('#modeBtn').click();
  await expect.poll(async()=>(await runtime(page)).cameraMode).toBe('god');
  const godBefore=await runtime(page);
  expect(godBefore.physicsBodies).toBe(firstAfter.physicsBodies-1);

  await page.keyboard.down('w');
  await page.waitForTimeout(700);
  await page.keyboard.up('w');
  await page.waitForTimeout(200);
  const godAfter=await runtime(page);
  expect(godAfter.discoveredChunks).toBe(godBefore.discoveredChunks);
  expect(godAfter.materializedChunks).toBe(godBefore.materializedChunks);
  expect(godAfter.playerX).toBe(godBefore.playerX);
  expect(godAfter.playerZ).toBe(godBefore.playerZ);
  expect(godAfter.physicsBodies).toBe(godBefore.physicsBodies);

  await page.screenshot({
    path:testInfo.outputPath('god-view.png'),
    fullPage:true
  });

  await page.locator('#modeBtn').click();
  await expect.poll(async()=>(await runtime(page)).cameraMode).toBe('firstPerson');
  const firstRestored=await runtime(page);
  expect(firstRestored.physicsBodies).toBe(godAfter.physicsBodies+1);
  expect(pageErrors).toEqual([]);
});
