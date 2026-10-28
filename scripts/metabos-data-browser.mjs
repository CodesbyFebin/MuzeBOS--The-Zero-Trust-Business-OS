import { signInOwner } from './browser-sign-in.mjs';
/** Data/privacy/growth browser e2e (disposable DB): ask a question and see the SQL, set a sales goal, open the DPDP panel. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:4100';
const browser = await chromium.launch({ executablePath: process.env.TEST_CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); await signInOwner(page, base);
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(base + '/workspace/growth/analytics', { waitUntil: 'networkidle' });
  const a = page.getByTestId('data-ask');
  await a.getByLabel('Question').fill('how many customers do we have');
  await a.getByRole('button', { name: 'Ask', exact: true }).click();
  await a.getByLabel('SQL used').waitFor();
  assert.match(await a.getByLabel('SQL used').innerText(), /COUNT\(\*\) AS customers FROM mb_customers/);
  await a.getByLabel(/Read-only SELECT/).fill('SELECT * FROM mb_audit');
  await a.getByRole('button', { name: 'Run SELECT' }).click();
  await a.getByText(/Table not allowed/).waitFor();
  await page.goto(base + '/workspace/money/pipeline', { waitUntil: 'networkidle' });
  const g = page.getByTestId('data-goals');
  await g.getByLabel(/Target/).fill('1234.5');
  await g.getByRole('button', { name: /Set goal/ }).click();
  await g.getByText('Goal saved').waitFor(); await g.getByText('INR 1234.50').waitFor();
  await page.goto(base + '/workspace/foundation/policies', { waitUntil: 'networkidle' });
  await page.getByTestId('data-privacy').getByRole('heading', { name: 'DPDP data requests' }).waitFor();
  const anon = await (await chromium.launch({ executablePath: process.env.TEST_CHROMIUM_PATH || undefined, args: ['--no-sandbox'] })).newContext();
  const r = await anon.request.post(base + '/api/data', { headers: { origin: base }, data: { action: 'select', sql: 'SELECT * FROM mb_customers' } });
  assert.ok(r.status() === 401 || r.status() === 403, `anonymous select rejected, got ${r.status()}`);
  assert.deepEqual(errors, []);
  console.log(`PASS data: ask shows SQL, audit table refused, goal INR 1234.50 saved, DPDP panel renders, anon ${r.status()}`);
} catch (e) { console.error('FAIL data:', e.message); await browser.close(); process.exit(1); }
await browser.close(); process.exit(0);
