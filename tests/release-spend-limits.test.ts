/** Live-call spend limits are stored in the workspace DB, bounded by hard ceilings, owner-only, audited, and enforced by liveGate. */
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BusinessStore, businessStore } from '@/lib/metabos/store';
import { liveGate, spendLimits, setSpendLimits, DRAFT_LIMITS, SPEND_CEILINGS } from '@/lib/metabos/overdue';
import { setupWorkspace, invite, outbox, redeemMagicLink, USER_COOKIE } from '@/lib/metabos/biz/accounts';
import { member, DEPARTMENTS } from '@/lib/metabos/biz/members';
const dir = mkdtempSync(path.join(tmpdir(), 'mb-limits-')); const stores: BusinessStore[] = [];
let n = 0; const open = () => { const s = new BusinessStore(path.join(dir, `${n++}.sqlite`)); stores.push(s); return s; };
afterEach(() => { stores.splice(0).forEach((s) => s.db.open && s.close()); });
afterAll(() => { const s = businessStore(); if (s.db.open) s.close(); rmSync(dir, { recursive: true, force: true }); });
const LIVE_ENV = { META_MODEL_API_KEY: 'test-key-not-real', META_PRICE_IN_PER_MTOK_USD: '1', META_PRICE_OUT_PER_MTOK_USD: '2' };
const day = (n: number) => new Date(n).toISOString().slice(0, 10);

describe('stored spend limits', () => {
  it('defaults to the built-in caps until configured, then persists across reopen', () => {
    const s = open(); expect(spendLimits(s)).toMatchObject({ maxCallsPerDay: DRAFT_LIMITS.maxCallsPerDay, source: 'default' });
    setSpendLimits(s, 'owner', { maxCallsPerDay: 3, maxUsdPerCall: 0.01, maxUsdPerDay: 0.05 }); const file = s.db.name; s.close();
    const again = new BusinessStore(file); stores.push(again);
    expect(spendLimits(again)).toEqual({ maxCallsPerDay: 3, maxUsdPerCall: 0.01, maxUsdPerDay: 0.05, source: 'configured' });
    expect(again.evidence().map((e) => e.action)).toContain('overdue.limits.set');
  });
  it('liveGate enforces the stored limits, not the constants', () => {
    const s = open(); const now = Date.now(); expect(liveGate(s, LIVE_ENV, now).available).toBe(true);
    setSpendLimits(s, 'owner', { maxCallsPerDay: 2, maxUsdPerCall: 0.02, maxUsdPerDay: 0.25 });
    s.db.prepare('INSERT INTO mb_settings VALUES(?,?)').run(`overdue.spend.${day(now)}`, JSON.stringify({ calls: 2, usd: 0 }));
    expect(liveGate(s, LIVE_ENV, now).reason).toMatch(/Daily call cap reached \(2\)/);
    setSpendLimits(s, 'owner', { maxCallsPerDay: 20, maxUsdPerCall: 0.001, maxUsdPerDay: 0.25 });
    expect(liveGate(s, LIVE_ENV, now).reason).toMatch(/per-call cap \(USD 0.001\)/);
    setSpendLimits(s, 'owner', { maxCallsPerDay: 0, maxUsdPerCall: 0, maxUsdPerDay: 0 });
    expect(liveGate(s, LIVE_ENV, now).available).toBe(false);
  });
  it('rejects values above the hard ceilings, per-call above daily, and fails closed on a corrupt row', () => {
    const s = open();
    expect(() => setSpendLimits(s, 'owner', { maxCallsPerDay: SPEND_CEILINGS.maxCallsPerDay + 1, maxUsdPerCall: 0.01, maxUsdPerDay: 0.1 })).toThrow();
    expect(() => setSpendLimits(s, 'owner', { maxCallsPerDay: 5, maxUsdPerCall: 0.01, maxUsdPerDay: 5 })).toThrow();
    expect(() => setSpendLimits(s, 'owner', { maxCallsPerDay: 5, maxUsdPerCall: 0.05, maxUsdPerDay: 0.01 })).toThrow(/daily cap/);
    s.db.prepare("INSERT INTO mb_settings VALUES('overdue.limits','{bad')").run();
    expect(spendLimits(s)).toMatchObject({ maxCallsPerDay: 0, maxUsdPerDay: 0 }); expect(liveGate(s, LIVE_ENV).available).toBe(false);
  });
  it('API: only the owner (finance.write) may change limits; GET returns the stored values', async () => {
    process.env.MUZEBOS_DB = path.join(dir, 'api.sqlite'); const s = businessStore();
    const owner = setupWorkspace(s, { workspace: 'L', name: 'Owner', email: 'o@example.com', password: 'long enough secret' }).token;
    invite(s, member(s, 'owner'), { name: 'Mgr', email: 'm@example.com', role: 'manager', department: DEPARTMENTS[0] }, 'http://localhost');
    const mgr = redeemMagicLink(s, /link=([^\s]+)/.exec(outbox(s)[0].body)![1]).token;
    const { GET, POST } = await import('@/app/api/metabos/overdue/route');
    const post = (token: string) => POST(new Request('http://localhost/api/metabos/overdue', { method: 'POST', headers: { origin: 'http://localhost', host: 'localhost', 'content-type': 'application/json', cookie: `${USER_COOKIE}=${token}` }, body: JSON.stringify({ action: 'limits', limits: { maxCallsPerDay: 4, maxUsdPerCall: 0.01, maxUsdPerDay: 0.04 } }) }));
    expect((await post(mgr)).status).toBe(403); expect(spendLimits(s).source).toBe('default');
    expect((await post(owner)).status).toBe(200);
    const v = await (await GET(new Request('http://localhost/api/metabos/overdue', { headers: { cookie: `${USER_COOKIE}=${owner}` } }))).json();
    expect(v.limits).toMatchObject({ maxCallsPerDay: 4, maxUsdPerCall: 0.01, maxUsdPerDay: 0.04, source: 'configured', maxOutputTokens: DRAFT_LIMITS.maxOutputTokens });
  });
});
