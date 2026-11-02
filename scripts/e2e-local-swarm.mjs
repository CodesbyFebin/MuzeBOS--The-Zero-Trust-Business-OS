// Browser e2e: Claw swarms "Run on local swarm" → draft via claw-local → Llama Guard → pending Jev. Usage: node scripts/e2e-local-swarm.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
const [base, out = '/tmp/shots'] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--no-sandbox'] }); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.request.post(`${base}/api/metabos/auth`, { headers: { origin: base }, data: { action: 'setup', setup: { workspace: 'E2E Bakery', name: 'Owner', email: 'owner@example.com', password: 'e2e-only-Passw0rd!' } } });
await p.goto(base + '/workspace/builder/swarms'); await p.getByTestId('sw-tree').waitFor({ timeout: 30000 });
console.log(await p.getByTestId('sw-status').innerText());
const tree = p.getByTestId('sw-tree'); await tree.locator('summary').first().click(); await tree.locator('details details summary').first().click(); await tree.locator('li[data-agent] button').first().click();
await p.locator('textarea').fill('Draft a one-line Diwali pre-order caption for a Kochi bakery. Draft only.');
const t0 = Date.now(); await p.getByRole('button', { name: 'Run on local swarm' }).click();
await p.getByRole('button', { name: 'Run on local swarm' }).waitFor({ timeout: 300000 });
await p.waitForTimeout(1500);
console.log('secs', Math.round((Date.now() - t0) / 1000));
console.log((await p.locator('form').innerText()).replace(/\s+/g, ' ').slice(0, 500));
const dr = p.getByTestId('sw-drafts'); console.log('drafts:', (await dr.count()) ? (await dr.innerText()).replace(/\s+/g, ' ').slice(0, 400) : 'none');
await p.screenshot({ path: `${out}/local-swarm-run.png` });
const api = await p.request.get(`${base}/api/b3/swarms?tier=lead`); const j = await api.json(); console.log(JSON.stringify(j.drafts?.slice(0, 1)));
await b.close();
