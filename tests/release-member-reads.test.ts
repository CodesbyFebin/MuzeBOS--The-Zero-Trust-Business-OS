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
type Mod = { GET: (r: Request, c?: unknown) => Response | Promise<Response> };
const ROUTES: { route: string; perm: string | null; url: string; params: Record<string, string>; load: () => Promise<unknown> }[] = [
  { route: 'muzebos/command-center', perm: 'finance.read', url: 'muzebos/command-center', params: {}, load: () => import('@/app/api/muzebos/command-center/route') },
  { route: 'muzebos/overdue', perm: 'finance.read', url: 'muzebos/overdue', params: {}, load: () => import('@/app/api/muzebos/overdue/route') },
  { route: 'ai', perm: 'finance.read', url: 'ai', params: {}, load: () => import('@/app/api/ai/route') },
  { route: 'analytics', perm: 'finance.read', url: 'analytics', params: {}, load: () => import('@/app/api/analytics/route') },
  { route: 'business', perm: 'finance.read', url: 'business', params: {}, load: () => import('@/app/api/business/route') },
  { route: 'evidence', perm: 'finance.read', url: 'evidence', params: {}, load: () => import('@/app/api/evidence/route') },
  { route: 'inference', perm: 'finance.read', url: 'inference', params: {}, load: () => import('@/app/api/inference/route') },
  { route: 'infra/[page]', perm: 'finance.read', url: 'infra/system.telemetry-and-logs', params: { page: 'system.telemetry-and-logs' }, load: () => import('@/app/api/infra/[page]/route') },
  { route: 'mission-control', perm: 'finance.read', url: 'mission-control', params: {}, load: () => import('@/app/api/mission-control/route') },
  { route: 'modules/[module]', perm: 'finance.read', url: 'modules/stock.low-stock-alert', params: { module: 'stock.low-stock-alert' }, load: () => import('@/app/api/modules/[module]/route') },
  { route: 'muzebos/chief-of-staff', perm: 'finance.read', url: 'muzebos/chief-of-staff', params: {}, load: () => import('@/app/api/muzebos/chief-of-staff/route') },
  { route: 'muzebos/founder', perm: 'finance.read', url: 'muzebos/founder', params: {}, load: () => import('@/app/api/muzebos/founder/route') },
  { route: 'muzebos/walls', perm: 'finance.read', url: 'muzebos/walls', params: {}, load: () => import('@/app/api/muzebos/walls/route') },
  { route: 'providers/[module]', perm: 'finance.read', url: 'providers/talk.whatsapp-hub', params: { module: 'talk.whatsapp-hub' }, load: () => import('@/app/api/providers/[module]/route') },
  { route: 'workflow-runs', perm: 'finance.read', url: 'workflow-runs', params: {}, load: () => import('@/app/api/workflow-runs/route') },
  { route: 'muzebos/hubs/money', perm: 'finance.read', url: 'muzebos/hubs/money', params: { hub: 'money' }, load: () => import('@/app/api/muzebos/hubs/[hub]/route') },
  { route: 'muzebos/hubs/brain', perm: 'finance.read', url: 'muzebos/hubs/brain', params: { hub: 'brain' }, load: () => import('@/app/api/muzebos/hubs/[hub]/route') },
  { route: 'muzebos/hubs/growth', perm: 'finance.read', url: 'muzebos/hubs/growth', params: { hub: 'growth' }, load: () => import('@/app/api/muzebos/hubs/[hub]/route') },
  { route: 'muzebos/hubs/activity', perm: 'finance.read', url: 'muzebos/hubs/activity', params: { hub: 'activity' }, load: () => import('@/app/api/muzebos/hubs/[hub]/route') },
  { route: 'muzebos/hubs/agents', perm: 'finance.read', url: 'muzebos/hubs/agents', params: { hub: 'agents' }, load: () => import('@/app/api/muzebos/hubs/[hub]/route') },
  { route: 'bookings', perm: null, url: 'bookings', params: {}, load: () => import('@/app/api/bookings/route') },
  { route: 'muzebos/pipeline', perm: null, url: 'muzebos/pipeline', params: {}, load: () => import('@/app/api/muzebos/pipeline/route') },
  { route: 'muzebos/expenses', perm: null, url: 'muzebos/expenses', params: {}, load: () => import('@/app/api/muzebos/expenses/route') },
  { route: 'muzebos/goals', perm: null, url: 'muzebos/goals', params: {}, load: () => import('@/app/api/muzebos/goals/route') },
  { route: 'muzebos/memory', perm: null, url: 'muzebos/memory', params: {}, load: () => import('@/app/api/muzebos/memory/route') },
  { route: 'muzebos/missions', perm: null, url: 'muzebos/missions', params: {}, load: () => import('@/app/api/muzebos/missions/route') },
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
