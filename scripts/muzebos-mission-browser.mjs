/** Run against disposable app databases: this creates actual reminder records. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:4100';
const browser=await chromium.launch({executablePath:process.env.TEST_CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
 await page.goto(base,{waitUntil:'networkidle'});await page.getByRole('heading',{name:'Mission Control',exact:true}).waitFor();
 await page.getByText('Reading business records, tasks and connector status…',{exact:true}).waitFor({state:'hidden'});
 assert.equal(await page.locator('[data-workspace-entry]').count(),18);
 assert.equal(await page.getByRole('navigation',{name:'Pinned utilities'}).getByRole('link').count(),5);
 const title='Browser reminder '+Date.now();await page.getByLabel('Reminder',{exact:true}).fill(title);await page.getByRole('button',{name:'Add reminder',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Reminder saved'}).waitFor();await page.getByText(title,{exact:true}).first().waitFor();
 await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:`Complete reminder: ${title}`,exact:true}).waitFor();
 // A separate client writes to the real backend. Wait for the dashboard's
 // scheduled poll, without clicking refresh, to prove automatic updates.
 const external='Poll update '+Date.now();const result=await page.request.post(base+'/api/business',{headers:{origin:base,'idempotency-key':crypto.randomUUID()},data:{action:'reminder',data:{title:external,dueAt:null}}});assert.equal(result.status(),200);
 await page.getByRole('button',{name:`Complete reminder: ${external}`,exact:true}).waitFor({timeout:28000});
 await page.getByRole('button',{name:`Complete reminder: ${title}`,exact:true}).click();await page.getByRole('status').filter({hasText:'Reminder completed'}).waitFor();assert.equal(await page.getByRole('button',{name:`Complete reminder: ${title}`,exact:true}).count(),0);
 // An aborted update must retain the last received snapshot and expose failure.
 await page.route('**/api/mission-control',route=>route.abort());await page.getByRole('button',{name:'Refresh mission status'}).click();await page.locator('.mb-alert[role=alert]').waitFor();assert.match(await page.locator('.mb-alert[role=alert]').innerText(),/last received snapshot/);await page.unroute('**/api/mission-control');await page.getByRole('button',{name:'Refresh mission status'}).click();await page.locator('.mb-alert[role=alert]').waitFor({state:'hidden'});
 await page.getByRole('heading',{name:'Mission Control',exact:true}).click();await page.keyboard.press('2');await page.getByRole('heading',{name:'Commerce, Orders & CRM',exact:true}).waitFor();await page.keyboard.press('1');await page.getByRole('heading',{name:'Mission Control',exact:true}).waitFor();
 if(process.env.TEST_SCREENSHOT)await page.screenshot({path:process.env.TEST_SCREENSHOT,fullPage:true});
 await page.getByRole('navigation',{name:'Founder workspace'}).getByRole('link',{name:'Stock & Products',exact:true}).click();await page.getByRole('heading',{name:'Product & Inventory Graph'}).waitFor();assert.equal(await page.locator('.mb-tool-card').count(),20);assert.match(await page.locator('.mb-tool-card').filter({hasText:'Shelf Scanner'}).innerText(),/Planned/i);
 await page.getByRole('navigation',{name:'Pinned utilities'}).getByRole('link',{name:'Help & Support',exact:true}).click();await page.getByRole('heading',{name:'Quick start'}).waitFor();
 // Changing business query views must update the actual same-route component.
 await page.goto(base+'/business?view=invoices',{waitUntil:'networkidle'});await page.getByRole('heading',{name:'Invoices',exact:true}).waitFor();await page.goto(base+'/business?view=inventory',{waitUntil:'networkidle'});await page.getByRole('heading',{name:'Inventory',exact:true}).waitFor();
 await page.setViewportSize({width:390,height:844});await page.goto(base,{waitUntil:'networkidle'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Mission Control overflows mobile viewport');assert.equal(await page.locator('[data-workspace-entry]').count(),18);
 const pinned=await page.getByRole('navigation',{name:'Pinned utilities'}).boundingBox();assert.ok(pinned&&pinned.y+pinned.height<=844,'Pinned utilities leave mobile viewport');
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({result:'PASS',checks:['18 sidebar entries','daily-first digit shortcuts','5 pinned utilities','persisted reminder creation','completion after reload','automatic cross-client refresh','stale-data warning and recovery','20 grouped stock tools','planned capability labels','help hub','business query views','mobile width','pinned mobile utilities','no runtime errors']},null,2));
}catch(error){console.error('Visible alerts',await page.locator('.mb-alert[role=alert]').allTextContents());throw error;}finally{await browser.close();}
