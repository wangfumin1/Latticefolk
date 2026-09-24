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
  await page.waitForTimeout(120);
}

test('real playable scene keeps God View observer-only and uses authoritative ground', async ({ page }, testInfo) => {
  // Software-rendered Chromium can spend most of the default 60s budget loading the real 3D asset set on hosted runners.
  // Keep assertions individually bounded while allowing the full playable path enough wall-clock time to finish.
  test.setTimeout(120_000);
  const pageErrors:string[]=[];
  page.on('pageerror',(error)=>pageErrors.push(error.message));

  await page.goto('/');
  await expect(page.locator('#game canvas')).toBeVisible();
  await expect.poll(async()=>(await runtime(page)).terrainSurfaces,{timeout:15_000}).toBeGreaterThan(0);

  const home=await runtime(page);
  expect(home.materializedChunks).toBe(0);
  expect(home.terrainSurfaces).toBeGreaterThanOrEqual(1);

  await page.locator('#startBtn').click();
  await expect(page.locator('#startOverlay')).toHaveClass(/hidden/);
  await expect.poll(async()=>page.evaluate(()=>document.pointerLockElement?.tagName??''),{timeout:10_000}).toBe('CANVAS');

  const firstBefore=await runtime(page);
  expect(firstBefore.cameraMode).toBe('firstPerson');
  await moveWithKeys(page,['ShiftLeft','KeyW'],450);
  const firstAfter=await runtime(page);
  expect(Math.hypot(firstAfter.playerX-firstBefore.playerX,firstAfter.playerZ-firstBefore.playerZ)).toBeGreaterThan(.25);
  expect(firstAfter.terrainSurfaces).toBeGreaterThanOrEqual(1);

  const worldStatusBox=await page.locator('#worldStatus').boundingBox();
  expect(worldStatusBox).not.toBeNull();
  expect(worldStatusBox!.width).toBeLessThanOrEqual(541);

  await page.screenshot({path:testInfo.outputPath('first-person.png'),fullPage:true});

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
