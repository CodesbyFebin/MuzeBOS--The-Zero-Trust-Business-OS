/** Slice 7 E2E: governed low-stock -> reminder run (plan, approve hash, execute), denied model tool request, evidence explorer filters + export. Use a disposable MUZEBOS_DB. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:4100';
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[];
for (const vp of [{name:'desktop',width:1440,height:1000},{name:'mobile',width:390,height:844}]) {
 const page=await browser.newPage({viewport:vp,acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const post=(url,body)=>page.request.post(base+url,{data:body,headers:{'idempotency-key':randomUUID(),origin:base}});
 const sfx=`${vp.name}-${Date.now()}`;
 assert.equal((await post('/api/business',{action:'product',data:{name:`Low ${sfx}`,sku:`L-${sfx}`,price:100,taxBps:0,stock:1}})).status(),200);
 await page.goto(base+'/workflows?view=governed',{waitUntil:'networkidle'});
 await page.getByRole('heading',{name:'Governed workflows'}).waitFor();
 for(const t of ['Trigger','Permissions','Permitted tools','Approval','Idempotency','Retry','Timeout','Compensation'])await page.locator('.mb-defs dt',{hasText:t}).first().waitFor();
 await page.getByLabel('Stock threshold').fill('1');await page.getByRole('button',{name:'Plan run'}).click();
 await page.getByRole('status').filter({hasText:'Run planned'}).waitFor();
 const run=page.locator('[data-run][data-status="awaiting_approval"]').filter({hasText:`L-${sfx}`}).first();await run.waitFor();
 const runId=await run.getAttribute('data-run');
 // Model asks for a tool + permission it was never granted: denied and recorded.
 const deny=await (await post('/api/workflow-runs',{action:'requestTool',id:runId,tool:'messages.send',permissions:['messages.send']})).json();
 assert.equal(deny.allowed,false);assert.deepEqual(deny.ignoredPermissions,['messages.send']);
 // Wrong hash is refused (409) and recorded.
 assert.equal((await post('/api/workflow-runs',{action:'approve',id:runId,hash:'0'.repeat(64)})).status(),409);
 const card=page.locator(`[data-run="${runId}"]`);
 await card.getByRole('button',{name:'Approve payload'}).click();await page.locator(`[data-run="${runId}"][data-status="running"]`).waitFor();
 await card.getByRole('button',{name:'Execute'}).click();await page.locator(`[data-run="${runId}"][data-status="succeeded"]`).waitFor();
 const state=await (await page.request.get(base+'/api/workflow-runs')).json();const r=state.runs.find(x=>x.id===runId);
 assert.deepEqual(r.events.map(e=>e.type).filter(t=>t!=='step.succeeded'),['run.started','approval.requested','tool.denied','approval.denied','approval.granted','run.succeeded']);
 const mc=await (await page.request.get(base+'/api/mission-control')).json();
 assert.ok(JSON.stringify(mc).includes(`Restock Low ${sfx}`),'reminder created');
 await page.reload({waitUntil:'networkidle'});await page.locator(`[data-run="${runId}"][data-status="succeeded"]`).waitFor();
 // Evidence explorer
 await page.goto(base+'/workspace/evidence',{waitUntil:'networkidle'});await page.getByRole('heading',{name:'Evidence explorer'}).waitFor();
 await page.locator('[data-chain="valid"]').waitFor();
 await page.getByRole('region',{name:'What the hash chain proves'}).waitFor();await page.getByRole('region',{name:'Trust limits'}).getByText('no external anchor',{exact:false}).waitFor();
 await page.getByLabel('Result').selectOption('denied');await page.getByLabel('Target or detail').fill(runId.slice(0,8));
 await page.locator('tbody tr[data-result="denied"]').filter({hasText:'workflow.tool.denied'}).first().waitFor();
 await page.locator('tbody tr[data-result="denied"]').filter({hasText:'workflow.approval.denied'}).first().waitFor();
 assert.equal(await page.locator('tbody tr[data-result="success"]').count(),0);
 await page.getByLabel('Actor').selectOption('workflow engine');await page.getByLabel('Result').selectOption('');
 await page.locator('tbody tr').filter({hasText:'workflow.run.succeeded'}).waitFor();
 const [dl]=await Promise.all([page.waitForEvent('download'),page.getByRole('link',{name:'Export CSV'}).click()]);
 const csv=fs.readFileSync(await dl.path(),'utf8');assert.ok(csv.startsWith('seq,createdAt,actor'));assert.ok(csv.includes('workflow.run.succeeded'));assert.ok(!csv.includes('product.created'),'export honours filters');
 await page.getByLabel('From time').fill('2999-01-01T00:00');await page.getByText('No evidence events match these filters.').waitFor();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`${vp.name} overflow`);
 if(process.env.TEST_SCREENSHOT_DIR)await page.screenshot({path:`${process.env.TEST_SCREENSHOT_DIR}/slice7-${vp.name}.png`,fullPage:true});
 assert.deepEqual(errors,[]);results.push(vp.name);await page.close();
}
await browser.close();
console.log(JSON.stringify({result:'PASS',viewports:results,checks:['definition fields shown','plan run','model tool request denied + recorded','wrong hash 409 + recorded','approve hash','execute','reminder created','persists after reload','chain valid','proves/limits text','filters actor/result/text/time','CSV export honours filters','no overflow','no page errors']}));
