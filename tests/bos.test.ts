import { describe, expect, it } from 'vitest';
import { desksFrom } from '@/lib/metabos/bos/core';
const now = Date.parse('2026-11-02T10:00:00Z');
describe('Agent Office desks come only from records', () => {
  it('no records → no desks', () => expect(desksFrom([], now)).toEqual([]));
  it('pending Jev → awaiting_approval glow; tool counts summed', () => {
    const d = desksFrom([{ agent: 'a', at: '2026-11-02T08:00:00Z', status: 'awaiting_approval', action: 'x', tools: 2, model: null }, { agent: 'a', at: '2026-11-02T07:00:00Z', status: 'succeeded', action: 'y', tools: 3, model: 'm' }], now);
    expect(d[0]).toMatchObject({ state: 'awaiting_approval', pending: 1, toolCalls: 5, model: 'm', lastAction: 'x' });
  });
  it('rejected, working and idle; tool count null when never recorded', () => {
    const d = desksFrom([{ agent: 'r', at: '2026-11-02T08:00:00Z', status: 'cancelled', action: 'x', tools: null, model: null }, { agent: 'w', at: '2026-11-02T09:55:00Z', status: 'succeeded', action: 'x', tools: null, model: null }, { agent: 'i', at: '2026-11-01T09:55:00Z', status: 'succeeded', action: 'x', tools: null, model: null }], now);
    expect(Object.fromEntries(d.map((x) => [x.agent, x.state]))).toEqual({ r: 'rejected', w: 'working', i: 'idle' });
    expect(d.every((x) => x.toolCalls === null)).toBe(true);
  });
});
import { BusinessStore } from '@/lib/metabos/store';
import { hq, office, pipeline, sanctumReceipts, trustStack } from '@/lib/metabos/bos/core';
import { decide, dispatch, propose } from '@/lib/metabos/dispatch/service';
describe('Business Open Server on a fresh store', () => {
  it('is empty: no desks, no receipts, zero pipeline, R6 empty, R0–R2 not attested', () => {
    const s = new BusinessStore(':memory:');
    expect(office(s).desks).toEqual([]); expect(sanctumReceipts(s, {}).dispatches).toEqual([]);
    expect(pipeline(s).every((p) => p.count === 0)).toBe(true); expect(hq(s).evidenceRows).toBe(0);
    const t = trustStack(s, {}); expect(t.find((l) => l.id === 'R6')!.state).toBe('empty');
    expect(t.filter((l) => ['R0', 'R1', 'R2'].includes(l.id)).every((l) => l.state === 'not_attested')).toBe(true);
  });
  it('Sanctum plan → Jev → dispatch respects DRY_RUN and the receipt lands in the evidence chain', async () => {
    const s = new BusinessStore(':memory:'); const env = { MUZEBOS_WHATSAPP_CLOUD_ACCESS_TOKEN: 'test-only', MUZEBOS_WHATSAPP_PHONE_NUMBER_ID: '1' };
    const d = propose(s, 'owner', 'whatsapp', { to: '+919999999999', body: '[MUSE plan] order ready' });
    expect(sanctumReceipts(s, env).dispatches[0].status).toBe('pending');
    decide(s, 'owner', d.id, d.payloadHash, true);
    let called = false;
    await expect(dispatch(s, d.id, d.payloadHash, crypto.randomUUID(), { env, fetch: async () => { called = true; return new Response('{}'); } })).rejects.toThrow(/Dry run/);
    expect(called).toBe(false);
    const r = sanctumReceipts(s, env); expect(r.dryRun).toBe(true); expect(r.evidence.map((e) => e.action)).toEqual(['dispatch.dry-run', 'dispatch.approved', 'dispatch.proposed']);
    expect(pipeline(s).find((p) => p.id === 'sandbox')!.count).toBe(1); expect(trustStack(s, env).find((l) => l.id === 'R6')!.state).toMatch(/^(chain_verified|attested_hash_commitment)$/);
  });
});
import { discord, operator, review } from '@/lib/metabos/bos/operator';
import { propose as jevPropose } from '@/lib/metabos/ai/jev';
describe('Operator console and two-reviewer Jev', () => {
  it('fresh store: no scope, no Jev, CLI not connected; Governance channels exist but are empty', () => {
    const s = new BusinessStore(':memory:'); const o = operator(s, {});
    expect(o.scope).toEqual([]); expect(o.jev).toEqual([]); expect(o.cli.session).toBeNull();
    const gov = discord(s).groups.find((g) => g.name === 'Governance')!; expect(gov.channels.map((c) => c.name)).toEqual(['jev-approvals', 'audit-log', 'kill-switch', 'compliance']);
    expect(gov.channels.every((c) => c.messages.length === 0)).toBe(true);
  });
  it('needs two different reviewers; the same person twice is refused', () => {
    const s = new BusinessStore(':memory:'); const r = jevPropose(s, { taskId: 't1', role: 'operations', tool: 'reminders.create', args: { title: 'Call supplier' }, source: 'rule' });
    const a = review(s, 'u-a', { runId: r.id, payloadHash: r.payloadHash, approve: true }); expect(a.run.status).toBe('awaiting_approval'); expect(a.reviewers).toEqual(['u-a']);
    expect(() => review(s, 'u-a', { runId: r.id, payloadHash: r.payloadHash, approve: true })).toThrow(/different reviewer/);
    const b = review(s, 'u-b', { runId: r.id, payloadHash: r.payloadHash, approve: true }); expect(b.run.status).not.toBe('awaiting_approval'); expect(b.reviewers).toEqual(['u-a', 'u-b']);
  });
});
