import { test, expect, type APIRequestContext } from '@playwright/test';
import type { WorldPersistenceSnapshot } from '../src/types.js';
import { I18n } from '../src/i18n.js';
import { captureLocaleDom, readLocaleDom } from './helpers/locale-dom.js';
import { lookForObject } from './helpers/relative-look.js';

// Fixtures set a legal saved starting position before boot. All subsequent targeting,
// menu selection and consequences use the unmodified playable client and input handlers.
const cases = [
  { name: 'bench-rest', title: '西侧长椅', position: {x:-4,z:4.05}, yaw: 0, pitch: .72, action: 2, count: 3, toast: '休息了一会儿', minutes: 15 },
  { name: 'bed-sleep', title: '公共休息铺', position: {x:7,z:7.9}, yaw: Math.PI, pitch: .72, action: 2, count: 3, toast: '睡了一小时', minutes: 60 },
  { name: 'market-buy', title: '集市摊位', position: {x:8,z:-9.7}, yaw: 0, pitch: .62, action: 1, count: 4, toast: '购买：面包', coin: 8, bread: 1 },
  { name: 'workbench-work', title: '工坊工作台', position: {x:-20,z:5.9}, yaw: Math.PI, pitch: .62, action: 1, count: 3, toast: '完成一轮工作', coin: 12 },
  { name: 'farm-harvest', title: '南侧农田', position: {x:-22,z:-8.95}, yaw: 0, pitch: .80, action: 1, count: 3, toast: '获得：', grain: 1 }
] as const;

async function savedWorld(request:APIRequestContext) {
  const response = await request.get('/api/world/state');
  expect(response.ok()).toBe(true);
  return response.json() as Promise<{revision:number;snapshot:WorldPersistenceSnapshot|null}>;
}

// Close the browser before reset so an unload beacon cannot re-seed the next scenario.
// A single worker is mandatory while all playable files share this SQLite instance.
test.afterEach(async ({page,request})=>{
  await page.close();
  const response = await request.delete('/api/world/state');
  expect(response.ok()).toBe(true);
});

