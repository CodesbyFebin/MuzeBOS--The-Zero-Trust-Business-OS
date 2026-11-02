/** Slice 9d: crawl every registry route on desktop and mobile; each must return 200 and render no FeatureStub. Then exercise Mission Control layouts. Use a disposable MUZEBOS_DB. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:4100';
const routes = JSON.parse(execFileSync('npx', ['tsx', '-e', "import('./lib/muzebos/registry.ts').then(m=>console.log(JSON.stringify((m.ALL_FEATURES??m.default.ALL_FEATURES).map(f=>f.route))))"], { encoding: 'utf8' }).trim().split('\n').pop());
assert.equal(routes.length, 222);
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const summary = [];
for (const vp of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true }]) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
  const bad = [];
  for (const r of routes) {
    const res = await page.goto(base + r, { waitUntil: 'domcontentloaded' });
    const status = res?.status(); const stubs = await page.locator('.mb-stub').count();
    if (status !== 200 || stubs) bad.push(`${r} -> ${status}${stubs ? ' STUB' : ''} (${page.url()})`);
  }
  assert.deepEqual(bad, [], `${vp.name}: ${bad.join('\n')}`);
  // Mission Control layout: remove, add, reorder, restore default; persisted across reload.
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  const ed = page.getByTestId('layout-editor'); await ed.locator('summary').click();
  const order = () => page.locator('[data-widget]').evaluateAll((els) => els.map((e) => e.getAttribute('data-widget')));
  assert.deepEqual(await order(), ['stats', 'launchers', 'graph', 'attention', 'todo', 'connections', 'activity']);
  await ed.getByRole('button', { name: 'Remove Daily launchers' }).click(); await page.getByText('Layout saved.').waitFor();
  await page.waitForFunction(() => !document.querySelector('[data-widget="launchers"]'));
  await ed.getByRole('button', { name: 'Move Recent activity up' }).click(); await page.waitForFunction(() => [...document.querySelectorAll('[data-widget]')].map((e) => e.getAttribute('data-widget')).join() === 'stats,graph,attention,todo,activity,connections');
  await ed.getByRole('button', { name: 'Add Daily launchers' }).click(); await page.waitForFunction(() => document.querySelectorAll('[data-widget]').length === 7);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForFunction(() => [...document.querySelectorAll('[data-widget]')].map((e) => e.getAttribute('data-widget')).join() === 'stats,graph,attention,todo,activity,connections,launchers');
  await page.getByTestId('layout-editor').locator('summary').click();
  await page.getByTestId('layout-editor').getByRole('button', { name: 'Restore default' }).click(); await page.getByText('Default layout restored.').waitFor();
  assert.deepEqual(await order(), ['stats', 'launchers', 'graph', 'attention', 'todo', 'connections', 'activity']);
  const bogus = await page.request.post(base + '/api/mission-control/layout', { data: { action: 'save', widgets: ['nope'] }, headers: { 'idempotency-key': crypto.randomUUID(), origin: base } });
  assert.equal(bogus.status(), 422);
  const nokey = await page.request.post(base + '/api/mission-control/layout', { data: { action: 'reset' }, headers: { origin: base } });
  assert.equal(nokey.status(), 428);
  summary.push(`${vp.name}: ${routes.length}/${routes.length} routes 200, 0 stubs; layout flow ok`);
  await page.close();
}
await browser.close();
console.log(summary.join('\n'));
