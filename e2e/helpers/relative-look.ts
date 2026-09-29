import { expect, type Page } from '@playwright/test';

// Headless pointer lock does not reliably convert out-of-viewport absolute mouse
// coordinates to the requested deltas. Dispatch relative DOM mouse input through
// PointerLockControls' normal listener; never mutate a camera or game action directly.
// Native click acquires pointer lock, and E/menu clicks remain native Playwright input.
export async function lookForObject(page:Page,title:string,yaw:number,pitch:number) {
  await expect.poll(()=>page.evaluate(()=>document.pointerLockElement?.tagName)).toBe('CANVAS');
  const canvas=page.locator('#game canvas');
  await canvas.dispatchEvent('mousemove',{movementX:yaw/.002,movementY:0});
  for(const adjustment of [0,.10,-.10,.20,-.20]){
    const downward=Math.max(.1,Math.min(1.4,pitch+adjustment));
    // Calibrate using the controller's ordinary pitch limit, then look back up to the
    // intended elevation. This also accommodates the initial OrbitControls look angle.
    await canvas.dispatchEvent('mousemove',{movementX:0,movementY:2000});
    await canvas.dispatchEvent('mousemove',{movementX:0,movementY:(downward-Math.PI/2)/.002});
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    if((await page.locator('#prompt').innerText()).includes(title))return;
  }
  await expect(page.locator('#prompt')).toContainText(title,{timeout:5_000});
}
