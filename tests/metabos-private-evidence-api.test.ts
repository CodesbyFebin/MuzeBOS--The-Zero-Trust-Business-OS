import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { businessStore } from '@/lib/metabos/store';
import { setupWorkspace, invite, outbox, redeemMagicLink, USER_COOKIE } from '@/lib/metabos/biz/accounts';
import { member, DEPARTMENTS } from '@/lib/metabos/biz/members';
import { GET } from '@/app/api/evidence/route';
import { verifyEvidenceBundle, verifyEvidenceProof } from '@/lib/metabos/evidence-bundle';
const directory = mkdtempSync(path.join(tmpdir(), 'private-evidence-api-'));
const oldDB = process.env.MUZEBOS_DB; let owner = '', staff = '';
const get = (query: string, token?: string) => GET(new Request('http://localhost/api/evidence?' + query, { headers: token ? { cookie: USER_COOKIE + '=' + token } : {} }));
beforeAll(() => {
  process.env.MUZEBOS_DB = path.join(directory, 'business.sqlite'); const store = businessStore();
  owner = setupWorkspace(store, { workspace: 'Export fixture', name: 'Owner', email: 'owner@example.com', password: 'private test password' }).token;
  store.reminder({ title: 'Confidential export fixture' });
  invite(store, member(store, 'owner'), { name: 'Staff', email: 'staff@example.com', role: 'member', department: DEPARTMENTS[0] }, 'http://localhost');
  staff = redeemMagicLink(store, /link=([^\s]+)/.exec(outbox(store)[0].body)![1]).token;
});
afterAll(() => { businessStore().close(); if (oldDB === undefined) delete process.env.MUZEBOS_DB; else process.env.MUZEBOS_DB = oldDB; rmSync(directory, { recursive: true, force: true }); });
describe('Private evidence API retains workspace and finance-read boundaries', () => {
  it.each(['bundle', 'proof&seq=1'])('does not disclose %s to signed-out or forged sessions', async format => {
    for (const token of [undefined, 'forged']) {
      const res = await get('format=' + format, token); expect(res.status).toBe(401);
      expect(await res.text()).not.toContain('Confidential export fixture');
    }
  });
  it.each(['bundle', 'proof&seq=1'])('rejects member without finance.read for %s', async format => {
    const res = await get('format=' + format, staff); expect(res.status).toBe(403);
    expect(await res.text()).not.toContain('Confidential export fixture');
  });
  it('exports the full chain rather than silently making filters into a partial proof', async () => {
    const res = await get('format=bundle&action=nonexistent&q=unmatched', owner); expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store'); expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    const bundle = await res.json(); expect(bundle.recordCount).toBe(businessStore().evidence().length);
    expect(verifyEvidenceBundle(bundle).valid).toBe(true);
  });
  it('exports a verifiable inclusion proof for an authorized event', async () => {
    const bundle = await (await get('format=bundle', owner)).json();
    const res = await get('format=proof&seq=1', owner); expect(res.status).toBe(200);
    expect(verifyEvidenceProof(await res.json(), bundle.rootHash).valid).toBe(true);
  });
  it.each(['0', '-1', '1.5', '1e3', 'x'])('rejects malformed sequence %s', async seq => {
    expect((await get('format=proof&seq=' + seq, owner)).status).toBe(400);
  });
  it('returns not found without a fabricated proof', async () => { expect((await get('format=proof&seq=999999', owner)).status).toBe(404); });
  it('refuses to bless a damaged local chain', async () => {
    const store = businessStore(), first = store.evidence()[0];
    store.db.prepare('UPDATE mb_audit SET detail=? WHERE seq=?').run('tampered', first.seq);
    try {
      expect((await get('format=bundle', owner)).status).toBe(422);
      expect((await get('format=proof&seq=1', owner)).status).toBe(422);
    } finally { store.db.prepare('UPDATE mb_audit SET detail=? WHERE seq=?').run(first.detail, first.seq); }
  });
});
