/** Slice 9b UI flow: a WhatsApp message is approved and stays "queued, provider not connected"; Test connection reports Not configured; a non-MUZEBOS_ ref is refused. */
export async function run({ page, post, base, vp, assert }) {
  const cs = await post('/api/business', { action: 'customer', data: { name: `WA ${vp.name}`, email: '' } });
  assert.ok(cs.ok(), await cs.text());
  const customer = (await cs.json()).result;
  const body = `Hello ${vp.name} ${Date.now()}`;
  const r = await post('/api/modules/talk.whatsapp-hub', { action: 'create', data: { customerId: customer.id, phone: '+919800000000', body } });
  assert.ok(r.ok(), await r.text());
  await page.goto(`${base}/workspace/talk/whatsapp`, { waitUntil: 'networkidle' });
  const row = () => page.locator('tr', { hasText: body }).first();
  if (vp.name === 'desktop') {
    await row().getByRole('button', { name: 'Approve and queue' }).click();
    await row().getByText('queued, provider not connected').waitFor();
  }
  const panel = page.getByTestId('provider-panel');
  await panel.getByRole('button', { name: 'Test connection' }).click();
  await panel.getByTestId('provider-test').filter({ hasText: 'Not configured' }).waitFor();
  await panel.getByLabel('Access token env reference').fill('DATABASE_URL');
  await panel.getByRole('button', { name: 'Save reference' }).click();
  await panel.getByRole('alert').filter({ hasText: 'MUZEBOS_' }).waitFor();
  const cfg = await (await page.request.get(`${base}/api/providers/talk.whatsapp-hub`)).json();
  assert.equal(cfg.configured, false);
  const v = await (await page.request.get(`${base}/api/modules/talk.whatsapp-hub`)).json();
  assert.ok(v.records.every((x) => ['draft', 'queued', 'cancelled'].includes(x.status)));
}
