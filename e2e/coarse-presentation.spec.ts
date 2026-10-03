import { test, expect, type Page } from '@playwright/test';
import { startFirstPerson } from './helpers/native-start.js';

interface CoarseMarkerView {
  chunkId:string;asset:string;kind:string;visible:boolean;resolved:boolean;meshes:number;primitiveMeshes:number;
}
const markerViews=(page:Page)=>page.evaluate(()=>JSON.parse(document.querySelector<HTMLElement>('#worldStatus')?.dataset.coarseMarkers??'[]') as CoarseMarkerView[]);
const numberStatus=async(page:Page,name:string)=>Number(await page.locator('#worldStatus').getAttribute(name));

// Read only presentation and existing diagnostic DOM; never mutate game state.
const hudView=(page:Page)=>page.evaluate(()=>{
  const shown=(id:string)=>{
    const element=document.getElementById(id);
    if(!element)throw new Error(`Missing HUD element: ${id}`);
    return getComputedStyle(element).display!=='none';
  };
  return {
    diagnostics:['decisionStatus','worldStatus'].map(shown),
    player:['clock','inventory','prompt'].map(shown),
    console:shown('admin'),
    playerLogOnly:document.querySelectorAll('#log > [data-log-audience="developer"]').length===0,
    mode:document.querySelector<HTMLElement>('#worldStatus')?.dataset.cameraMode
  };
});

test('normal coarse markers use sourced assets and God camera does not discover or materialize chunks',async({page},info)=>{
  test.setTimeout(180_000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>localStorage.setItem('latticefolk.locale','en'));
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#game canvas')).toBeVisible();
  await expect(page.locator('#worldStatus')).toHaveAttribute('data-asset-failures','0',{timeout:45_000});
  await expect.poll(async()=>{
    const markers=await markerViews(page);
    return markers.length>0&&markers.every(marker=>marker.resolved&&marker.meshes>0);
  },{timeout:45_000}).toBe(true);
  const before=await markerViews(page);
  expect(before.every(marker=>marker.primitiveMeshes===0)).toBe(true);
  expect(before.some(marker=>marker.kind==='settlement'&&marker.asset==='townCenter')).toBe(true);
  expect(before.some(marker=>marker.kind==='wilderness'&&['tree2','tree3','bush','rock'].includes(marker.asset))).toBe(true);
  await startFirstPerson(page);
  await expect.poll(()=>hudView(page)).toEqual({diagnostics:[false,false],player:[true,true,true],console:false,playerLogOnly:true,mode:'firstPerson'});
  await info.attach('first-person-clean-hud',{body:await page.screenshot(),contentType:'image/png'});
  // Tab reveals the same live diagnostics without changing camera or world state.
  await page.keyboard.press('Tab');
  await expect.poll(()=>hudView(page)).toMatchObject({diagnostics:[true,true],player:[true,true,true],console:true,mode:'firstPerson'});
  await page.keyboard.press('Tab');
  await expect.poll(()=>hudView(page)).toEqual({diagnostics:[false,false],player:[true,true,true],console:false,playerLogOnly:true,mode:'firstPerson'});
  const discovered=await numberStatus(page,'data-discovered-chunks');
  const materialized=await numberStatus(page,'data-materialized-chunks');

  await page.keyboard.press('KeyG');
  await expect(page.locator('#worldStatus')).toHaveAttribute('data-camera-mode','god');
  await expect.poll(()=>hudView(page)).toMatchObject({diagnostics:[true,true],player:[true,true,true],console:false,mode:'god'});
  const canvas=page.locator('#game canvas');
  const box=await canvas.boundingBox();expect(box).not.toBeNull();
  await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);
  for(let i=0;i<5;i++){await page.mouse.wheel(0,900);await page.waitForTimeout(100);}
  await page.waitForTimeout(700);
  await info.attach('coarse-sourced-markers-god',{body:await page.screenshot(),contentType:'image/png'});

  expect(await numberStatus(page,'data-discovered-chunks')).toBe(discovered);
  expect(await numberStatus(page,'data-materialized-chunks')).toBe(materialized);
  const after=await markerViews(page);
  expect(after.map(marker=>[marker.chunkId,marker.asset,marker.kind,marker.primitiveMeshes])).toEqual(
    before.map(marker=>[marker.chunkId,marker.asset,marker.kind,marker.primitiveMeshes])
  );
  await page.keyboard.press('KeyG');
  await expect.poll(()=>hudView(page)).toEqual({diagnostics:[false,false],player:[true,true,true],console:false,playerLogOnly:true,mode:'firstPerson'});
  expect(errors).toEqual([]);
});
