/**
 * Brain/Ops: spend caps and metering, tool risk tiers, flow DSL (proposals only) and counterparty risk.
 * MOCKED HTTP LAYER for the OpenRouter usage test: an in-test fake fetch returns a documented usage block.
 */
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { BusinessStore } from '@/lib/metabos/store';
import { decide, dispatch, listDispatches } from '@/lib/metabos/dispatch/service';
import type { Fetch } from '@/lib/metabos/dispatch/adapters';
import { perform } from '@/lib/metabos/modules/engine';
import { agentSpend, upsertAgent } from '@/lib/metabos/brain/metering';
import { counterparties, gradeCounterpartyEvent, proposeAgentCompletion, recordCounterpartyEvent, runFlow, saveFlow, toolGate } from '@/lib/metabos/brain/ops';

const create = (s: BusinessStore, m: string, data: Record<string, unknown>) => perform(s, m, { action: 'create', data });
const enable = (s: BusinessStore, r: { id: string; module: string; version: number }) => perform(s, r.module, { action: 'transition', id: r.id, version: r.version, transition: 'enable', input: {} });
const seed = (s: BusinessStore) => { const c = s.customer({ name: 'Asha', email: '' }); const p = s.product({ name: 'Mug', sku: 'MUG-1', price: 10000, taxBps: 1800, stock: 10 }); const o = s.draft({ customerId: c.id, lines: [{ productId: p.id, quantity: 1 }] }); s.approve(o.id, o.hash); return { c, inv: s.issue(o.id, o.hash) }; };

describe('agent spend caps', () => {
  it('meters OpenRouter usage per agent and refuses new proposals past the cap', async () => {
    const s = new BusinessStore(':memory:');
    upsertAgent(s, 'owner', 'writer', 'Writer', 1500);
    const r = proposeAgentCompletion(s, 'owner', 'writer', 'Write a short thank-you note');
    expect(r.route.tier).toBeTruthy(); expect(r.dispatch.status).toBe('pending');
    const f: Fetch = async () => ({ status: 200, ok: true, text: async () => JSON.stringify({ model: 'x/y', choices: [{ message: { content: 'Thanks!' } }], usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.002 } }) });
    decide(s, 'owner', r.dispatch.id, r.dispatch.payloadHash, true);
    await dispatch(s, r.dispatch.id, r.dispatch.payloadHash, randomUUID(), { env: { OPENROUTER_API_KEY: 'k' }, fetch: f });
    expect(agentSpend(s, 'writer')).toMatchObject({ cost: 2000 });
    expect(() => proposeAgentCompletion(s, 'owner', 'writer', 'again')).toThrow(/monthly cap/);
    expect(() => proposeAgentCompletion(s, 'owner', 'nobody', 'x')).toThrow(/Unknown agent/);
  });
});

describe('tool risk tiers', () => {
  it('high risk cannot skip Jev; missing tier is treated as high', () => {
    const s = new BusinessStore(':memory:');
    expect(() => create(s, 'brain.tool-registry', { code: 'refund', name: 'Refund', kind: 'connector', scope: 'payments', requiresApproval: false, risk: 'high' })).toThrow(/always require Jev/);
    const low = enable(s, create(s, 'brain.tool-registry', { code: 'lookup', name: 'Lookup', kind: 'internal', scope: 'catalog', requiresApproval: false, risk: 'low' }));
    expect(toolGate(s, 'lookup')).toMatchObject({ needsJev: false, risk: 'low' });
    expect(low.status).toBe('enabled');
    enable(s, create(s, 'brain.tool-registry', { code: 'legacy', name: 'Legacy', kind: 'script', scope: 'x', requiresApproval: true }));
    expect(toolGate(s, 'legacy')).toMatchObject({ risk: 'high', needsJev: true });
    create(s, 'brain.tool-registry', { code: 'draft-only', name: 'D', kind: 'script', scope: 'x', requiresApproval: true, risk: 'medium' });
    expect(() => toolGate(s, 'draft-only')).toThrow(/proposed/);
  });
});

