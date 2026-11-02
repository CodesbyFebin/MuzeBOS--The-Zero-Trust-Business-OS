/** Slice 5 E2E: empty state, record a WhatsApp-channel draft via the UI, issue it, check analytics + CSV. Use a disposable MUZEBOS_DB. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:4100';
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[];
for (const [i,vp] of [{name:'desktop',width:1440,height:1000},{name:'mobile',width:390,height:844}].entries()) {
 const page=await browser.newPage({viewport:vp,acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const ready=async()=>{await page.getByRole('heading',{name:'Business analytics'}).waitFor();await page.locator('[data-kpi="Invoices"]').waitFor();};
 const kpi=async n=>(await page.locator(`[data-kpi="${n}"] strong`).innerText()).trim();
 const before=await (await page.request.get(base+'/api/analytics')).json();
 if(i===0){await page.goto(base+'/workspace/growth/analytics',{waitUntil:'networkidle'});await ready();assert.equal(before.empty,true);await page.getByRole('note').filter({hasText:'No invoices or order drafts'}).waitFor();assert.equal(await kpi('Average order value'),'Unavailable');}
 const sfx=`${vp.name}-${Date.now()}`;
 const tab=async n=>page.getByRole('navigation',{name:'Business views'}).getByRole('button',{name:n,exact:true}).click();
 await page.goto(base+'/business',{waitUntil:'networkidle'});await page.getByText('Opening your local workspace…').waitFor({state:'hidden'});
 await tab('customers');await page.getByLabel('Customer name',{exact:true}).fill(`S5 ${sfx}`);await page.getByRole('button',{name:'Save customer',exact:true}).click();await page.getByRole('status').filter({hasText:'Record saved.'}).waitFor();
 await tab('inventory');await page.getByLabel('Product name',{exact:true}).fill(`Tea ${sfx}`);await page.getByLabel('SKU',{exact:true}).fill(`S5-${sfx}`);await page.getByLabel('Unit price (INR)').fill('100');await page.getByLabel('Tax rate (%)').fill('0');await page.getByLabel('Opening stock').fill('5');await page.getByRole('button',{name:'Save product',exact:true}).click();await page.getByRole('status').filter({hasText:'Record saved.'}).waitFor();
 await tab('orders');
 const c=page.getByLabel('Customer',{exact:true});await c.selectOption(await c.getByRole('option',{name:`S5 ${sfx}`,exact:true}).getAttribute('value'));
 const p=page.getByLabel('Product',{exact:true});await p.selectOption(await p.getByRole('option').filter({hasText:`S5-${sfx}`}).getAttribute('value'));
 await page.getByLabel('Quantity',{exact:true}).fill('2');await page.getByLabel('Channel',{exact:true}).selectOption('whatsapp');
 await page.getByRole('button',{name:'Create draft for review'}).click();await page.getByRole('status').filter({hasText:'Draft ready for review'}).waitFor();
 await page.locator('.mb-order').filter({hasText:`S5 ${sfx}`}).getByRole('button',{name:'Approve & issue'}).click();await page.getByRole('status').filter({hasText:'Invoice issued'}).waitFor();
 await page.goto(base+'/workspace/growth/analytics',{waitUntil:'networkidle'});await ready();
 const a=await (await page.request.get(base+'/api/analytics')).json();
 assert.equal(a.kpis.invoices,before.kpis.invoices+1);assert.equal(a.kpis.issuedRevenue,before.kpis.issuedRevenue+20000);
 assert.equal(await kpi('Invoices'),String(a.kpis.invoices));
 assert.ok(a.channels.some(x=>x.channel==='whatsapp'),'whatsapp channel recorded');
 await page.getByRole('region',{name:'Channel distribution'}).getByText('WhatsApp').waitFor();
 for(const m of ['Profit','ROAS','Cash flow'])await page.locator(`[data-metric="${m}"]`).getByText('Unavailable').waitFor();
 // Future-only range filters everything out.
 await page.getByLabel('From date').fill('2099-01-01');await page.getByRole('note').filter({hasText:'No invoices or order drafts'}).waitFor();assert.equal(await kpi('Invoices'),'0');
 await page.getByRole('button',{name:'All time'}).click();await page.waitForFunction(()=>document.querySelector('[data-kpi="Invoices"] strong')?.textContent!=='0');
 const [dl]=await Promise.all([page.waitForEvent('download'),page.getByRole('link',{name:'Export CSV'}).click()]);
 const csv=await (await import('node:fs')).promises.readFile(await dl.path(),'utf8');
 assert.ok(csv.startsWith('invoice,date,customer,channel'));assert.match(csv,new RegExp(`S5 ${sfx},whatsapp,200\\.00,0\\.00,200\\.00,pending`));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`${vp.name} overflow`);
 if(process.env.TEST_SCREENSHOT_DIR)await page.screenshot({path:`${process.env.TEST_SCREENSHOT_DIR}/slice5-${vp.name}.png`,fullPage:true});
 assert.deepEqual(errors,[]);results.push(vp.name);await page.close();
}
await browser.close();
console.log(JSON.stringify({result:'PASS',viewports:results,checks:['empty state','channel select on draft','issued invoice reflected in KPIs','whatsapp channel','profit/ROAS/cash flow unavailable','range filter','CSV export','no overflow','no page errors']}));
