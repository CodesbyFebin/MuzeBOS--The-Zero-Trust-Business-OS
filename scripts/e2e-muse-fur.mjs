// Browser e2e: MUSE fur simulator (tiers, fps, boop, coats, voice commands, Fur Lab, envs, AR click-only camera, fallbacks).
// Usage: node scripts/e2e-muse-fur.mjs <baseUrl> <outDir>  (fresh MUZEBOS_DB; creates a disposable owner)
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const [base, out = '/tmp/shots'] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['camera'] });
await ctx.addInitScript(() => { const md = navigator.mediaDevices; if (!md) return; const orig = md.getUserMedia.bind(md); window.__gum = []; md.getUserMedia = (c) => { window.__gum.push(JSON.stringify(c)); return orig(c); }; });
const errs = []; let p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(String(e)));
async function fresh() { await p.close({ runBeforeUnload: false }).catch(() => {}); p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(String(e))); }
const r = await ctx.request.post(`${base}/api/metabos/auth`, { headers: { origin: base }, data: { action: 'setup', setup: { workspace: 'E2E Bakery', name: 'Owner', email: 'owner@example.com', password: 'e2e-only-Passw0rd!' } } });
console.log('setup', r.status());
const fur = () => p.getByTestId('muse-fur');
async function measure(label, url, extra = {}) {
  await fresh(); await p.goto(base + url); await fur().waitFor({ timeout: 30000 });
  await p.waitForFunction(() => document.querySelector('[data-testid=muse-fur]')?.getAttribute('data-tier') !== 'loading', null, { timeout: 30000 });
  const tier = await fur().getAttribute('data-tier');
  if (tier !== '2d') await p.waitForFunction(() => Number(document.querySelector('[data-testid=muse-fur]')?.getAttribute('data-fps')) > 0, null, { timeout: 30000 });
  await p.waitForTimeout(3000); const fps = await fur().getAttribute('data-fps'); const stats = await p.getByTestId('fur-stats').innerText();
  console.log(JSON.stringify({ label, tier, fps, stats: stats.replace(/\n/g, ' | '), ...extra })); return { tier, fps: Number(fps) };
}
// default tier
const g = await measure('forced-gpu (GPGPU, 64 shells, 60k strands)', '/workspace/brain/voice?muse=gpu');
await p.screenshot({ path: `${out}/muse-fur-gpu.png`, timeout: 120000 });
const auto = await measure('auto', '/workspace/brain/voice'); await p.waitForTimeout(8000);
console.log(JSON.stringify({ label: 'auto after adaptive', tier: await fur().getAttribute('data-tier'), downgrades: await fur().getAttribute('data-downgrades'), stats: (await p.getByTestId('fur-stats').innerText()).replace(/\n/g, ' | ') }));
assert.equal(await fur().getAttribute('data-coat'), 'ember');
assert.equal((await p.evaluate(() => window.__gum)).length, 0, 'no camera/mic before any click');
await p.screenshot({ path: `${out}/muse-fur-auto.png`, timeout: 120000 });
const main = await measure('interactive (forced WebGL tier)', '/workspace/brain/voice?muse=webgl');
await p.screenshot({ path: `${out}/muse-fur-studio.png`, timeout: 120000 });
// boop by clicking the creature centre + button
const box = await p.getByTestId('muse-fur-canvas').boundingBox(); await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
await p.getByTestId('fur-boop').click(); await p.waitForTimeout(300);
assert.ok(Number(await fur().getAttribute('data-boops')) >= 1, 'boop counted'); console.log('boops after click+button', await fur().getAttribute('data-boops'));
// pet: drag across creature
await p.mouse.move(box.x + box.width * 0.42, box.y + box.height * 0.5); await p.mouse.down(); await p.mouse.move(box.x + box.width * 0.58, box.y + box.height * 0.45, { steps: 12 }); await p.mouse.up();
// voice commands (typed path; spoken path uses the same parser on the transcript)
await p.getByTestId('voice-typed').fill('flip my coat'); await p.getByTestId('voice-send').click(); await p.waitForTimeout(300);
assert.equal(await fur().getAttribute('data-coat'), 'violet'); await p.getByText('Coat changed to Violet').first().waitFor();
const b0 = Number(await fur().getAttribute('data-boops')); await p.getByTestId('voice-typed').fill('boop'); await p.getByTestId('voice-send').click(); await p.waitForTimeout(300);
assert.equal(Number(await fur().getAttribute('data-boops')), b0 + 1);
assert.equal(await p.evaluate(() => localStorage.getItem('muse.coat')), 'violet');
await p.screenshot({ path: `${out}/muse-fur-violet.png`, timeout: 120000 });
// Fur Lab: presets + 9 sliders + GPU toggle
await p.getByTestId('fur-lab-toggle').click(); await p.getByTestId('fur-lab').waitFor();
assert.equal(await p.locator('[data-testid^=fur-slider-]').count(), 9);
for (const id of ['sakura-mochi', 'golden-fluff', 'midnight-velvet', 'matcha-puff']) { await p.getByTestId(`fur-coat-${id}`).click(); await p.waitForTimeout(400); await p.screenshot({ path: `${out}/muse-fur-${id}.png`, timeout: 120000 }); }
await p.getByTestId('fur-coat-ember').click();
await p.getByTestId('fur-slider-length').fill('0.22'); await p.getByTestId('fur-slider-wind').fill('0.8'); await p.getByTestId('fur-slider-curl').fill('0.6'); await p.waitForTimeout(800);
await p.screenshot({ path: `${out}/muse-fur-lab.png`, timeout: 120000, fullPage: true });
if (g.tier === 'gpu') { await fresh(); await p.goto(base + '/workspace/brain/voice?muse=gpu'); await p.getByTestId('fur-lab-toggle').click(); await p.waitForTimeout(3000); await p.getByTestId('fur-gpu').uncheck(); await p.waitForTimeout(2500); const st = await p.getByTestId('fur-stats').innerText(); assert.match(st, /CPU physics/); console.log('gpu toggle off ->', st.replace(/\n/g, ' | ')); await fresh(); await p.goto(base + '/workspace/brain/voice?muse=webgl'); await fur().waitFor(); await p.getByTestId('fur-lab-toggle').click(); await p.waitForTimeout(3000); }
// environments
for (const e of ['cloud-sky', 'cozy-desk']) { await p.getByTestId(`fur-env-${e}`).click(); await p.waitForTimeout(500); await p.screenshot({ path: `${out}/muse-fur-${e}.png`, timeout: 120000 }); }
// AR: no camera until click; then video only; stop releases tracks
await p.getByTestId('fur-env-ar').click(); await p.getByText(/never recorded or uploaded/).waitFor();
assert.equal((await p.evaluate(() => window.__gum)).length, 0, 'AR does not touch the camera before click');
await p.screenshot({ path: `${out}/muse-fur-ar-prompt.png`, timeout: 120000 });
await p.getByTestId('fur-ar-start').click(); await p.getByTestId('fur-ar-stop').waitFor({ timeout: 15000 });
const gum = await p.evaluate(() => window.__gum); console.log('getUserMedia calls', gum); assert.equal(gum.length, 1); assert.match(gum[0], /"audio":false/);
assert.equal(await p.evaluate(() => typeof window.MediaRecorder !== 'undefined' && !!window.__rec), false);
await p.waitForTimeout(800); await p.screenshot({ path: `${out}/muse-fur-ar.png`, timeout: 120000 });
await p.getByTestId('fur-ar-stop').click();
const live = await p.evaluate(() => { const v = document.querySelector('.mb-fur-video'); return v && v.srcObject ? v.srcObject.getTracks().filter((t) => t.readyState === 'live').length : 0; }); assert.equal(live, 0);
await p.getByTestId('fur-env-studio').click();
// off-screen pause: shrink viewport and scroll the stage out of view
await p.setViewportSize({ width: 1280, height: 400 }); await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await p.waitForTimeout(1800);
const paused = await fur().getAttribute('data-paused'); console.log('off-screen paused', paused);
await p.setViewportSize({ width: 1280, height: 900 });
// fallbacks
const d2 = await measure('forced-2d', '/workspace/brain/voice?muse=2d'); assert.equal(d2.tier, '2d');
await p.locator('.mb-fur-2d').click(); assert.equal(await fur().getAttribute('data-boops'), '1');
await p.screenshot({ path: `${out}/muse-fur-2d-fallback.png` });
const rm = await b.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' }); const p2 = await rm.newPage();
await p2.goto(base + '/'); await p2.context().addCookies(await ctx.cookies());
await p2.goto(base + '/workspace/brain/voice'); await p2.getByTestId('muse-fur').waitFor(); await p2.waitForFunction(() => document.querySelector('[data-testid=muse-fur]')?.getAttribute('data-tier') !== 'loading'); await p2.waitForTimeout(2500);
console.log(JSON.stringify({ label: 'reduced-motion', tier: await p2.getByTestId('muse-fur').getAttribute('data-tier'), stats: (await p2.getByTestId('fur-stats').innerText()).replace(/\n/g, ' | ') }));
// mobile
const mob = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await mob.addCookies(await ctx.cookies()); const p3 = await mob.newPage();
await p3.goto(base + '/workspace/brain/voice'); await p3.getByTestId('muse-fur').waitFor(); await p3.waitForTimeout(3500);
console.log(JSON.stringify({ label: 'mobile', tier: await p3.getByTestId('muse-fur').getAttribute('data-tier'), fps: await p3.getByTestId('muse-fur').getAttribute('data-fps') }));
await p3.screenshot({ path: `${out}/muse-fur-mobile.png` });
console.log('page errors', errs.length, errs.slice(0, 3));
assert.equal(errs.length, 0);
console.log('E2E OK'); await b.close();
