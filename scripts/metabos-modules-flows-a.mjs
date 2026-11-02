/** Batch (a) UI flows: create through the form, error alert, PO receipt changes stock, stale state after a concurrent edit. */
export async function run({ page, post, base, vp, assert }) {
  const sfx = `${vp.name.toUpperCase()}${Date.now() % 100000}`;
  const prod = (await (await post('/api/business', { action: 'product', data: { name: `Tea ${sfx}`, sku: `TEA-${sfx}`, price: 5000, taxBps: 500, stock: 4 } })).json()).result;
  assert.ok(prod.id, JSON.stringify(prod));
  // Location via the form.
  await page.goto(`${base}/workspace/stock/warehouse-and-location-matrix`, { waitUntil: 'networkidle' });
  const f = page.locator('form.mb-form');
  await f.getByLabel('Code *').fill(`W-${sfx}`); await f.getByLabel('Name *').fill(`Main ${sfx}`); await f.getByLabel('Kind *').selectOption('warehouse');
  await page.getByRole('button', { name: 'Create location' }).click();
  await page.getByRole('status').filter({ hasText: 'location created' }).waitFor();
  const row = page.locator('tr', { hasText: `W-${sfx}` }); await row.waitFor();
  // Duplicate code -> server error shown as alert.
  await f.getByLabel('Code *').fill(`w-${sfx}`); await f.getByLabel('Name *').fill('dup'); await f.getByLabel('Kind *').selectOption('bin');
  await page.getByRole('button', { name: 'Create location' }).click();
  await page.getByRole('alert').filter({ hasText: 'already exists' }).waitFor();
  // Purchase order: create, order, receive -> stock rises.
  await page.goto(`${base}/workspace/stock/supplier-purchase-orders`, { waitUntil: 'networkidle' });
  await f.getByLabel('Supplier *').fill(`Acme ${sfx}`); await f.getByLabel('Product *').selectOption(prod.id);
  await f.getByLabel('Quantity *').fill('6'); await f.getByLabel('Unit cost (paise) *').fill('3000');
  await f.getByLabel('Receive into *').selectOption({ label: `W-${sfx}` });
  await page.getByRole('button', { name: 'Create purchase order' }).click();
  const po = page.locator('tr', { hasText: `Acme ${sfx}` }); await po.waitFor();
  await po.getByRole('button', { name: 'Mark ordered' }).click(); await po.getByText('ordered', { exact: true }).waitFor();
  await po.getByRole('button', { name: 'Receive' }).click(); await po.getByText('received', { exact: true }).waitFor();
  const snap = await (await page.request.get(`${base}/api/business`)).json();
  assert.equal(snap.products.find((p) => p.id === prod.id).stock, 10);
  // Stale: another writer edits the location while this tab shows the old version.
  await page.goto(`${base}/workspace/stock/warehouse-and-location-matrix`, { waitUntil: 'networkidle' });
  const view = await (await page.request.get(`${base}/api/modules/stock.warehouse-and-location-matrix`)).json();
  const rec = view.records.find((r) => r.data.code === `W-${sfx}`);
  assert.equal((await post('/api/modules/stock.warehouse-and-location-matrix', { action: 'update', id: rec.id, version: rec.version, data: { code: `W-${sfx}`, name: 'Renamed', kind: 'store' } })).status(), 200);
  await page.locator('tr', { hasText: `W-${sfx}` }).getByRole('button', { name: 'Archive' }).click();
  await page.getByRole('alert').filter({ hasText: 'Stale' }).waitFor();
  await page.getByRole('status').filter({ hasText: 'out of date' }).getByRole('button', { name: 'Reload' }).click();
  await page.locator('tr', { hasText: 'Renamed' }).waitFor();
}
