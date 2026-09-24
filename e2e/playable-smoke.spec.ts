import { test, expect, type Page } from '@playwright/test';

interface RuntimeSnapshot {
  cameraMode:string;
  discoveredChunks:number;
  materializedChunks:number;
  physicsBodies:number;
  terrainSurfaces:number;
  doors:number;
  openDoors:number;
  assetsReady:boolean;
  playerX:number;
  playerZ:number;
}

const runtime=(page:Page):Promise<RuntimeSnapshot>=>page.evaluate(()=>{
  const el=document.querySelector<HTMLElement>('#worldStatus');
  if(!el)throw new Error('worldStatus missing');
  const data=el.dataset,read=(key:string)=>Number(data[key]??'NaN');
  return {
    cameraMode:data.cameraMode??'',
    discoveredChunks:read('discoveredChunks'),
    materializedChunks:read('materializedChunks'),
    physicsBodies:read('physicsBodies'),
    terrainSurfaces:read('terrainSurfaces'),
    doors:read('doors'),
    openDoors:read('openDoors'),
    assetsReady:data.assetsReady==='true',
    playerX:read('playerX'),
    playerZ:read('playerZ')
  };
});

async function move(page:Page,keys:string[],ms:number) {
  for(const key of keys)await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  for(const key of [...keys].reverse())await page.keyboard.up(key);
  await page.waitForTimeout(80);
}

async function enterPlayable(page:Page) {
  await page.locator('#startBtn').click();
  await expect(page.locator('#startOverlay')).toHaveClass(/hidden/);
  await expect.poll(async()=>page.evaluate(()=>document.pointerLockElement?.tagName??''),{timeout:10_000}).toBe('CANVAS');
}

async function placeWithHarness(page:Page,x:number,z:number,yaw=0) {
  const placed=await page.evaluate(({x,z,yaw})=>{
    const harness=(window as typeof window & {__LATTICEFOLK_E2E__?:{placePlayer:(x:number,z:number,yaw?:number)=>{x:number;z:number}}}).__LATTICEFOLK_E2E__;
    if(!harness)throw new Error('E2E harness unavailable');
    return harness.placePlayer(x,z,yaw);
  },{x,z,yaw});
  expect(placed.x).toBe(x);
  expect(placed.z).toBe(z);
  await expect.poll(async()=>Math.abs((await runtime(page)).playerX-x)).toBeLessThan(.08);
  await expect.poll(async()=>Math.abs((await runtime(page)).playerZ-z)).toBeLessThan(.08);
}

async function placeForBakeryInteraction(page:Page) {
  await placeWithHarness(page,-10.55,-12.25,-0.42);
}

async function placeAtBakeryThreshold(page:Page) {
  await placeWithHarness(page,-10,-12.35,0);
}

async function waitForObjectPrompt(page:Page,name:string) {
  await expect(page.locator('#prompt')).toContainText(name,{timeout:10_000});
}

async function persistedDoorOpen(page:Page,id:string) {
  return page.evaluate(async objectId=>{
    const response=await fetch('/api/world/state');
    const data=await response.json() as {snapshot?:{homeObjects?:Array<{id:string;doorOpen?:boolean}>;fineChunks?:Array<{objectStates?:Array<{id:string;doorOpen?:boolean}>}>}};
    const snapshot=data.snapshot;
    const objects=[...(snapshot?.homeObjects||[]),...(snapshot?.fineChunks||[]).flatMap(chunk=>chunk.objectStates||[])];
    return objects.find(object=>object.id===objectId)?.doorOpen;
  },id);
}

