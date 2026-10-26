/** Slice 9 E2E: AI runtime page with no provider keys (honest unavailable states), swarm sort -> Jev queue -> approve exact hash -> execute, refused tampered/unapproved writes, manifest. Use a disposable MUZEBOS_DB and no AI keys in env. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:4100';
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[];const notes=[];
const man=await (await fetch(base+'/manifest.webmanifest')).json();assert.equal(man.start_url,'/workspace/brain/runtime');assert.equal(man.icons.length,2);
for (const vp of [{name:'desktop',width:1440,height:1000},{name:'mobile',width:390,height:844,isMobile:true,hasTouch:true}]) {
 const page=await browser.newPage({viewport:{width:vp.width,height:vp.height},isMobile:vp.isMobile,hasTouch:vp.hasTouch});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const post=(url,body)=>page.request.post(base+url,{data:body,headers:{'idempotency-key':randomUUID(),origin:base}});
 await page.goto(base+'/workspace/brain/runtime',{waitUntil:'networkidle'});
 await page.getByRole('heading',{name:'AI runtime',exact:true}).waitFor();
 // Providers: honest states, keys never in the payload.
 await page.locator('[data-provider="openrouter"][data-state="needs_key"]').waitFor();
 await page.locator('[data-provider="meta"][data-state="needs_key"]').waitFor();
 await page.locator('[data-provider="local"][data-state="unconfigured"]').waitFor();
 const gpu=await page.locator('[data-webgpu]').getAttribute('data-webgpu');notes.push(`${vp.name}: WebGPU ${gpu} in headless Chromium`);
 await page.locator('[data-tier="large"]').getByText('meta/muse-wonder',{exact:true}).waitFor();
 // Chat with no model: routing decision explained, usage unavailable.
 await page.getByLabel('Tier',{exact:true}).selectOption('large');
 await page.getByLabel('Message',{exact:true}).fill('Plan our expansion strategy');await page.getByRole('button',{name:'Send'}).click();
 const sys=page.locator('[data-who="system"]').last();await sys.waitFor();
 await sys.getByText('Usage unavailable').waitFor();await sys.locator('summary').click();
 await sys.getByText('No model is available',{exact:false}).waitFor();await sys.getByText('provider needs a key',{exact:false}).first().waitFor();
 await page.getByTestId('usage-total').getByText('Usage unavailable').waitFor();
 // Swarm.
 await page.getByRole('button',{name:'Task board'}).click();
 const sfx=`${vp.name}-${Date.now()}`;
 await page.getByLabel('Task for the swarm').fill(`Restock tea ${sfx} before Friday. Then write a launch caption`);
 await page.getByRole('button',{name:'Sort and assign'}).click();
 await page.locator('[data-subtask][data-role="inventory"]').waitFor();await page.locator('[data-subtask][data-role="writer"]').waitFor();
 await page.getByText('rule-based draft (no model used)',{exact:false}).first().waitFor();
 // Jev queue.
 await page.getByRole('button',{name:/Jev queue/}).click();
 const card=page.locator('.ai-proposal[data-status="awaiting_approval"]').filter({hasText:`Restock tea ${sfx}`});await card.waitFor();
 const runId=await card.getAttribute('data-run');
 // Unapproved execute refused; tampered approval refused; malicious model output refused.
 assert.equal((await post('/api/workflow-runs',{action:'execute',id:runId})).status(),409);
 assert.equal((await post('/api/workflow-runs',{action:'approve',id:runId,hash:'f'.repeat(64)})).status(),409);
 assert.equal((await post('/api/ai',{action:'proposeFromModel',taskId:'x1',role:'finance',model:'test',raw:'{"tool":"invoices.issue","args":{"title":"pay me"}}'})).status(),422);
 let mc=await (await page.request.get(base+'/api/mission-control')).json();assert.ok(!JSON.stringify(mc).includes(`Restock tea ${sfx}`),'nothing written before approval');
 await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:/Jev queue/}).click();
 const c2=page.locator(`[data-run="${runId}"]`);
 await c2.getByRole('button',{name:'Approve this payload'}).click();await page.locator(`[data-run="${runId}"][data-status="running"]`).waitFor();
 await c2.getByRole('button',{name:'Run approved write'}).click();await page.locator(`[data-run="${runId}"][data-status="succeeded"]`).waitFor();
 const q=(await (await page.request.get(base+'/api/ai')).json());const r=q.queue.find(x=>x.id===runId);
 assert.deepEqual(r.events.map(e=>e.type).filter(t=>t!=='step.succeeded'),['run.started','approval.requested','approval.denied','approval.granted','run.succeeded']);
 assert.ok(!JSON.stringify(q).match(/sk-or-|MODEL_API_KEY=/));
 mc=await (await page.request.get(base+'/api/mission-control')).json();assert.ok(JSON.stringify(mc).includes(`Restock tea ${sfx}`),'reminder created after approval');
 await page.getByRole('region',{name:'Out of scope'}).getByText('no zkVM',{exact:false}).waitFor();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`${vp.name} overflow`);
 if(process.env.TEST_SCREENSHOT_DIR)await page.screenshot({path:`${process.env.TEST_SCREENSHOT_DIR}/slice9-${vp.name}.png`,fullPage:true});
 assert.deepEqual(errors,[]);results.push(vp.name);await page.close();
}
await browser.close();
console.log(JSON.stringify({result:'PASS',viewports:results,notes,checks:['manifest','provider states without keys','WebGPU detection','tiers list Muse Wonder','chat routing explained + Usage unavailable','swarm roles','rule drafts labelled','unapproved execute 409','tampered hash 409','malicious model proposal 422','no write before approval','approve exact hash + execute','reminder created','no key leak','out-of-scope note','no overflow','no page errors']}));
