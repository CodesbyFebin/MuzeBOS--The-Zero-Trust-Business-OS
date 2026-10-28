/** Business-record reads need a signed-in member of THIS workspace with finance.read. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BusinessStore, businessStore } from '@/lib/muzebos/store';
import { member, DEPARTMENTS } from '@/lib/muzebos/biz/members';
import { setupWorkspace, invite, outbox, redeemMagicLink, memberForToken, USER_COOKIE } from '@/lib/muzebos/biz/accounts';
const dir = mkdtempSync(path.join(tmpdir(), 'mb-reads-'));
let ownerT = ''; let staffT = '';
const ROUTES = { 'command-center': () => import('@/app/api/muzebos/command-center/route'), overdue: () => import('@/app/api/muzebos/overdue/route') };
const get = async (name: keyof typeof ROUTES, token?: string) => (await (await ROUTES[name]()).GET(new Request(`http://localhost/api/muzebos/${name}`, { headers: token ? { cookie: `${USER_COOKIE}=${token}` } : {} })) as Response);
beforeAll(() => {
  process.env.MUZEBOS_DB = path.join(dir, 'a.sqlite'); const s = businessStore();
  ownerT = setupWorkspace(s, { workspace: 'A', name: 'Owner', email: 'owner@example.com', password: 'correct horse battery' }).token;
  const c = s.customer({ name: 'Secret Customer', email: 'c@example.com' }); const p = s.product({ name: 'X', sku: 'X1', price: 100, taxBps: 0, stock: 9 });
  const o = s.draft({ customerId: c.id, lines: [{ productId: p.id, quantity: 1 }] }); s.approve(o.id, o.hash); s.issue(o.id, o.hash);
  invite(s, member(s, 'owner'), { name: 'Staff', email: 'staff@example.com', role: 'member', department: DEPARTMENTS[0] }, 'http://localhost');
  const link = /link=([^\s]+)/.exec(outbox(s)[0].body)![1]; staffT = redeemMagicLink(s, link).token;
});
afterAll(() => { businessStore().close(); rmSync(dir, { recursive: true, force: true }); });

describe.each(Object.keys(ROUTES) as (keyof typeof ROUTES)[])('GET /api/muzebos/%s', (name) => {
  it('401 when signed out, with no business data in the body', async () => {
    const r = await get(name); expect(r.status).toBe(401); expect(await r.text()).not.toContain('Secret Customer');
  });
  it('401 for an unknown or forged session token', async () => { expect((await get(name, 'not-a-real-token')).status).toBe(401); });
  it('403 for a signed-in member without finance.read', async () => {
    const r = await get(name, staffT); expect(r.status).toBe(403); expect(await r.text()).not.toContain('Secret Customer');
  });
  it('200 for the owner', async () => { expect((await get(name, ownerT)).status).toBe(200); });
});
describe('cross-workspace', () => {
  it('a session from workspace A is not a member of workspace B (separate database)', () => {
    const b = new BusinessStore(path.join(dir, 'b.sqlite'));
    try { setupWorkspace(b, { workspace: 'B', name: 'Other', email: 'other@example.com', password: 'another long secret' });
      expect(memberForToken(b, ownerT)).toBeNull(); expect(memberForToken(businessStore(), ownerT)?.id).toBe('owner');
    } finally { b.close(); }
  });
});
