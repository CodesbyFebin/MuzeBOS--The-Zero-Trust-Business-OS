/** Run only against a disposable local workspace: creates a fictional owner and an unapproved draft. */
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { PerspectiveCamera, Vector3 } from 'three';
import { chromium } from 'playwright';
import { signInOwner } from './browser-sign-in.mjs';
const base=process.env.TEST_BASE_URL;if(!base)throw Error('TEST_BASE_URL must point to a disposable workspace');
const shots=process.env.SHOTS_DIR;if(shots)mkdirSync(shots,{recursive:true});
const browser=await chromium.launch({...(process.env.TEST_CHROMIUM_PATH?{executablePath:process.env.TEST_CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),p=await context.newPage(),errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base+'/workspace/brain/arena',{waitUntil:'networkidle'});await p.getByText('Workspace sign-in',{exact:true}).waitFor();assert.equal(await p.locator('[data-testid="arena-floor"]').count(),0);
 await signInOwner(p,base);await p.reload({waitUntil:'networkidle'});await p.getByRole('button',{name:'Save new version',exact:true}).waitFor();
 await p.getByRole('button',{name:'Save new version',exact:true}).click();await p.getByText('Invoice review draft · v1',{exact:true}).waitFor();
 await p.getByLabel('Skill context',{exact:true}).fill('Fictional test invoice: two coffee bags at INR 100 each. Draft a review only.');
 await p.getByRole('button',{name:'Propose drafts to Jev',exact:true}).click();
 await p.waitForFunction(async()=>{const r=await fetch('/api/metabos/arena');return r.ok&&(await r.json()).tasks.length===1});
 const snapshot=await (await p.request.get(base+'/api/metabos/arena')).json();assert.equal(snapshot.tasks[0].state,'awaiting_approval');assert.equal(snapshot.actors[0].leased,false);assert.equal(snapshot.skills.length,1);assert.equal(snapshot.auditValid,true);
 await p.getByRole('button',{name:/Invoice review draft: Review supplied invoice/}).click();await p.getByTestId('arena-task-details').waitFor();assert((await p.getByTestId('arena-task-details').innerText()).includes(snapshot.tasks[0].hash));
 await p.reload({waitUntil:'networkidle'});await p.getByText('Invoice review draft · v1',{exact:true}).waitFor();await p.locator('[data-testid="arena-floor"] canvas').waitFor({timeout:30000});
 // The default view must be actual 3D; raycast a real robot into the existing details panel.
 const canvas=p.locator('[data-renderer="three"] canvas');await canvas.waitFor();
 await p.waitForFunction(()=>document.querySelector('[data-renderer="three"] canvas')?.dataset.actorCount==='1');
 const rect=await canvas.boundingBox();assert(rect);
 const camera=new PerspectiveCamera(42,rect.width/rect.height,.1,100);camera.position.set(10,12,14).multiplyScalar(Math.max(1,1.6/camera.aspect));camera.lookAt(0,0,0);camera.updateMatrixWorld();
 const point=new Vector3((755-465)/45-1.8,1.17,(115-220)/45+.65).project(camera);
 await p.mouse.click(rect.x+(point.x+1)*rect.width/2,rect.y+(1-point.y)*rect.height/2);
 await p.getByTestId('arena-task-details').waitFor();assert((await p.getByTestId('arena-task-details').innerText()).includes(snapshot.tasks[0].id));
 await p.getByRole('button',{name:'Zoom in',exact:true}).click();await p.getByRole('button',{name:'Reset camera',exact:true}).click();
 await p.getByRole('button',{name:'2D office',exact:true}).click();await p.locator('.mb-arena-floor canvas').waitFor();
 await p.getByRole('button',{name:'3D agents',exact:true}).click();await canvas.waitFor();
 const exportResponse=await p.request.get(base+'/api/metabos/arena?export=yaml&id=invoice-review&version=1');assert.equal(exportResponse.status(),200);assert((await exportResponse.text()).includes('jev-exact-hash'));

 // A fixture worker exercises real approval/lease/delegation transitions without invoking a model.
 const inference = async data => { const r=await p.request.post(base+'/api/inference',{headers:{origin:base,'idempotency-key':crypto.randomUUID()},data});assert.equal(r.status(),200,await r.text());return (await r.json()).result; };
 await inference({action:'approve',id:snapshot.tasks[0].id,hash:snapshot.tasks[0].hash});
 const lease=await inference({action:'claimBrowser',workerId:'arena-fixture-browser'});assert.equal(lease.task.id,snapshot.tasks[0].id);
 await p.getByRole('button',{name:'Refresh',exact:true}).click();await p.waitForFunction(async()=>{const r=await fetch('/api/metabos/arena');return (await r.json()).actors.some(a=>a.leased&&a.station==='sparring')});
 await inference({action:'completeBrowser',id:lease.task.id,token:lease.token,output:'QA fixture draft; not model-generated.'});
 const children=await inference({action:'delegate',id:lease.task.id,children:[{title:'QA follow-up draft',prompt:'Draft a review from supplied facts only.',kind:'draft',lane:'browser',maxTokens:128,paidConsent:false}]});assert.equal(children.length,1);
 await p.emulateMedia({reducedMotion:'no-preference'});await p.getByRole('button',{name:'Refresh',exact:true}).click();
 await p.getByRole('button',{name:'QA follow-up draft · awaiting_approval',exact:true}).waitFor();
 const delegated=await (await p.request.get(base+'/api/metabos/arena')).json();assert.equal(delegated.tasks.find(t=>t.id===children[0].id).parentId,lease.task.id);assert.equal(delegated.auditValid,true);
 if(shots)await p.screenshot({path:path.join(shots,'arena-desktop.png')});
 await p.route('**/api/metabos/arena',route=>route.abort());await p.getByRole('button',{name:'Refresh',exact:true}).click();await p.getByRole('alert').filter({hasText:'Last snapshot:'}).waitFor();assert(await p.getByText('Invoice review draft · v1',{exact:true}).isVisible());await p.unroute('**/api/metabos/arena');await p.getByRole('button',{name:'Refresh',exact:true}).click();
 await p.emulateMedia({reducedMotion:'reduce'});await p.setViewportSize({width:390,height:844});await p.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth&&document.querySelector('#os-sidebar').getBoundingClientRect().right<=1,undefined,{timeout:5000});if(shots){await canvas.scrollIntoViewIfNeeded();await p.screenshot({path:path.join(shots,'arena-mobile.png')});}
 // Losing WebGL must preserve business records and offer a usable fallback.
 await canvas.evaluate(c=>c.dispatchEvent(new Event('webglcontextlost',{cancelable:true})));
 await p.getByRole('button',{name:'Use 2D office',exact:true}).click();await p.locator('.mb-arena-floor canvas').waitFor();
 assert(await p.getByText('Invoice review draft · v1',{exact:true}).isVisible());
 await p.getByRole('button',{name:'3D agents',exact:true}).click();await canvas.waitFor();
 await p.request.post(base+'/api/metabos/auth',{headers:{origin:base},data:{action:'signOut'}});await p.getByRole('button',{name:'Refresh',exact:true}).click();await p.getByText('Workspace sign-in',{exact:true}).waitFor();assert.equal(await p.getByText('Invoice review draft · v1',{exact:true}).count(),0);
 assert.deepEqual(errors,[]);console.log('PASS: authenticated Arena, real skill persistence/export, pending-only draft, hashes, 3D canvas, robot selection, camera controls, 2D/context-loss fallback, refresh failure retention, mobile overflow and sign-out clearing. Real fixture worker lease/completion/delegation tested; no model/provider call performed.');
}finally{await browser.close()}
