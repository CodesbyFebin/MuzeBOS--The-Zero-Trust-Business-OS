/** Business-record reads need a signed-in member of THIS workspace with finance.read. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BusinessStore, businessStore } from '@/lib/metabos/store';
import { member, DEPARTMENTS } from '@/lib/metabos/biz/members';
import { setupWorkspace, invite, outbox, redeemMagicLink, memberForToken, USER_COOKIE } from '@/lib/metabos/biz/accounts';
const dir = mkdtempSync(path.join(tmpdir(), 'mb-reads-'));
let ownerT = ''; let staffT = '';
type Mod = { GET: (r: Request, c?: unknown) => Response | Promise<Response> };
const ROUTES: { route: string; perm: string | null; url: string; params: Record<string, string>; load: () => Promise<unknown> }[] = [
  { route: 'metabos/command-center', perm: 'finance.read', url: 'metabos/command-center', params: {}, load: () => import('@/app/api/metabos/command-center/route') },
  { route: 'metabos/overdue', perm: 'finance.read', url: 'metabos/overdue', params: {}, load: () => import('@/app/api/metabos/overdue/route') },
  { route: 'ai', perm: 'finance.read', url: 'ai', params: {}, load: () => import('@/app/api/ai/route') },
  { route: 'analytics', perm: 'finance.read', url: 'analytics', params: {}, load: () => import('@/app/api/analytics/route') },
  { route: 'business', perm: 'finance.read', url: 'business', params: {}, load: () => import('@/app/api/business/route') },
  { route: 'evidence', perm: 'finance.read', url: 'evidence', params: {}, load: () => import('@/app/api/evidence/route') },
  { route: 'inference', perm: 'finance.read', url: 'inference', params: {}, load: () => import('@/app/api/inference/route') },
  { route: 'infra/[page]', perm: 'finance.read', url: 'infra/system.telemetry-and-logs', params: { page: 'system.telemetry-and-logs' }, load: () => import('@/app/api/infra/[page]/route') },
  { route: 'mission-control', perm: 'finance.read', url: 'mission-control', params: {}, load: () => import('@/app/api/mission-control/route') },
  { route: 'modules/[module]', perm: 'finance.read', url: 'modules/stock.low-stock-alert', params: { module: 'stock.low-stock-alert' }, load: () => import('@/app/api/modules/[module]/route') },
  { route: 'metabos/chief-of-staff', perm: 'finance.read', url: 'metabos/chief-of-staff', params: {}, load: () => import('@/app/api/metabos/chief-of-staff/route') },
  { route: 'metabos/founder', perm: 'finance.read', url: 'metabos/founder', params: {}, load: () => import('@/app/api/metabos/founder/route') },
  { route: 'metabos/walls', perm: 'finance.read', url: 'metabos/walls', params: {}, load: () => import('@/app/api/metabos/walls/route') },
  { route: 'providers/[module]', perm: 'finance.read', url: 'providers/talk.whatsapp-hub', params: { module: 'talk.whatsapp-hub' }, load: () => import('@/app/api/providers/[module]/route') },
  { route: 'workflow-runs', perm: 'finance.read', url: 'workflow-runs', params: {}, load: () => import('@/app/api/workflow-runs/route') },
  { route: 'metabos/hubs/money', perm: 'finance.read', url: 'metabos/hubs/money', params: { hub: 'money' }, load: () => import('@/app/api/metabos/hubs/[hub]/route') },
  { route: 'metabos/hubs/brain', perm: 'finance.read', url: 'metabos/hubs/brain', params: { hub: 'brain' }, load: () => import('@/app/api/metabos/hubs/[hub]/route') },
  { route: 'metabos/hubs/growth', perm: 'finance.read', url: 'metabos/hubs/growth', params: { hub: 'growth' }, load: () => import('@/app/api/metabos/hubs/[hub]/route') },
  { route: 'metabos/hubs/activity', perm: 'finance.read', url: 'metabos/hubs/activity', params: { hub: 'activity' }, load: () => import('@/app/api/metabos/hubs/[hub]/route') },
  { route: 'metabos/hubs/agents', perm: 'finance.read', url: 'metabos/hubs/agents', params: { hub: 'agents' }, load: () => import('@/app/api/metabos/hubs/[hub]/route') },
  { route: 'bookings', perm: null, url: 'bookings', params: {}, load: () => import('@/app/api/bookings/route') },
  { route: 'metabos/pipeline', perm: null, url: 'metabos/pipeline', params: {}, load: () => import('@/app/api/metabos/pipeline/route') },
  { route: 'metabos/expenses', perm: null, url: 'metabos/expenses', params: {}, load: () => import('@/app/api/metabos/expenses/route') },
  { route: 'metabos/goals', perm: null, url: 'metabos/goals', params: {}, load: () => import('@/app/api/metabos/goals/route') },
  { route: 'metabos/memory', perm: null, url: 'metabos/memory', params: {}, load: () => import('@/app/api/metabos/memory/route') },
  { route: 'metabos/missions', perm: null, url: 'metabos/missions', params: {}, load: () => import('@/app/api/metabos/missions/route') },
  { route: 'brain-templates', perm: null, url: 'brain-templates', params: {}, load: () => import('@/app/api/brain-templates/route') },
  { route: 'mission-control/layout', perm: null, url: 'mission-control/layout', params: {}, load: () => import('@/app/api/mission-control/layout/route') },
];
const get = async (r: (typeof ROUTES)[number], token?: string) => { const m = (await r.load()) as Mod; return await m.GET(new Request(`http://localhost/api/${r.url}`, { headers: token ? { cookie: `${USER_COOKIE}=${token}` } : {} }), { params: Promise.resolve(r.params) }); };
beforeAll(() => {
  process.env.MUZEBOS_DB = path.join(dir, 'a.sqlite'); const s = businessStore();
  ownerT = setupWorkspace(s, { workspace: 'A', name: 'Owner', email: 'owner@example.com', password: 'correct horse battery' }).token;
  const c = s.customer({ name: 'Secret Customer', email: 'c@example.com' }); const p = s.product({ name: 'X', sku: 'X1', price: 100, taxBps: 0, stock: 9 });
  const o = s.draft({ customerId: c.id, lines: [{ productId: p.id, quantity: 1 }] }); s.approve(o.id, o.hash); s.issue(o.id, o.hash);
  invite(s, member(s, 'owner'), { name: 'Staff', email: 'staff@example.com', role: 'member', department: DEPARTMENTS[0] }, 'http://localhost');
  const link = /link=([^\s]+)/.exec(outbox(s)[0].body)![1]; staffT = redeemMagicLink(s, link).token;
});
afterAll(() => { businessStore().close(); rmSync(dir, { recursive: true, force: true }); });

describe.each(ROUTES)('GET /api/$route', (r) => {
  it('401 when signed out, with no business data in the body', async () => {
    const res = await get(r); expect(res.status).toBe(401); expect(await res.text()).not.toContain('Secret Customer');
  });
  it('401 for an unknown or forged session token', async () => { expect((await get(r, 'not-a-real-token')).status).toBe(401); });
  it(r.perm ? `403 for the member role (lacks ${r.perm})` : '200 for any signed-in member', async () => {
    const res = await get(r, staffT); expect(res.status).toBe(r.perm ? 403 : 200);
    if (r.perm) expect(await res.text()).not.toContain('Secret Customer');
  });
  it('200 for the owner', async () => { expect((await get(r, ownerT)).status).toBe(200); });
});
describe('cross-workspace', () => {
  it('a session from workspace A is not a member of workspace B (separate database)', () => {
    const b = new BusinessStore(path.join(dir, 'b.sqlite'));
    try { setupWorkspace(b, { workspace: 'B', name: 'Other', email: 'other@example.com', password: 'another long secret' });
      expect(memberForToken(b, ownerT)).toBeNull(); expect(memberForToken(businessStore(), ownerT)?.id).toBe('owner');
    } finally { b.close(); }
  });
});
