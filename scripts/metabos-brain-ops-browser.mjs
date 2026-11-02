import { signInOwner } from './browser-sign-in.mjs';
/** Brain/Ops browser e2e (disposable DB): save a flow, run it, see a pending Jev dispatch; set an agent cap; risk panel empty state. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:4100';
const browser = await chromium.launch({ executablePath: process.env.TEST_CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); await signInOwner(page, base);
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(base + '/workspace/operations/automations', { waitUntil: 'networkidle' });
  const p = page.getByTestId('brain-flows');
  const name = `e2e-${Date.now()}`;
  await p.getByLabel('Name').fill(name);
  await p.getByRole('button', { name: /Save flow/ }).click();
  await p.getByText('Flow saved').waitFor();
  await p.locator('li', { hasText: name }).getByRole('button', { name: 'Run' }).click();
  await p.getByText(/Run (completed|awaiting_jev)/).waitFor();
  const v = await (await page.request.get(base + '/api/brain-ops')).json();
  assert.ok(v.runs[0].trace.some((t) => t.startsWith('sequence')), 'trace persisted');
  await page.goto(base + '/workspace/brain/models', { waitUntil: 'networkidle' });
  const a = page.getByTestId('brain-agents');
  await a.getByLabel('Code').fill('writer'); await a.getByLabel('Name').fill('Writer'); await a.getByLabel(/Cap/).fill('0.5');
  await a.getByRole('button', { name: /Save cap/ }).click();
  await a.getByText('Agent cap saved').waitFor();
  await a.getByText('USD 0.5000').waitFor(); await a.getByText('Usage unavailable').waitFor();
  await page.goto(base + '/workspace/brain/security', { waitUntil: 'networkidle' });
  await page.getByTestId('brain-risk').waitFor();
  const anon = await (await chromium.launch({ executablePath: process.env.TEST_CHROMIUM_PATH || undefined, args: ['--no-sandbox'] })).newContext();
  const r = await anon.request.post(base + '/api/brain-ops', { headers: { origin: base }, data: { action: 'agent', code: 'evil', name: 'Evil', monthlyCapMicroUsd: 1 } });
  assert.ok(r.status() === 401 || r.status() === 403, `anonymous cap change rejected, got ${r.status()}`);
  assert.deepEqual(errors, []);
  console.log(`PASS brain-ops: flow saved+run (${v.runs[0].status}, trace ${v.runs[0].trace.length} lines), cap USD 0.5 stored, risk panel renders, anon ${r.status()}`);
} catch (e) { console.error("FAIL brain-ops:", e.message); await browser.close(); process.exit(1); }
await browser.close(); process.exit(0);
