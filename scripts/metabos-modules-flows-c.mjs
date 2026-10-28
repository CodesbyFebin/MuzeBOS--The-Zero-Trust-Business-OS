/** Batch (c) UI flow: store a document through the form, see its real sha256, refuse a mismatched copy, accept the exact copy. */
import { createHash } from 'node:crypto';
export async function run({ page, base, vp, assert }) {
  const sfx = `${vp.name}-${Date.now() % 100000}`;
  const text = `Lease ${sfx}: rent 25000 per month`;
  const h = createHash('sha256').update(text, 'utf8').digest('hex');
  await page.goto(`${base}/workspace/foundation/documents`, { waitUntil: 'networkidle' });
  const f = page.locator('form.mb-form');
  await f.getByLabel('Title *').fill(`Lease ${sfx}`);
  await f.getByLabel('Category *').selectOption('contract');
  await f.getByLabel('Content *').fill(text);
  await page.getByRole('button', { name: 'Create document' }).click();
  const row = page.locator('tr', { hasText: `Lease ${sfx}` }).first();
  await row.waitFor();
  const v = await (await page.request.get(`${base}/api/modules/foundation.documents-vault`)).json();
  const rec = v.records.find((r) => r.data.title === `Lease ${sfx}`);
  assert.equal(rec.data.sha256, h);
  const copy = row.getByLabel('Verify copy: Copy to verify');
  await copy.fill(text + ' tampered');
  await row.getByRole('button', { name: 'Verify copy' }).click();
  await page.getByRole('alert').filter({ hasText: 'Hash mismatch' }).waitFor();
  await page.locator('tr', { hasText: `Lease ${sfx}` }).first().getByLabel('Verify copy: Copy to verify').fill(text);
  await page.locator('tr', { hasText: `Lease ${sfx}` }).first().getByRole('button', { name: 'Verify copy' }).click();
  await page.getByText('Verify copy: done').first().waitFor();
  const after = (await (await page.request.get(`${base}/api/modules/foundation.documents-vault`)).json()).records.find((r) => r.id === rec.id);
  assert.ok(after.data.lastVerifiedAt);
}
