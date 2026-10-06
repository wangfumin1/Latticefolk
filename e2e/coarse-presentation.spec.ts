import { test, expect, type Page } from '@playwright/test';
import {setTimeout as wait} from 'node:timers/promises';
import { startFirstPerson } from './helpers/native-start.js';
import { captureLocaleDom, readLocaleDom } from './helpers/locale-dom.js';
import {driveNativeWaypoint} from './helpers/native-waypoint.js';
import type {CoarseChunkState,WorldPersistenceSnapshot} from '../src/types.js';

interface StreamedLayoutView {
  unitId:string;bounds:{minX:number;maxX:number;minZ:number;maxZ:number};fineOwners:string[];
  entities:{id:string;ownerCellId:string;kind:string;visible:boolean;meshes:number;primitiveMeshes:number;position:{x:number;z:number}}[];
}
const layoutViews=(page:Page)=>page.evaluate(()=>JSON.parse(document.querySelector<HTMLElement>('#worldStatus')?.dataset.streamedLayouts??'[]') as StreamedLayoutView[]);
const numberStatus=async(page:Page,name:string)=>Number(await page.locator('#worldStatus').getAttribute(name));

// Read only presentation and existing diagnostic DOM; never mutate game state.
const readView=(page:Page,includeLayouts=true)=>page.evaluate(includeLayouts=>{
  const shown=(id:string)=>{
    const element=document.getElementById(id);
    if(!element)throw new Error(`Missing HUD element: ${id}`);
    return getComputedStyle(element).display!=='none';
  };
  const status=document.querySelector<HTMLElement>('#worldStatus');
  if(!status)throw new Error('Missing worldStatus');
  return {
    layouts:includeLayouts?JSON.parse(status.dataset.streamedLayouts??'[]') as StreamedLayoutView[]:[],
    discovered:Number(status.getAttribute('data-discovered-chunks')),
    materialized:Number(status.getAttribute('data-materialized-chunks')),
    hud:{diagnostics:['decisionStatus','worldStatus'].map(shown),
    player:['clock','inventory','prompt'].map(shown),
    console:shown('admin'),
    playerLogOnly:document.querySelectorAll('#log > [data-log-audience="developer"]').length===0,
    mode:status.dataset.cameraMode}
  };
},includeLayouts);
const hudView=async(page:Page)=>(await readView(page,false)).hud;

test('72m streamed layouts use sourced assets and God camera does not discover or materialize chunks',async({page},info)=>{
  test.setTimeout(180_000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>localStorage.setItem('latticefolk.locale','en'));
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#game canvas')).toBeVisible();
  await expect(page.locator('#worldStatus')).toHaveAttribute('data-asset-failures','0',{timeout:45_000});
  let ready:Awaited<ReturnType<typeof readView>>|undefined;
  await expect.poll(async()=>{
    ready=await readView(page);
    return ready.layouts.length>0&&ready.layouts.every(layout=>layout.entities.every(entity=>entity.meshes>0));
  },{timeout:45_000}).toBe(true);
  const before=ready!.layouts;
  expect(before.length).toBe(8);
  expect(before.every(layout=>layout.bounds.maxX-layout.bounds.minX===72&&layout.bounds.maxZ-layout.bounds.minZ===72)).toBe(true);
  const entities=before.flatMap(layout=>layout.entities);
  expect(new Set(entities.map(entity=>entity.id)).size).toBe(entities.length);
  expect(entities.filter(entity=>entity.kind!=='road').every(entity=>entity.primitiveMeshes===0)).toBe(true);
  expect(entities.some(entity=>entity.kind==='building')).toBe(true);
  expect(entities.some(entity=>['tree','bush','rock','flower'].includes(entity.kind))).toBe(true);
  await startFirstPerson(page);
  await expect.poll(()=>hudView(page)).toEqual({diagnostics:[false,false],player:[true,true,true],console:false,playerLogOnly:true,mode:'firstPerson'});
  await info.attach('first-person-clean-hud',{body:await page.screenshot(),contentType:'image/png'});
  // Tab reveals the same live diagnostics without changing camera or world state.
  await page.keyboard.press('Tab');
  await expect.poll(()=>hudView(page)).toMatchObject({diagnostics:[true,true],player:[true,true,true],console:true,mode:'firstPerson'});
  await page.keyboard.press('Tab');
  let settled:Awaited<ReturnType<typeof readView>>|undefined;
  await expect.poll(async()=>{settled=await readView(page);return settled.hud;}).toEqual({diagnostics:[false,false],player:[true,true,true],console:false,playerLogOnly:true,mode:'firstPerson'});
  const {discovered,materialized}=settled!;

  await page.keyboard.press('KeyG');
  await expect(page.locator('#worldStatus')).toHaveAttribute('data-camera-mode','god');
  await expect.poll(()=>hudView(page)).toMatchObject({diagnostics:[true,true],player:[true,true,true],console:false,mode:'god'});
  // Refresh observer labels in place without returning the player to the world.
  const observerReference=await page.evaluateHandle(captureLocaleDom,-1);
  await page.locator('#localeSelect').selectOption('ja');
  await expect.poll(()=>page.evaluate(readLocaleDom,observerReference)).toMatchObject({
    lang:'ja',modeHint:'観察者',mode:'god',playerBody:'false',sameCanvas:true,discovered,materialized
  });
  await info.attach('god-view-language-ja',{body:await page.screenshot(),contentType:'image/png'});
  await expect.poll(()=>page.evaluate(readLocaleDom,observerReference)).toMatchObject({mode:'god',playerBody:'false'});
  await page.locator('#localeSelect').selectOption('en');
  await expect.poll(()=>page.evaluate(readLocaleDom,observerReference)).toMatchObject({
    lang:'en',modeHint:'Observer',mode:'god',playerBody:'false',sameCanvas:true,discovered,materialized
  });
  await observerReference.dispose();
  const canvas=page.locator('#game canvas');
  const box=await canvas.boundingBox();expect(box).not.toBeNull();
  await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);
  for(let i=0;i<5;i++){await page.mouse.wheel(0,900);await wait(100);}
  await wait(700);
  await info.attach('streamed-sourced-layouts-god',{body:await page.screenshot(),contentType:'image/png'});

  const afterView=await readView(page);
  expect(afterView.discovered).toBe(discovered);
  expect(afterView.materialized).toBe(materialized);
  const after=afterView.layouts;
  expect(after).toEqual(before);
  await page.keyboard.press('KeyG');
  await expect.poll(()=>hudView(page)).toEqual({diagnostics:[false,false],player:[true,true,true],console:false,playerLogOnly:true,mode:'firstPerson'});
  expect(errors).toEqual([]);
});