describe('flow DSL', () => {
  it('runs sequence/parallel/oneOf/forEach/evaluate and only proposes dispatches', () => {
    const s = new BusinessStore(':memory:'); seed(s);
    const f = saveFlow(s, 'owner', 'chase', { sequence: [
      { set: { var: 'pending', value: { query: 'pending_invoice_count' } } },
      { parallel: [{ set: { var: 'a', value: 1 } }, { set: { var: 'b', value: 2 } }] },
      { oneOf: { when: [{ if: { left: { var: 'pending' }, op: '>', right: 0 }, then: { forEach: { in: 'phones', as: 'to', do: { propose: { channel: 'whatsapp', payload: { to: '{{to}}', body: '{{pending}} invoice pending' } } } } } }], else: { set: { var: 'none', value: true } } } },
      { set: { var: 'n', value: 0 } },
      { evaluate: { do: { set: { var: 'n', value: { add: [{ var: 'n' }, 1] } } }, until: { left: { var: 'n' }, op: '>=', right: 3 }, maxIterations: 10 } },
    ] });
    const r = runFlow(s, 'owner', f.id, { phones: ['+919876543210', '+919876543211'] });
    expect(r.status).toBe('awaiting_jev'); expect(r.dispatches).toHaveLength(2);
    expect(r.vars).toMatchObject({ pending: 1, a: 1, b: 2, n: 3 });
    expect(listDispatches(s).filter((d) => d.status === 'pending')).toHaveLength(2);
    expect(r.trace.some((t) => t.includes('evaluate iteration 3: condition met'))).toBe(true);
  });
  it('caps the evaluator at 10, rejects bad specs, and rolls back proposals on failure', () => {
    const s = new BusinessStore(':memory:');
    expect(() => saveFlow(s, 'owner', 'bad', { evaluate: { do: { set: { var: 'x', value: 1 } }, until: { left: 1, op: '==', right: 2 }, maxIterations: 11 } })).toThrow(/Invalid flow/);
    expect(() => saveFlow(s, 'owner', 'bad2', { exec: 'rm -rf' })).toThrow(/Invalid flow/);
    const loop = saveFlow(s, 'owner', 'loop', { evaluate: { do: { set: { var: 'x', value: 1 } }, until: { left: 1, op: '==', right: 2 }, maxIterations: 10 } });
    expect(runFlow(s, 'owner', loop.id).trace.at(-1)).toMatch(/stopped at 10/);
    const broken = saveFlow(s, 'owner', 'broken', { sequence: [{ propose: { channel: 'whatsapp', payload: { to: '+919876543210', body: 'hi' } } }, { set: { var: 'y', value: { var: 'missing' } } }] });
    const r = runFlow(s, 'owner', broken.id);
    expect(r).toMatchObject({ status: 'failed', dispatches: [] }); expect(listDispatches(s)).toHaveLength(0);
  });
});

describe('counterparty risk memory', () => {
  it('derives bands from real invoices and disputes, and records graded outcomes', () => {
    const s = new BusinessStore(':memory:'); const { c, inv } = seed(s);
    expect(counterparties(s)[0]).toMatchObject({ band: 'low', pending: 1, disputes: 0 });
    create(s, 'money.dispute-and-chargeback-logger', { invoiceId: inv.id, amount: 11800, reason: 'not_received', respondBy: '2026-12-01' });
    const id = recordCounterpartyEvent(s, 'owner', c.id, 'late_payment', 'Paid 20 days late last time');
    const cp = counterparties(s)[0];
    expect(cp).toMatchObject({ band: 'medium', disputes: 1 }); expect(cp.events[0].predictedBand).toBe('medium');
    const later = counterparties(s, Date.now() + 40 * 86_400_000)[0];
    expect(later.band).toBe('high'); expect(later.reasons.join(' ')).toMatch(/pending 40 days/);
    gradeCounterpartyEvent(s, 'owner', id, 'band_held');
    expect(() => gradeCounterpartyEvent(s, 'owner', id, 'band_wrong')).toThrow(/already graded/);
    expect(s.verifyAudit()).toBe(true);
  });
});
