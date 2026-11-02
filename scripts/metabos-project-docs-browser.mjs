/** Render the built static export locally through Playwright's request fixture. No deployed URL is claimed. */
import {chromium} from 'playwright';
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {BASE,PAGES,ROOT} from './build-project-site.mjs';
const browser=await chromium.launch({headless:true,executablePath:process.env.TEST_CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route(BASE+'**',async r=>{const rel=new URL(r.request().url()).pathname.slice(new URL(BASE).pathname.length),file=path.join(ROOT,'site',rel,rel.endsWith('/')||!rel?'index.html':'');assert.ok(file.startsWith(path.join(ROOT,'site')));assert.ok(existsSync(file),file);await r.fulfill({status:200,contentType:file.endsWith('.css')?'text/css':'text/html',body:readFileSync(file)});});
  for(const p of PAGES){const response=await page.goto(BASE+p.slug);assert.equal(response.status(),200);assert.equal(await page.title(),p.title);assert.equal(await page.locator('h1').count(),1);assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'),BASE+p.slug);assert.ok(await page.getByRole('navigation',{name:'Project',exact:true}).isVisible());
   const size=await page.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:innerWidth}));assert.ok(size.page<=size.viewport,JSON.stringify({slug:p.slug,width,...size}));
  }
  if(process.env.TEST_SCREENSHOT&&width===1440)await page.screenshot({path:process.env.TEST_SCREENSHOT,fullPage:true});
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: seven built project pages at 1440px and 390px; titles, canonicals, headings, navigation, no overflow/page errors. Local fixture rendering only.');
}finally{await browser.close();}
