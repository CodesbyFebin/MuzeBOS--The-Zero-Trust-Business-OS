/** Batch (b) UI flows: issue an invoice, create credit notes through the form, issue with CN number, over-credit refused as an alert. */
export async function run({ page, post, base, vp, assert }) {
  const sfx = `${vp.name.toUpperCase()}${Date.now() % 100000}`;
  const j = async (r) => { const b = await r.json(); assert.ok(r.ok(), JSON.stringify(b)); return b.result; };
  const cust = await j(await post('/api/business', { action: 'customer', data: { name: `Cust ${sfx}`, email: '' } }));
  const prod = await j(await post('/api/business', { action: 'product', data: { name: `Lamp ${sfx}`, sku: `LMP-${sfx}`, price: 10000, taxBps: 0, stock: 5 } }));
  const order = await j(await post('/api/business', { action: 'draft', data: { customerId: cust.id, lines: [{ productId: prod.id, quantity: 1 }] } }));
  await j(await post('/api/business', { action: 'approve', id: order.id, hash: order.hash }));
  const inv = await j(await post('/api/business', { action: 'issue', id: order.id, hash: order.hash }));
  await page.goto(`${base}/workspace/money/credit-notes`, { waitUntil: 'networkidle' });
  const f = page.locator('form.mb-form');
  const make = async (amount, reason) => {
    await f.getByLabel('Invoice *').selectOption(inv.id); await f.getByLabel('Amount (paise) *').fill(String(amount)); await f.getByLabel('Reason *').fill(reason);
    await page.getByRole('button', { name: 'Create credit note' }).click();
    await page.locator('tr', { hasText: reason }).or(page.locator('tr', { hasText: `INR ${(amount / 100).toFixed(2)}` })).first().waitFor();
  };
  await make(7000, `A ${sfx}`); await make(4000, `B ${sfx}`);
  const rowA = page.locator('tr', { hasText: 'INR 70.00' }).first();
  await rowA.getByRole('button', { name: 'Issue' }).click();
  await rowA.getByText('issued', { exact: true }).waitFor();
  await page.locator('tr', { hasText: 'INR 40.00' }).first().getByRole('button', { name: 'Issue' }).click();
  await page.getByRole('alert').filter({ hasText: 'remains creditable' }).waitFor();
  const v = await (await page.request.get(`${base}/api/modules/money.credit-notes`)).json();
  const mine = v.records.filter((r) => r.data.invoiceId === inv.id);
  assert.equal(mine.filter((r) => r.status === 'issued').length, 1);
  assert.match(mine.find((r) => r.status === 'issued').data.number, /^CN-\d{4}$/);
}
