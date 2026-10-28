// Browser e2e for the Mission Control v3 port and the voice typed fallback. Usage: node scripts/e2e-mission-v3.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
const [base, out = '/tmp/v3shots'] = process.argv.slice(2);
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage();
const r = await p.request.post(`${base}/api/metabos/auth`, { headers: { origin: base }, data: { action: 'setup', setup: { workspace: 'E2E Bakery', name: 'Owner', email: 'owner@example.com', password: 'e2e-only-Passw0rd!' } } });
console.log('setup', r.status());
const res = {};
for (const [path, tid] of [['/', 'mission-kpis'], ['/workspace/orders', 'hub-kpis-orders'], ['/workspace/money', 'hub-kpis-money'], ['/workspace/talk', 'hub-kpis-talk']]) {
  await p.goto(base + path); const el = p.getByTestId(tid); await el.waitFor({ timeout: 20000 });
  res[path] = { cards: await el.locator('.mb-kpi-card').count(), text: (await el.innerText()).replace(/\s+/g, ' ').slice(0, 300), v3: await p.locator('[data-design=v3]').count() };
  await p.screenshot({ path: `${out}/${path === '/' ? 'mission' : path.split('/').pop()}.png`, fullPage: false });
}
await p.goto(base + '/workspace/brain/voice');
await p.getByTestId('voice-typed').fill('create a task to call the flour supplier'); await p.getByTestId('voice-send').click();
await p.getByTestId('voice-card').waitFor({ timeout: 20000 }); res.voice = (await p.getByTestId('voice-card').innerText()).replace(/\s+/g, ' ').slice(0, 300);
await p.screenshot({ path: `${out}/voice.png` });
console.log(JSON.stringify(res, null, 1)); await b.close();
