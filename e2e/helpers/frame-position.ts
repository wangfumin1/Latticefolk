import { expect,type Page } from '@playwright/test';

/** Observe within Chromium's animation loop, without repeatedly resolving a locator
 * across a slow WebGL/CDP boundary. This only reads the existing diagnostic DOM.
 * The caller still supplies native keyboard input and releases it in finally.
 */
export async function waitForPlayerZBelow(page:Page,maxZ:number,timeout=20_000) {
  const handle=await page.waitForFunction(({maxZ})=>{
    const data=document.querySelector<HTMLElement>('#worldStatus')?.dataset;
    const x=Number(data?.playerX??'NaN'),z=Number(data?.playerZ??'NaN');
    return Number.isFinite(x)&&Number.isFinite(z)&&z<maxZ?{x,z,observedAt:performance.now()}:false;
  },{maxZ},{timeout,polling:'raf'});
  try {
    const sample=await handle.jsonValue();
    expect(sample).not.toBe(false);
    return sample;
  } finally {await handle.dispose();}
}