test('ordinary walking crosses the home edge into the visible layout and preserves it through return and reload',async({page,request},info)=>{
  test.setTimeout(180_000);
  const reset=await request.delete('/api/world/state');expect(reset.ok()).toBe(true);
  const {revision}=await reset.json();
  const cells:CoarseChunkState[]=[];
  for(let cz=-1;cz<=1;cz++)for(let cx=2;cx<=4;cx++)cells.push({id:`chunk_${cx}_${cz}`,cx,cz,biome:'plains',settlementLevel:2,population:0,
    food:65,wood:50,water:60,ecology:55,danger:10,prosperity:65,strategy:'trade_route',migrationPolicy:'retain',ecologyPolicy:'balance',lastDecisionAt:0,decisionVersion:0,wildlife:[]});
  const snapshot:WorldPersistenceSnapshot={version:1,meta:{day:1,minuteOfDay:495,weather:'clear',weatherEpoch:1,playerPosition:{x:34,z:0},
    playerInventory:{apple:0,bread:1,wood:0,coin:10,flower:0,grain:0,flour:0,water:0,stone:0,plank:0,tool:0}},coarseChunks:cells,fineChunks:[],homeNpcs:[],homeObjects:[]};
  const seed=await request.post('/api/world/state',{data:{snapshot,expectedRevision:revision}});expect(seed.ok()).toBe(true);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.addInitScript(()=>localStorage.setItem('latticefolk.locale','en'));
    await page.goto('/',{waitUntil:'domcontentloaded'});
    await expect(page.locator('#worldStatus')).toHaveAttribute('data-asset-failures','0',{timeout:45_000});
    await expect.poll(async()=>{const unit=(await layoutViews(page)).find(x=>x.unitId==='unit_1_0');return Boolean(unit?.entities.every(x=>x.meshes>0));},{timeout:45_000}).toBe(true);
    const before=(await layoutViews(page)).find(x=>x.unitId==='unit_1_0')!;
    expect(before.bounds).toEqual({minX:36,maxX:108,minZ:-36,maxZ:36});expect(before.fineOwners).toEqual([]);
    await startFirstPerson(page);
    const enter=await page.evaluate(driveNativeWaypoint,{target:{x:40,z:0},timeoutMs:10_000,tolerance:.3});expect(enter.reached).toBe(true);
    const entered=(await layoutViews(page)).find(x=>x.unitId==='unit_1_0')!;
    expect(entered.entities).toEqual(before.entities);expect(entered.fineOwners).toEqual(['chunk_2_0']);
    expect(await numberStatus(page,'data-player-grounding-error')).toBeLessThan(.001);
    await info.attach('streamed-layout-entered',{body:await page.screenshot(),contentType:'image/png'});
    const leave=await page.evaluate(driveNativeWaypoint,{target:{x:34,z:0},timeoutMs:10_000,tolerance:.3});expect(leave.reached).toBe(true);
    expect((await layoutViews(page)).find(x=>x.unitId==='unit_1_0')).toEqual(before);
    await expect.poll(async()=>{const response=await request.get('/api/world/state');const data=await response.json();return data.snapshot?.streamedLayouts?.some((layout:any)=>layout.unit.id==='unit_1_0')===true;},{timeout:45_000}).toBe(true);
    const persisted=await (await request.get('/api/world/state')).json();
    const savedLayout=persisted.snapshot.streamedLayouts.find((layout:any)=>layout.unit.id==='unit_1_0');
    expect(savedLayout.unit.bounds).toEqual(before.bounds);
    expect([...savedLayout.buildings,...savedLayout.roads,...savedLayout.objects].map(x=>x.id).sort()).toEqual(before.entities.map(x=>x.id).sort());
    await page.reload();await expect.poll(async()=>{const unit=(await layoutViews(page)).find(x=>x.unitId==='unit_1_0');return unit?.entities.every(x=>x.meshes>0)===true;},{timeout:45_000}).toBe(true);
    expect((await layoutViews(page)).find(x=>x.unitId==='unit_1_0')!.entities).toEqual(before.entities);
    const reloaded=await (await request.get('/api/world/state')).json();
    expect(reloaded.snapshot.streamedLayouts.find((layout:any)=>layout.unit.id==='unit_1_0')).toEqual(savedLayout);
    await info.attach('streamed-layout-saved-and-reloaded',{body:Buffer.from(JSON.stringify({before,entered,enter,leave,savedLayout},null,2)),contentType:'application/json'});
    expect(errors).toEqual([]);
  }finally{await page.close();const clear=await request.delete('/api/world/state');expect(clear.ok()).toBe(true);}
});
