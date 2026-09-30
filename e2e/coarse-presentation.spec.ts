import { test, expect, type Page } from '@playwright/test';

interface CoarseMarkerView {
  chunkId:string;asset:string;kind:string;visible:boolean;resolved:boolean;meshes:number;primitiveMeshes:number;
}
const markerViews=(page:Page)=>page.evaluate(()=>JSON.parse(document.querySelector<HTMLElement>('#worldStatus')?.dataset.coarseMarkers??'[]') as CoarseMarkerView[]);
const numberStatus=async(page:Page,name:string)=>Number(await page.locator('#worldStatus').getAttribute(name));

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
  const discovered=await numberStatus(page,'data-discovered-chunks');
  const materialized=await numberStatus(page,'data-materialized-chunks');

  await page.keyboard.press('KeyG');
  await expect(page.locator('#worldStatus')).toHaveAttribute('data-camera-mode','god');
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
  expect(errors).toEqual([]);
});
