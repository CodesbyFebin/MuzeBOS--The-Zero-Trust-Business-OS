import { signInOwner } from './browser-sign-in.mjs';
/** Real-backend checks (disposable DB): stored spend limits round-trip, no demo banner in real mode, provider test says Not connected. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:4100';
const browser = await chromium.launch({ executablePath: process.env.TEST_CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); await signInOwner(page, base);
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  assert.equal(await page.getByTestId('demo-banner').count(), 0, 'demo banner must be off in real mode');
  const w = page.getByTestId('w-budget');
  await w.getByText('/ 50 attempts').waitFor();
  await w.getByRole('button', { name: 'Change limits' }).click();
  await w.getByLabel('Attempts/day').fill('12'); await w.getByLabel('Tokens/day').fill('8000');
  await w.getByRole('button', { name: 'Save' }).click();
  await w.getByText('/ 12 attempts').waitFor();
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByTestId('w-budget').getByText(/\/ 12 attempts · 0 \/ 8,000 tokens/).waitFor();
  const snap = await (await page.request.get(base + '/api/inference')).json();
  assert.equal(snap.budget.limits.maxAttempts, 12);
  assert.ok(snap.evidence.some((e) => e.action === 'inference.limits'), 'limit change recorded as evidence');
  const anon = await (await chromium.launch({ executablePath: process.env.TEST_CHROMIUM_PATH || undefined, args: ['--no-sandbox'] })).newContext();
  const r = await anon.request.post(base + '/api/inference', { headers: { origin: base, 'idempotency-key': crypto.randomUUID() }, data: { action: 'setLimits', maxAttempts: 999, maxTokens: 999 } });
  assert.ok(r.status() === 401 || r.status() === 403, `anonymous setLimits must be rejected, got ${r.status()}`);
  await page.goto(base + '/workspace/money/links', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Test connection' }).click();
  await page.getByTestId('provider-test').filter({ hasText: 'Not connected — add MUZEBOS_RAZORPAY_KEY_ID' }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS real-backend: limits persisted 12/8000 with evidence, anon rejected', r.status(), ', provider Not connected, no demo banner');
} finally { await browser.close(); process.exit(process.exitCode ?? 0); }
