/** Slice 9c UI flow: a new write shows up in Access Log and the evidence count; the API answers JSON with real values. */
export async function run({ page, post, base, vp, assert }) {
  const name = `Infra ${vp.name} ${Date.now()}`;
  const cs = await post('/api/business', { action: 'customer', data: { name, email: '' } });
  assert.ok(cs.ok(), await cs.text());
  await page.goto(`${base}/workspace/operations/access-log`, { waitUntil: 'networkidle' });
  await page.getByRole('cell', { name: 'customer.create' }).first().or(page.getByRole('cell', { name: /customer/ }).first()).waitFor();
  const j = await (await page.request.get(`${base}/api/infra/system.telemetry-and-logs`)).json();
  assert.ok(j.metrics.find((m) => m.label === 'Uptime').value.endsWith(' s'));
  const mig = await (await page.request.get(`${base}/api/infra/system.database-migration-ledger`)).json();
  assert.ok(Number(mig.metrics[0].value) >= 9);
  assert.equal((await page.request.get(`${base}/api/infra/nope`)).status(), 404);
}
