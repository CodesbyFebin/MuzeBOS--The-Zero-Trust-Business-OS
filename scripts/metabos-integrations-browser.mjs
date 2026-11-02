import { signInOwner } from './browser-sign-in.mjs';
/** Real local flows only; use disposable databases. No external sources executed. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:4100';
const browser = await chromium.launch({ executablePath: process.env.TEST_CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });await signInOwner(page,base);
const errors = []; page.on('pageerror', e => errors.push(e.message));
const suffix = Date.now();
try {
  await page.goto(base + '/workspace/system/sources', { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Source integration catalog', exact: true }).waitFor();
  assert.equal(await page.locator('.mb-tool-grid > article').count(), 29);
  await page.getByRole('combobox', { name: 'Disposition' }).selectOption('imported');
  assert.equal(await page.locator('.mb-tool-grid > article').count(), 4);
  await page.getByRole('combobox', { name: 'Disposition' }).selectOption('excluded');
  assert.equal(await page.locator('.mb-tool-grid > article').count(), 3);
  await page.getByRole('textbox', { name: 'Search sources' }).fill('Hypastack');
  assert.match(await page.locator('.mb-tool-grid').innerText(), /reuse prohibited/);

  await page.goto(base + '/workspace/brain/employees', { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'AI employees & founder prompts', exact: true }).waitFor();
  assert.equal(await page.locator('.mb-tool-grid').first().locator(':scope > article').count(), 8);
  await page.getByRole('textbox', { name: 'Search library' }).fill('Founder Board');
  await page.getByRole('button', { name: 'Read template', exact: true }).click();
  await page.getByRole('textbox', { name: 'Reference document' }).waitFor();
  assert.ok((await page.getByRole('textbox', { name: 'Reference document' }).inputValue()).length > 100);
  await page.getByRole('button', { name: 'Queue human review', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Review reminder saved' }).waitFor();
  const snapshot = await (await page.request.get(base + '/api/mission-control')).json();
  assert.ok(snapshot.todo.some(t => t.title === 'Review: Founder Board'));
  const missing = await page.request.get(base + '/api/employee-library?document=../../.env');
  assert.equal(missing.status(), 404);

  await page.goto(base + '/workspace/brain/security', { waitUntil: 'networkidle' });
  await page.getByRole('textbox', { name: 'Agent permission JSON' }).fill(JSON.stringify({ permissions: { allow: ['Bash(/usr/bin/curl:*)', 'Write(*)'], deny: ['Bash(sudo *)'] } }));
  await page.getByRole('button', { name: 'Review configuration', exact: true }).click();
  await page.getByRole('heading', { name: '2 findings in this limited review', exact: true }).waitFor();
  assert.match(await page.locator('.mb-console').innerText(), /powerful-command/);

  const created = await page.request.post(base + '/api/business', { headers: { origin: base, 'idempotency-key': crypto.randomUUID() }, data: { action: 'customer', data: { name: `Booking customer ${suffix}` } } });
  assert.equal(created.status(), 200); const customer = (await created.json()).result;
  await page.goto(base + '/workspace/orders/bookings', { waitUntil: 'networkidle' });
  await page.getByRole('combobox', { name: 'Customer', exact: true }).selectOption(customer.id);
  await page.getByRole('textbox', { name: 'Resource name', exact: true }).fill(`Room ${suffix}`);
  await page.getByLabel('Starts at · local time').fill('2030-01-01T10:00');
  await page.getByLabel('Ends at · local time').fill('2030-01-01T11:00');
  await page.getByRole('button', { name: 'Create booking', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel booking', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Create booking', exact: true }).click();
  await page.locator('.mb-alert[role=alert]').filter({ hasText: 'already booked' }).waitFor();
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Cancel booking', exact: true }).click();
  await page.getByText(`${customer.name} · cancelled`, { exact: true }).waitFor();
  const bookingData = await (await page.request.get(base + '/api/bookings')).json();
  assert.ok(bookingData.bookings.some(b => b.customerId === customer.id && b.status === 'cancelled'));
  const evidence = await (await page.request.get(base + '/api/business')).json();
  assert.equal(evidence.auditValid, true);
  assert.ok(evidence.evidence.some(e => e.action === 'booking.cancelled'));

  for (const route of ['/workspace/system/sources', '/workspace/brain/employees', '/workspace/brain/security', '/workspace/orders/bookings']) {
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(base + route, { waitUntil: 'networkidle' });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${route}: mobile overflow`);
    assert.equal(await page.locator('[data-workspace-entry]').count(), 18);
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: 'PASS', checks: ['29 source records', 'license disposition filtering', '8 role definitions', 'on-demand template document', 'persistent human review reminder', 'path traversal rejected', 'permission findings', 'real booking creation', 'overlap rejection', 'durable cancellation', 'valid audit ledger', 'four mobile pages', '18 navigation entries', 'no browser runtime errors'] }));
} finally { await browser.close(); }
