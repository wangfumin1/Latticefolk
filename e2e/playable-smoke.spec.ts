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

test('real playable scene keeps God View observer-only and uses authoritative terrain', async ({ page }, testInfo) => {
  const pageErrors:string[]=[];
  page.on('pageerror',(error)=>pageErrors.push(error.message));

  await page.goto('/');
  await expect(page.locator('#game canvas')).toBeVisible();
  await expect.poll(async()=>(await runtime(page)).materializedChunks,{timeout:30_000}).toBeGreaterThan(0);
  await expect.poll(async()=>(await runtime(page)).terrainSurfaces,{timeout:30_000}).toBeGreaterThan(0);

  await page.locator('#startBtn').click();
  await expect(page.locator('#startOverlay')).toHaveClass(/hidden/);
  await expect.poll(async()=>page.evaluate(()=>document.pointerLockElement?.tagName??''),{timeout:10_000}).toBe('CANVAS');

  const firstBefore=await runtime(page);
  expect(firstBefore.cameraMode).toBe('firstPerson');
  expect(firstBefore.terrainSurfaces).toBeGreaterThanOrEqual(firstBefore.materializedChunks);

  await page.keyboard.down('w');
  await page.waitForTimeout(500);
  await page.keyboard.up('w');
  await page.waitForTimeout(150);
  const firstAfter=await runtime(page);
  expect(Math.hypot(firstAfter.playerX-firstBefore.playerX,firstAfter.playerZ-firstBefore.playerZ)).toBeGreaterThan(.05);

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
