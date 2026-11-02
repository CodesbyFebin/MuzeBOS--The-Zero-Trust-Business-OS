/** Batch (e) UI flow: redeem a coupon from its row (integer discount recorded), below-minimum refused as an alert. No send controls exist. */
export async function run({ page, post, base, vp, assert }) {
  const code = `E${vp.name.slice(0, 1).toUpperCase()}${Date.now() % 1000000}`;
  const d = new Date().toISOString().slice(0, 10), to = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
  const r = await post('/api/modules/growth.coupon-engine', { action: 'create', data: { code, kind: 'percent', percentBps: 1000, minOrder: 50000, validFrom: d, validTo: to, maxRedemptions: 3 } });
  assert.ok(r.ok(), await r.text());
  await page.goto(`${base}/workspace/growth/coupons`, { waitUntil: 'networkidle' });
  const row = () => page.locator('tr', { hasText: code }).first();
  await row().getByLabel('Redeem: Order total (paise)').fill('100005');
  await row().getByRole('button', { name: 'Redeem' }).click();
  await page.getByText('Redeem: done').first().waitFor();
  await row().getByLabel('Redeem: Order total (paise)').fill('100');
  await row().getByRole('button', { name: 'Redeem' }).click();
  await page.getByRole('alert').filter({ hasText: 'below the minimum' }).waitFor();
  const rec = (await (await page.request.get(`${base}/api/modules/growth.coupon-engine`)).json()).records.find((x) => x.data.code === code);
  assert.equal(rec.data.redemptions, 1); assert.equal(rec.data.discountGiven, 10001);
  for (const route of ['talk/template-manager', 'talk/canned-replies']) {
    await page.goto(`${base}/workspace/${route}`, { waitUntil: 'networkidle' });
    assert.equal(await page.getByRole('button', { name: /send/i }).count(), 0, `${route} must not offer a send control`);
  }
}