for (const scenario of cases) {
  test(`licensed furniture supports first-person ${scenario.name} and persistence`, async ({page,request},testInfo)=>{
    test.setTimeout(180_000);
    const pageErrors:string[] = [];
    page.on('pageerror',error=>pageErrors.push(error.message));
    const reset = await request.delete('/api/world/state');
    expect(reset.ok()).toBe(true);
    const resetState = await reset.json() as {revision:number};
    const seed:WorldPersistenceSnapshot = {
      version:1,
      meta:{
        day:1,minuteOfDay:495,weather:'clear',playerPosition:{...scenario.position},
        playerInventory:{apple:0,bread:0,wood:0,coin:10,flower:0,grain:0,flour:0,water:0,stone:0,plank:0,tool:0}
      },
      coarseChunks:[],fineChunks:[],homeNpcs:[],homeObjects:[]
    };
    const seedWrite = await request.post('/api/world/state',{data:{expectedRevision:resetState.revision,snapshot:seed}});
    expect(seedWrite.ok()).toBe(true);
    const seedAck = await seedWrite.json() as {revision:number};

    await page.addInitScript(()=>localStorage.setItem('latticefolk.locale','en'));
    await page.goto('/');
    const status = page.locator('#worldStatus');
    await expect(page.locator('#game canvas')).toBeVisible();
    await expect(status).toHaveAttribute('data-semantic-licensed-targets','8',{timeout:45_000});
    await expect(status).toHaveAttribute('data-semantic-licensed-resolved','8',{timeout:45_000});
    await expect(status).toHaveAttribute('data-semantic-primitive-meshes','0');
    await expect(status).toHaveAttribute('data-persistence-conflict','false');
    await expect.poll(async()=>Number(await status.getAttribute('data-persistence-revision'))).toBeGreaterThanOrEqual(seedAck.revision);

    await page.locator('#startBtn').click();
    await lookForObject(page,scenario.title,scenario.yaw,scenario.pitch,'world');
    await testInfo.attach(`${scenario.name}-target`,{body:await page.screenshot(),contentType:'image/png'});
    await page.keyboard.press('KeyE');
    await expect(page.locator('#interactionMenu')).not.toHaveClass(/hidden/);
    await expect(page.locator('#interactionTitle')).toHaveText(scenario.title);
    const actions = page.locator('#interactionActions button');
    await expect(actions).toHaveCount(scenario.count);
    if(scenario.name==='workbench-work'){
      // A locale change is a UI operation, not a new playable session. Keep the
      // actual open menu/buttons and the original action/persistence assertions.
      const reference=await page.evaluateHandle(captureLocaleDom,scenario.action);
      let navigations=0;const onNavigation=()=>{navigations++;};page.on('framenavigated',onNavigation);
      await page.locator('#localeSelect').focus();
      for(const locale of ['ja','es','zh-CN','en'] as const){
        await page.locator('#localeSelect').selectOption(locale);
        const language=new I18n(locale);
        // One coherent read retains every HUD and original menu/state assertion.
        await expect.poll(()=>page.evaluate(readLocaleDom,reference)).toMatchObject({
          inventory:`${language.t('hud.inventory')} 🍎0 🍞0 🪵0 🌾0 🥣0 💧0 🪵0 🪨0 🔧0 ◉10`,
          details:expect.stringMatching(new RegExp(`${language.t('hud.position')} .+${language.t('hud.tags')} .+${language.t('hud.interactions')} `)),
          title:scenario.title,focus:'localeSelect',
          lang:locale,actionText:language.t('interaction.work'),menuOpen:true,
          sameButtons:true,sameCanvas:true,samePosition:true,mode:'firstPerson'
        });
        if(locale==='ja'){
          await testInfo.attach('workbench-language-ja',{body:await page.screenshot(),contentType:'image/png'});
          await expect.poll(()=>page.evaluate(readLocaleDom,reference)).toMatchObject({menuOpen:true,sameButtons:true});
        }
      }
      page.off('framenavigated',onNavigation);expect(navigations).toBe(0);
      await expect.poll(()=>page.evaluate(readLocaleDom,reference)).toMatchObject({sameCanvas:true,samePosition:true,mode:'firstPerson',menuOpen:true,sameButtons:true});
      await reference.dispose();
      await testInfo.attach('workbench-language-switch-preserved-menu',{body:await page.screenshot(),contentType:'image/png'});
    }
    await actions.nth(scenario.action).click();
    await expect(page.locator('#toast')).toContainText(scenario.toast);

    // Require an ordinary acknowledged autosave containing the player's actual result.
    // The test never calls the action resolver or edits client state to obtain that result.
    await expect.poll(async()=>{
      const stored = await savedWorld(request);
      if(stored.revision<=seedAck.revision||!stored.snapshot)return false;
      const meta = stored.snapshot.meta;
      if('coin' in scenario && meta.playerInventory.coin!==scenario.coin)return false;
      if('bread' in scenario && meta.playerInventory.bread!==scenario.bread)return false;
      if('grain' in scenario && meta.playerInventory.grain!==scenario.grain)return false;
      if('minutes' in scenario && meta.day*1440+meta.minuteOfDay<1440+495+scenario.minutes)return false;
      return true;
    },{timeout:45_000}).toBe(true);
    const accepted = await savedWorld(request);
    await testInfo.attach(`${scenario.name}-accepted-state`,{
      body:Buffer.from(JSON.stringify({revision:accepted.revision,meta:accepted.snapshot!.meta},null,2)),
      contentType:'application/json'
    });
    await testInfo.attach(`${scenario.name}-result`,{body:await page.screenshot(),contentType:'image/png'});
    expect(pageErrors).toEqual([]);
  });
}
