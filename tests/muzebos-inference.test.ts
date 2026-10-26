import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BusinessStore } from '@/lib/muzebos/store';
import { InferenceStore } from '@/lib/muzebos/inference/store';
import { chooseRoute, fingerprint, routes } from '@/lib/muzebos/inference/routing';
import { callTextProvider, runServerOnce, validLocalEndpoint } from '@/lib/muzebos/inference/providers';
import type { Route } from '@/lib/muzebos/inference/types';
const stores: BusinessStore[] = [], dirs: string[] = [];
let clock = Date.parse('2026-10-26T06:00:00Z');
const input = { title: 'Reply draft', prompt: 'Write a short reply', kind: 'draft' as const };
const fresh = (catalog = () => routes({}), file = ':memory:') => { const b = new BusinessStore(file); stores.push(b); return new InferenceStore(b, catalog, () => clock); };
const approve = (s: InferenceStore, t = s.create(input)) => s.approve(t.id, t.hash);
afterEach(() => { stores.splice(0).forEach(s => { if (s.db.open) s.close(); }); dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })); clock = Date.parse('2026-10-26T06:00:00Z'); });
describe('Routing and Jev boundaries', () => {
  it('assigns small, medium and large deterministically without claiming Wonder Full API access', () => {
    expect(chooseRoute('draft', 'short', 'auto', routes({})).route.provider).toBe('browser');
    expect(chooseRoute('analysis', 'short', 'auto', routes({})).route.provider).toBe('ollama');
    expect(chooseRoute('plan', 'short', 'auto', routes({})).route.model).toBe('muse-wonder-1.0');
    expect(routes({}).find(r => r.provider === 'muse-code')?.configured).toBe(false);
    expect(routes({}).find(r => r.provider === 'openclaw')?.configured).toBe(false);
  });
  it('requires both paid server opt-in and per-task consent, and never silently falls back', () => {
    expect(routes({ MODEL_API_KEY: 'test' }).find(r => r.provider === 'meta')?.configured).toBe(false);
    const s = fresh(() => routes({ MODEL_API_KEY: 'test', MUZEBOS_INFERENCE_PAID: '1' }));
    const t = s.create({ ...input, lane: 'meta' }); expect(() => approve(s, t)).toThrow('consent');
    const blocked = s.create({ ...input, lane: 'muse-code', paidConsent: true }); expect(() => approve(s, blocked)).toThrow('isolated runner');
  });
  it('canonicalizes nested object order and binds approval to the exact payload', () => {
    expect(fingerprint({ b: [1, 2], a: 'x' })).toBe(fingerprint({ a: 'x', b: [1, 2] }));
    const s = fresh(), t = s.create(input);
    expect(() => s.approve(t.id, '0'.repeat(64))).toThrow('does not match');
    expect(s.claim('worker', 'browser')).toBeNull();
    approve(s, t); const changed = { ...t.payload, prompt: 'Changed after approval' };
    s.business.db.prepare('UPDATE mb_inference_tasks SET payload=? WHERE id=?').run(JSON.stringify(changed), t.id);
    expect(s.claim('worker', 'browser')).toBeNull(); expect(s.task(t.id).state).toBe('failed');
  });
  it('invalidates a changed route before dispatch', () => {
    let catalog = routes({}); const s = fresh(() => catalog); const t = approve(s);
    catalog = catalog.map(r => r.provider === 'browser' ? { ...r, configHash: 'new-endpoint' } : r);
    expect(s.claim('worker', 'browser')).toBeNull(); expect(s.task(t.id).state).toBe('awaiting_approval');
  });
});
describe('Durable bounded task leases', () => {
  it('starts blank, claims only the appropriate transport and fences duplicate commits', () => {
    const s = fresh(); expect(s.snapshot().tasks).toEqual([]);
    const t = approve(s); expect(s.claim('server', 'server')).toBeNull();
    const lease = s.claim('browser', 'browser')!; expect(lease.task.id).toBe(t.id);
    expect(s.claim('another', 'browser')).toBeNull();
    s.complete(t.id, lease.token, 'Reviewed draft'); expect(() => s.complete(t.id, lease.token, 'Again')).toThrow('stale');
    expect(s.business.verifyAudit()).toBe(true); expect(JSON.stringify(s.snapshot())).not.toContain('leaseToken');
  });
  it('caps global concurrency at two and recovers stale workers with new human approval', () => {
    const s = fresh(); approve(s); approve(s); approve(s);
    const first = s.claim('a', 'browser')!, second = s.claim('b', 'browser')!;
    expect(s.claim('c', 'browser')).toBeNull(); clock += 121000;
    const next = s.claim('c', 'browser'); expect(next).not.toBeNull();
    expect(s.task(first.task.id).state).toBe('awaiting_approval');
    expect(() => s.complete(second.task.id, second.token, 'Stale output')).toThrow('stale');
  });
  it('cancels a running job and rejects late output', () => {
    const s = fresh(); const t = approve(s), lease = s.claim('browser', 'browser')!;
    s.cancel(t.id); expect(() => s.complete(t.id, lease.token, 'late')).toThrow('stale'); expect(s.task(t.id).state).toBe('cancelled');
  });
  it('expires queued approval and allows no more than two attempts', () => {
    const s = fresh(), t = approve(s); clock += 3600001; expect(s.claim('browser', 'browser')).toBeNull();
    expect(s.task(t.id).state).toBe('awaiting_approval'); approve(s, s.task(t.id));
    let lease = s.claim('browser', 'browser')!; s.fail(t.id, lease.token); approve(s, s.task(t.id));
    lease = s.claim('browser', 'browser')!; s.fail(t.id, lease.token); expect(s.task(t.id).state).toBe('failed');
  });
  it('renews a live lease while keeping a ten-minute absolute deadline', () => {
    const s = fresh(), t = approve(s), lease = s.claim('browser', 'browser')!;
    for (let i = 0; i < 9; i++) { clock += 60000; s.renew(t.id, lease.token); }
    clock += 61000; expect(() => s.renew(t.id, lease.token)).toThrow(/stale|budget/);
  });
  it('persists approval, results and evidence across independent database connections', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'mb-inference-')); dirs.push(dir); const file = path.join(dir, 'db.sqlite');
    const a = fresh(() => routes({}), file), t = approve(a); const b = fresh(() => routes({}), file);
    const lease = b.claim('worker', 'browser')!; expect(a.claim('other', 'browser')).toBeNull(); b.complete(t.id, lease.token, 'Durable output');
    a.business.close(); b.business.close(); const reopened = fresh(() => routes({}), file);
    expect(reopened.task(t.id).output).toBe('Durable output'); expect(reopened.business.verifyAudit()).toBe(true);
  });
  it('delegates one bounded batch and requires a separate approval for each child', () => {
    const s = fresh(), t = approve(s), lease = s.claim('browser', 'browser')!; s.complete(t.id, lease.token, 'Task plan');
    const children = s.delegate(t.id, [{ ...input, title: 'Child' }]); expect(children[0].payload.parentId).toBe(t.id); expect(children[0].state).toBe('awaiting_approval');
    expect(s.claim('worker', 'browser')).toBeNull(); expect(() => s.delegate(t.id, [input])).toThrow('already delegated');
    expect(() => s.delegate(t.id, Array(6).fill(input))).toThrow();
  });
  it('enforces daily root limits and reports no fabricated proof or usage', () => {
    const s = fresh(); for (let i = 0; i < 20; i++) s.create(input); expect(() => s.create(input)).toThrow('Daily limit');
    expect(s.snapshot().proof.state).toBe('not_configured'); expect(s.snapshot().tasks[0].usage).toBeNull();
  });
});
describe('Text provider adapter contract', () => {
  const env = { MUZEBOS_OLLAMA_URL: 'http://127.0.0.1:11434/v1' };
  it('rejects untrusted endpoint shapes and credential-bearing URLs', () => {
    expect(validLocalEndpoint('https://public.example/v1')).toBeNull(); expect(validLocalEndpoint('http://user:secret@localhost/v1')).toBeNull(); expect(validLocalEndpoint('file:///etc/passwd')).toBeNull(); expect(validLocalEndpoint(env.MUZEBOS_OLLAMA_URL)).toContain('/v1');
  });
  it('executes a server draft against an injected protocol fixture and records observed usage', async () => {
    const s = fresh(() => routes(env)); const t = s.create({ ...input, lane: 'ollama' }); approve(s, t);
    let seen = '';
    const fixture = async (_url: unknown, init?: RequestInit) => { seen = String(init?.body); return new Response(JSON.stringify({ choices: [{ message: { content: 'Fixture model draft' } }], usage: { prompt_tokens: 12, completion_tokens: 5 } })); };
    expect((await runServerOnce(s, 'fixture-worker', env, fixture as typeof fetch)).state).toBe('completed');
    expect(seen).toContain('llama3.2:3b'); expect(s.task(t.id).usage?.completionTokens).toBe(5); expect(s.business.verifyAudit()).toBe(true);
  });
  it('rejects tool calls and does not auto-retry provider failures', async () => {
    const s = fresh(() => routes(env)), t = s.create({ ...input, lane: 'ollama' }); approve(s, t);
    const fixture = async () => new Response(JSON.stringify({ choices: [{ message: { content: 'Action', tool_calls: [{ function: { name: 'pay' } }] } }] }));
    expect((await runServerOnce(s, 'fixture-worker', env, fixture as typeof fetch)).state).toBe('failed'); expect(s.task(t.id).state).toBe('awaiting_approval');
    expect((await runServerOnce(s, 'fixture-worker', env, fixture as typeof fetch)).state).toBe('idle');
  });
  it('does not send a tampered model to a provider', async () => {
    const route = routes(env).find(r => r.provider === 'ollama') as Route, s = fresh(() => routes(env)); const t = s.create({ ...input, lane: 'ollama' });
    await expect(callTextProvider({ ...t.payload, model: 'changed' }, route, env)).rejects.toThrow('not authorized');
  });
});
