import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import type { CoarseChunkState, WorldPersistenceSnapshot } from '../src/types.js';
import { WATER_PATCH_ASSET, WATER_PATCH_DEPTH, WATER_PATCH_SURFACE_Y, WATER_PATCH_WIDTH } from '../src/scene/waterPatch.js';
import { startFirstPerson } from './helpers/native-start.js';
import { lookForObject } from './helpers/relative-look.js';

interface WaterView {
  id:string;chunkId:string|null;name:string;position:{x:number;z:number};asset?:string;
  resolved:boolean;resolvedSize:{x:number;y:number;z:number}|null;surfaceY:number;
  meshes:number;primitives:number;materials:number;maxMetalness:number;minWaterLuminance:number;capabilities:string[];resourceAmount:number|null;
}
const chunk:CoarseChunkState={
  id:'chunk_2_0',cx:2,cz:0,biome:'plains',settlementLevel:0,population:0,
  food:50,wood:50,water:90,ecology:60,danger:5,prosperity:10,
  strategy:'sustain',migrationPolicy:'retain',ecologyPolicy:'balance',lastDecisionAt:0,decisionVersion:0
};
const inventory=()=>({apple:0,bread:0,wood:0,coin:10,flower:0,grain:0,flour:0,water:0,stone:0,plank:0,tool:0});

async function seed(request:APIRequestContext){
  const reset=await request.delete('/api/world/state');expect(reset.ok()).toBe(true);
  const revision=(await reset.json() as {revision:number}).revision;
  const snapshot:WorldPersistenceSnapshot={
    version:1,
    meta:{day:1,minuteOfDay:495,weather:'clear',playerPosition:{x:52.8,z:5.4},playerInventory:inventory()},
    coarseChunks:[chunk],fineChunks:[],homeNpcs:[],homeObjects:[]
  };
  const response=await request.post('/api/world/state',{data:{expectedRevision:revision,snapshot}});
  expect(response.ok()).toBe(true);
  return (await response.json() as {revision:number}).revision;
}
async function water(page:Page):Promise<WaterView[]>{
  return page.evaluate(()=>JSON.parse(document.querySelector<HTMLElement>('#worldStatus')?.dataset.waterPatches??'[]'));
}
async function saved(request:APIRequestContext){
  const response=await request.get('/api/world/state');expect(response.ok()).toBe(true);
  return response.json() as Promise<{revision:number;snapshot:WorldPersistenceSnapshot}>;
}

test.afterEach(async({page,request})=>{
  await page.close();
  const reset=await request.delete('/api/world/state');expect(reset.ok()).toBe(true);
});

test('streamed natural water uses the sourced Kenney surface and keeps first-person water interaction after reload',async({page,request},info)=>{
  test.setTimeout(240_000);
  const seedRevision=await seed(request);
  const pageErrors:string[]=[];page.on('pageerror',error=>pageErrors.push(error.message));
  await page.addInitScript(()=>localStorage.setItem('latticefolk.locale','en'));
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#game canvas')).toBeVisible();
  await expect(page.locator('#worldStatus')).toHaveAttribute('data-asset-failures','0',{timeout:45_000});
  await expect.poll(async()=>Number(await page.locator('#worldStatus').getAttribute('data-materialized-chunks')),{timeout:45_000}).toBeGreaterThan(0);
  await expect.poll(async()=>{const list=await water(page);return list.length===1&&list[0]!.resolved&&list[0]!.meshes>0;},{timeout:45_000}).toBe(true);

  const before=(await water(page))[0]!;
  expect(before.chunkId).toBe(chunk.id);
  expect(before.name).toBe('自然水洼');
  expect(before.position.x).toBeCloseTo(53.8,8);expect(before.position.z).toBeCloseTo(5.4,8);
  expect(before.asset).toBe(WATER_PATCH_ASSET);
  expect(before.primitives).toBe(0);
  expect(before.materials).toBeGreaterThan(0);
  expect(before.maxMetalness).toBe(0);
  expect(before.minWaterLuminance).toBeGreaterThan(.7);
  expect(before.resolvedSize!.x).toBeCloseTo(WATER_PATCH_WIDTH,5);
  expect(before.resolvedSize!.z).toBeCloseTo(WATER_PATCH_DEPTH,5);
  expect(before.resolvedSize!.y).toBeLessThan(1e-5);
  expect(before.surfaceY).toBeCloseTo(WATER_PATCH_SURFACE_Y,8);
  expect(before.capabilities).toEqual(['inspect','drink','draw_water','wash']);
  const sourceAmount=before.resourceAmount;

  await startFirstPerson(page);
  await lookForObject(page,before.name,Math.PI/2,.98);
  await info.attach('sourced-water-before-draw',{body:await page.screenshot(),contentType:'image/png'});
  await page.keyboard.press('KeyE');
  await expect(page.locator('#interactionTitle')).toHaveText(before.name);
  const actions=page.locator('#interactionActions button');await expect(actions).toHaveCount(4);
  await actions.nth(2).press('Enter');
  await expect(page.locator('#toast')).toContainText('打了一份井水');
  await expect.poll(async()=>{
    const state=await saved(request);
    return state.revision>seedRevision&&state.snapshot.meta.playerInventory.water===1;
  },{timeout:45_000}).toBe(true);
  const afterDraw=await saved(request);
  const persisted=afterDraw.snapshot.fineChunks.find(entry=>entry.chunkId===chunk.id)?.objectStates.find(object=>object.kind==='water_patch');
  expect(persisted?.resourceAmount).toBe(sourceAmount);

  await page.reload();await startFirstPerson(page);
  await expect.poll(async()=>{const list=await water(page);return list.length===1&&list[0]!.resolved;},{timeout:45_000}).toBe(true);
  const restored=(await water(page))[0]!;
  expect(restored.asset).toBe(WATER_PATCH_ASSET);expect(restored.primitives).toBe(0);
  expect(restored.maxMetalness).toBe(0);expect(restored.minWaterLuminance).toBeGreaterThan(.7);
  expect(restored.resolvedSize!.x).toBeCloseTo(WATER_PATCH_WIDTH,5);
  expect(restored.resolvedSize!.z).toBeCloseTo(WATER_PATCH_DEPTH,5);
  expect((await saved(request)).snapshot.meta.playerInventory.water).toBe(1);
  await lookForObject(page,restored.name,Math.PI/2,.98);
  await info.attach('sourced-water-after-reload',{body:await page.screenshot(),contentType:'image/png'});
  expect(pageErrors).toEqual([]);
});
