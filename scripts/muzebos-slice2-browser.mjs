/** Slice 2 E2E. Run against a disposable MUZEBOS_DB: it creates real reminders. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:4100';
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[];
for (const vp of [{name:'desktop',width:1440,height:1000},{name:'mobile',width:390,height:844}]) {
 const page=await browser.newPage({viewport:vp});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const ready=async()=>{await page.getByRole('heading',{name:'Mission Control',exact:true}).waitFor();await page.getByText('Reading business records, tasks and connector status…',{exact:true}).waitFor({state:'hidden'});};
 await page.goto(base,{waitUntil:'networkidle'});await ready();
 for(const t of ['Needs approval','Outstanding invoices','Settled (manual)','To do','Low stock'])await page.locator('.mb-stat-link',{hasText:t}).first().waitFor();
 const title=`E2E ${vp.name} ${Date.now()}`;
 await page.getByLabel('Reminder',{exact:true}).fill(title);
 await page.getByLabel('Due (your local time)').fill('2020-01-01T09:00');
 await page.getByRole('button',{name:'Add reminder',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Reminder saved'}).waitFor();
 await page.reload({waitUntil:'networkidle'});await ready();
 const complete=page.getByRole('button',{name:`Complete reminder: ${title}`,exact:true});await complete.waitFor();
 await page.getByRole('button',{name:'Overdue',exact:true}).click();await complete.waitFor();
 await page.getByRole('button',{name:'Due today',exact:true}).click();assert.equal(await complete.count(),0,'overdue 2020 item must not be due today');
 await page.getByRole('button',{name:'All',exact:true}).click();
 await complete.click();await page.getByRole('status').filter({hasText:'Reminder completed'}).waitFor();
 await page.reload({waitUntil:'networkidle'});await ready();
 assert.equal(await complete.count(),0,'completion persisted after reload');
 await page.getByText('Recently completed').click();
 await page.getByRole('button',{name:`Reopen reminder: ${title}`,exact:true}).click();await page.getByRole('status').filter({hasText:'Reminder reopened'}).waitFor();
 await page.reload({waitUntil:'networkidle'});await ready();await complete.waitFor();
 // error then stale state retains last snapshot
 await page.route('**/api/mission-control*',r=>r.abort());await page.getByRole('button',{name:'Refresh mission status'}).click();
 await page.locator('.mb-alert[role=alert]',{hasText:'last received snapshot'}).waitFor();await page.unroute('**/api/mission-control*');
 await page.getByRole('button',{name:'Refresh mission status'}).click();await page.locator('.mb-alert[role=alert]').waitFor({state:'hidden'});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`${vp.name} overflow`);
 if(process.env.TEST_SCREENSHOT_DIR)await page.screenshot({path:`${process.env.TEST_SCREENSHOT_DIR}/slice2-${vp.name}.png`,fullPage:true});
 assert.deepEqual(errors,[]);results.push(vp.name);await page.close();
}
await browser.close();
console.log(JSON.stringify({result:'PASS',viewports:results,checks:['5 count tiles','create reminder','reload','overdue/today filters','complete','persists after reload','reopen persists','error then recovery','no overflow','no page errors']}));