test('authoritative door persists, traverses, blocks, and God View stays observer-only',async({page},testInfo)=>{
  test.setTimeout(300_000);
  const pageErrors:string[]=[];
  page.on('pageerror',error=>pageErrors.push(error.message));

  await page.goto('/?e2e=1');
  await expect(page.locator('#game canvas')).toBeVisible();
  await expect.poll(async()=>(await runtime(page)).terrainSurfaces,{timeout:15_000}).toBeGreaterThan(0);
  await expect.poll(async()=>(await runtime(page)).assetsReady,{timeout:30_000}).toBe(true);

  const home=await runtime(page);
  expect(home.doors).toBeGreaterThanOrEqual(11);
  expect(home.openDoors).toBe(0);
  expect(home.materializedChunks).toBe(0);

  await enterPlayable(page);
  const spawnBefore=await runtime(page);
  await move(page,['ShiftLeft','KeyD'],500);
  const spawnAfter=await runtime(page);
  expect(spawnAfter.playerX-spawnBefore.playerX).toBeGreaterThan(.25);

  // Long-distance town traversal is setup, not the behavior under test. The DEV+?e2e=1
  // harness only places the already-loaded authoritative player near the real bakery threshold.
  // Door interaction and threshold traversal below still use the real pointer-lock/input path.
  await placeForBakeryInteraction(page);
  await waitForObjectPrompt(page,'面包房');
  await page.keyboard.press('KeyE');
  await expect(page.locator('#interactionMenu')).not.toHaveClass(/hidden/);
  await page.locator('button[data-action="open_door"]').click();
  await expect.poll(async()=>(await runtime(page)).openDoors).toBe(1);
  await expect.poll(async()=>persistedDoorOpen(page,'building_面包房')).toBe(true);
  // Capture visual evidence from a representative viewing distance, not pressed against the panel.
  await placeWithHarness(page,-10,-10.8,0);
  await page.waitForTimeout(250);
  await page.screenshot({path:testInfo.outputPath('door-open.png'),fullPage:true});

  await page.reload();
  await expect(page.locator('#game canvas')).toBeVisible();
  await expect.poll(async()=>(await runtime(page)).assetsReady,{timeout:30_000}).toBe(true);
  await expect.poll(async()=>(await runtime(page)).openDoors).toBe(1);
  expect(await persistedDoorOpen(page,'building_面包房')).toBe(true);
  await enterPlayable(page);
  await placeAtBakeryThreshold(page);

  await move(page,['KeyW'],850);
  const inside=await runtime(page);
  expect(inside.playerZ).toBeLessThan(-13.30);

  await move(page,['KeyS'],850);
  const outside=await runtime(page);
  expect(outside.playerZ).toBeGreaterThan(-12.70);
  await placeAtBakeryThreshold(page);
  await waitForObjectPrompt(page,'面包房');
  await page.keyboard.press('KeyE');
  await expect(page.locator('#interactionMenu')).not.toHaveClass(/hidden/);
  await page.locator('button[data-action="close_door"]').click();
  await expect.poll(async()=>(await runtime(page)).openDoors,{timeout:15_000}).toBe(0);
  await expect.poll(async()=>persistedDoorOpen(page,'building_面包房')).toBe(false);

  await placeAtBakeryThreshold(page);
  const closedBefore=await runtime(page);
  await move(page,['KeyW'],850);
  const blocked=await runtime(page);
  expect(blocked.playerZ).toBeLessThan(closedBefore.playerZ-.15);
  expect(blocked.playerZ).toBeGreaterThan(-13.12);
  // The collision assertion above is made at contact; back the camera away only for useful visual evidence.
  await placeWithHarness(page,-10,-10.8,0);
  await page.waitForTimeout(250);
  await page.screenshot({path:testInfo.outputPath('door-closed-blocked.png'),fullPage:true});

  await page.keyboard.press('KeyG');
  await expect.poll(async()=>(await runtime(page)).cameraMode).toBe('god');
  const godBefore=await runtime(page);
  expect(godBefore.physicsBodies).toBe(blocked.physicsBodies-1);
  await move(page,['KeyW'],450);
  const godAfter=await runtime(page);
  expect(godAfter.discoveredChunks).toBe(godBefore.discoveredChunks);
  expect(godAfter.materializedChunks).toBe(godBefore.materializedChunks);
  expect(godAfter.playerX).toBe(godBefore.playerX);
  expect(godAfter.playerZ).toBe(godBefore.playerZ);
  expect(godAfter.openDoors).toBe(godBefore.openDoors);
  await page.screenshot({path:testInfo.outputPath('god-view.png'),fullPage:true});

  await page.keyboard.press('KeyG');
  await expect.poll(async()=>(await runtime(page)).cameraMode).toBe('firstPerson');
  expect((await runtime(page)).physicsBodies).toBe(godAfter.physicsBodies+1);
  expect(pageErrors).toEqual([]);
});
