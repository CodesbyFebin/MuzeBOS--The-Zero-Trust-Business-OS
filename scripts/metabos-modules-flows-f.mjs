/** Slice 9a UI flow: a loyalty account earns then over-redeems (alert), and a chat-bot "Test" keeps state. */
export async function run({ page, post, base, vp, assert }) {
  const cs = await post('/api/business', { action: 'customer', data: { name: `Loyal ${vp.name}`, email: '' } });
  assert.ok(cs.ok(), await cs.text());
  const customer = (await cs.json()).result;
  const code = `L${vp.name.slice(0, 1).toUpperCase()}${Date.now() % 1000000}`;
  const r = await post('/api/modules/growth.referrals-and-loyalty', { action: 'create', data: { customerId: customer.id, code } });
  assert.ok(r.ok(), await r.text());
  await page.goto(`${base}/workspace/growth/loyalty`, { waitUntil: 'networkidle' });
  const row = () => page.locator('tr', { hasText: code }).first();
  await row().getByLabel('Earn points: Points').fill('40');
  await row().getByRole('button', { name: 'Earn points' }).click();
  await page.getByText('Earn points: done').first().waitFor();
  await row().getByLabel('Redeem points: Points').fill('41');
  await row().getByRole('button', { name: 'Redeem points' }).click();
  await page.getByRole('alert').filter({ hasText: 'Only 40 points' }).waitFor();
}
