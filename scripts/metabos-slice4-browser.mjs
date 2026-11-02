/** Slice 4 E2E: favorite, reload, role preference, use template -> draft. Use a disposable MUZEBOS_DB. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:4100';
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[];
const state=async page=>(await page.request.get(base+'/api/brain-templates')).json();
for (const [i,vp] of [{name:'desktop',width:1440,height:1000},{name:'mobile',width:390,height:844}].entries()) {
 const page=await browser.newPage({viewport:vp});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const ready=async()=>{await page.getByRole('heading',{name:'Founder templates',exact:true}).waitFor();await page.getByText('Loading templates…').waitFor({state:'hidden'});};
 await page.goto(base+'/workspace/brain/templates',{waitUntil:'networkidle'});await ready();
 const name=i===0?'Unit economics':'Operations runbook';
 assert.equal(await page.locator('article[data-template]').count()>=12,true,'12 templates rendered');
 const favs=page.getByRole('region',{name:'Favorites'});
 await page.getByRole('button',{name:`Favorite ${name}`}).first().click();
 await page.getByRole('status').filter({hasText:`${name} added to favorites.`}).waitFor();
 await page.getByLabel('Your role').selectOption(i===0?'finance':'operations');
 await page.getByRole('status').filter({hasText:'Role set to'}).waitFor();
 await page.reload({waitUntil:'networkidle'});await ready();
 await favs.getByRole('heading',{name}).waitFor();
 assert.equal(await favs.getByRole('button',{name:`Favorite ${name}`}).getAttribute('aria-pressed'),'true');
 assert.equal(await page.getByLabel('Your role').inputValue(),i===0?'finance':'operations');
 await page.getByRole('heading',{name:i===0?'Recommended for Finance':'Recommended for Operations'}).waitFor();
 const before=await state(page);
 await favs.getByRole('button',{name:`Use template: ${name}`}).click();
 await page.getByRole('status').filter({hasText:`Draft created from ${name}. Nothing was sent or run.`}).waitFor();
 await page.reload({waitUntil:'networkidle'});await ready();
 const drafts=page.getByRole('region',{name:'Drafts'});
 await drafts.getByText(`${name} draft`).first().waitFor();
 const after=await state(page);
 assert.equal(after.drafts.length,before.drafts.length+1);assert.equal(after.drafts[0].status,'draft');
 const biz=await (await page.request.get(base+'/api/business')).json();
 assert.equal(biz.invoices.length+biz.orders.length,0,'use template created no orders/invoices');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`${vp.name} overflow`);
 if(process.env.TEST_SCREENSHOT_DIR)await page.screenshot({path:`${process.env.TEST_SCREENSHOT_DIR}/slice4-${vp.name}.png`,fullPage:true});
 assert.deepEqual(errors,[]);results.push(vp.name);await page.close();
}
await browser.close();
console.log(JSON.stringify({result:'PASS',viewports:results,checks:['12 templates','favorite','role preference','persist after reload','use template -> draft','draft persists after reload','no orders/invoices created','no overflow','no page errors']}));
