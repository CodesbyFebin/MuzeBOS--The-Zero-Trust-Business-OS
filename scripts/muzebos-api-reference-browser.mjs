/** Slice 8d E2E: the generated API reference renders every route on desktop and mobile without page overflow. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:4100';
const ref = JSON.parse(readFileSync('lib/muzebos/api-reference.generated.json', 'utf8'));
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
for (const vp of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true }]) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/workspace/developer/api-reference`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'API reference', level: 1 }).waitFor();
  assert.equal(await page.locator('tbody tr').count(), ref.count);
  await page.locator('tr', { hasText: '/api/modules/{module}' }).getByText('Idempotency-Key', { exact: false }).waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `overflows by ${overflow}px on ${vp.name}`);
  assert.deepEqual(errors, []);
  console.log(`${vp.name}: ${ref.count} routes ok`);
  await page.close();
}
await browser.close();
