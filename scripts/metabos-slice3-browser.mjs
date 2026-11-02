/** Slice 3 E2E: issuance integrity through the real UI and API. Use a disposable MUZEBOS_DB. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:4100';
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[];
for (const vp of [{name:'desktop',width:1440,height:1000},{name:'mobile',width:390,height:844}]) {
 const page=await browser.newPage({viewport:vp});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const sfx=`${vp.name}-${Date.now()}`;
 const tab=async n=>page.getByRole('navigation',{name:'Business views'}).getByRole('button',{name:n,exact:true}).click();
 const post=(body,key=randomUUID())=>page.request.post(base+'/api/business',{data:body,headers:{'idempotency-key':key,origin:base}});
 await page.goto(base+'/business',{waitUntil:'networkidle'});await page.getByText('Opening your local workspace…').waitFor({state:'hidden'});
 await tab('customers');await page.getByLabel('Customer name',{exact:true}).fill(`S3 ${sfx}`);await page.getByRole('button',{name:'Save customer',exact:true}).click();await page.getByRole('status').filter({hasText:'Record saved.'}).waitFor();
 await tab('inventory');await page.getByLabel('Product name',{exact:true}).fill(`Tea ${sfx}`);await page.getByLabel('SKU',{exact:true}).fill(`S3-${sfx}`);await page.getByLabel('Unit price (INR)').fill('100.10');await page.getByLabel('Tax rate (%)').fill('18');await page.getByLabel('Opening stock').fill('5');await page.getByRole('button',{name:'Save product',exact:true}).click();await page.getByRole('status').filter({hasText:'Record saved.'}).waitFor();
 await tab('orders');
 const draftOne=async()=>{const c=page.getByLabel('Customer',{exact:true});await c.selectOption(await c.getByRole('option',{name:`S3 ${sfx}`,exact:true}).getAttribute('value'));const p=page.getByLabel('Product',{exact:true});await p.selectOption(await p.getByRole('option').filter({hasText:`S3-${sfx}`}).getAttribute('value'));await page.getByLabel('Quantity',{exact:true}).fill('4');await page.getByRole('button',{name:'Create draft for review'}).click();await page.getByRole('status').filter({hasText:'Draft ready for review'}).waitFor();};
 await draftOne();await draftOne();
 const drafts=page.locator('.mb-order').filter({hasText:`S3 ${sfx}`});assert.equal(await drafts.count(),2);
 assert.match(await drafts.first().innerText(),/472\.47/); // 4 x 100.10 = 400.40 + 18% (72.072 -> 72.07) in paise
 await drafts.nth(0).getByRole('button',{name:'Approve & issue'}).click();await page.getByRole('status').filter({hasText:'Invoice issued'}).waitFor();
 // Second draft for the same 4 units: stock (1 left) is rechecked inside the transaction.
 await page.locator('.mb-order').filter({hasText:`S3 ${sfx}`}).filter({hasText:'awaiting review'}).getByRole('button',{name:'Approve & issue'}).click();
 await page.getByText(/Stock changed: Tea .*No invoice issued\./).first().waitFor();
 // Replay with the same idempotency key returns the original invoice, not a second one.
 const state=await (await page.request.get(base+'/api/business')).json();
 const pending=state.orders.find(o=>o.status==='awaiting_review'&&o.payload.customer.name===`S3 ${sfx}`);
 const key=randomUUID();
 const r1=await post({action:'reject',id:pending.id},key);const r2=await post({action:'reject',id:pending.id},key);
 assert.equal(r1.status(),200);assert.deepEqual(await r2.json(),await r1.json());
 const tampered=await post({action:'approve',id:pending.id,hash:'0'.repeat(64)});assert.equal(tampered.status(),409,await tampered.text());
 await page.reload({waitUntil:'networkidle'});await tab('inventory');
 assert.match(await page.locator('.mb-row').filter({hasText:`S3-${sfx}`}).innerText(),/1 IN STOCK/);
 await tab('invoices');assert.equal(await page.locator('.mb-order').filter({hasText:`S3 ${sfx}`}).count(),1);
 await tab('evidence');await page.getByText('HASH CHAIN VERIFIED',{exact:true}).waitFor();assert.match(await page.locator('.mb-panel').innerText(),/approval\.granted/);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`${vp.name} overflow`);
 if(process.env.TEST_SCREENSHOT_DIR)await page.screenshot({path:`${process.env.TEST_SCREENSHOT_DIR}/slice3-${vp.name}.png`,fullPage:true});
 assert.deepEqual(errors,[]);results.push(vp.name);await page.close();
}
await browser.close();
console.log(JSON.stringify({result:'PASS',viewports:results,checks:['approve & issue','integer paise totals','stock recheck refuses oversell','idempotent replay identical','mismatched hash 409','stock persisted after reload','single invoice','approval.granted evidence','hash chain verified','no overflow','no page errors']}));
