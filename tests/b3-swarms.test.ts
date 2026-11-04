/** Claw swarms import + agent run intake (Yao stream format checked against a live reply). */
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BusinessStore } from '@/lib/metabos/store';
import { checkCard, importSwarms, swarmNames, swarmTree, type AgentCard } from '@/lib/metabos/b3/swarms';
import { clawStatus, intakeDraft, listDrafts, parseYaoStream, runOnClaw, runOnYao, toDraft, yaoStatus } from '@/lib/metabos/b3/agent-run';
import { queue } from '@/lib/metabos/ai/jev';
const safe = async () => ({ verdict: 'safe' as const, categories: [], model: 'guard' });
const unsafe = async () => ({ verdict: 'unsafe' as const, categories: [{ code: 'S1', name: 'x' }], model: 'guard' });
const first = (s: BusinessStore, id: string) => swarmTree(s, {}).swarms.flatMap((w) => w.subclusters.flatMap((c) => c.agents)).find((a) => a.id === id)! as AgentCard;
describe('swarms', () => {
  it('imports 1000 cards idempotently into swarm → sub-cluster → agent', () => {
    const s = new BusinessStore(':memory:'); expect(importSwarms(s)).toBe(1000); expect(importSwarms(s)).toBe(1000);
    const t = swarmTree(s); expect(t.totals).toEqual({ total: 1000, jev: 141, high: 4 }); expect(t.swarms).toHaveLength(10); expect(swarmNames(s)).toHaveLength(10);
    expect(t.swarms[0].subclusters.reduce((n, c) => n + c.agents.length, 0)).toBe(100);
  });
  it('filters by tier, risk and Jev', () => {
    const s = new BusinessStore(':memory:');
    expect(swarmTree(s, { tier: 'lead' }).matched).toBe(10); expect(swarmTree(s, { risk: 'high' }).matched).toBe(4);
    expect(swarmTree(s, { jev: true }).matched).toBe(141); expect(swarmTree(s, { jev: true, tier: 'pm' }).matched).toBeLessThanOrEqual(50);
    expect(swarmTree(s, { risk: 'high' }).swarms.flatMap((w) => w.subclusters.flatMap((c) => c.agents)).every((a) => a.jev_required)).toBe(true);
  });
  it('refuses a card with an external-effect tool but no Jev', () => {
    const s = new BusinessStore(':memory:'); const c = { ...first(s, 'S01-L'), tools: ['dispatch:email'], jev_required: false };
    expect(() => checkCard(c)).toThrow(/no Jev/);
  });
});
describe('agent runs', () => {
  it('parses the live Yao stream: drops the trace frame and reads the JSON draft', () => {
    const raw = parseYaoStream(readFileSync('tests/fixtures/yao-sse-live-2026-10-28.txt', 'utf8'));
    expect(raw).not.toContain('output.stream_start'); const d = toDraft(raw);
    expect(d.draft).toContain('Kochi'); expect(d.confidence).toBe(0.88); expect(d.proposed_actions[0].tool).toBe('dispatch:completion');
    expect(toDraft('plain words').draft).toBe('plain words');
  });
  it('shows Not connected without Yao or claw env', async () => {
    expect(yaoStatus({}).label).toMatch(/^Not connected/); expect(clawStatus({}).label).toMatch(/^Not connected/);
    const s = new BusinessStore(':memory:'); const c = first(s, 'S01-C1-W04');
    await expect(runOnYao(c, 'task', {})).rejects.toThrow(/Not connected/);
    await expect(runOnYao(c, 'task', { MUZEBOS_YAO_BASE_URL: 'http://127.0.0.1:1/v1', MUZEBOS_YAO_ACCESS_TOKEN: 't' }, (async () => { throw new Error('ECONNREFUSED'); }) as typeof fetch)).rejects.toThrow(/Not connected/);
    await expect(runOnClaw(c, 'task', {})).rejects.toThrow(/Not connected/);
  });
  it('a safe draft becomes ONE pending Jev item; undeclared tools are rejected; nothing dispatches', async () => {
    const s = new BusinessStore(':memory:'); const c = first(s, 'S01-C1-W04'); const before = queue(s).length;
    const r = await intakeDraft(s, c, 'yao', 'cta', { draft: 'Pre-order your Diwali box', confidence: 0.9, proposed_actions: [{ tool: 'dispatch:completion', args: {}, reason: 'review' }, { tool: 'dispatch:payment-link', args: { amount: 1 } }] }, { guard: safe });
    expect(r).toMatchObject({ status: 'pending_jev', dispatched: false }); expect(r.actions).toHaveLength(1); expect(r.rejected[0].why).toMatch(/not declared/);
    expect(queue(s).length).toBe(before + 1); expect(listDrafts(s)[0]).toMatchObject({ id: r.id, jevStatus: 'awaiting_approval' });
    expect((s.db.prepare("SELECT COUNT(*) n FROM mb_audit WHERE action='agent.draft.pending_jev'").get() as { n: number }).n).toBe(1);
  });
  it('an unsafe draft never reaches Jev', async () => {
    const s = new BusinessStore(':memory:'); const c = first(s, 'S01-C1-W04'); const before = queue(s).length;
    const r = await intakeDraft(s, c, 'claw-local', 't', { draft: 'bad', confidence: 1, proposed_actions: [] }, { guard: unsafe });
    expect(r.status).toBe('blocked_unsafe'); expect(r.jevRunId).toBeNull(); expect(queue(s).length).toBe(before);
  });
  it('claw-local is called with execFile argv (no shell) and its JSON is read', async () => {
    const s = new BusinessStore(':memory:'); const c = first(s, 'S01-C1-W04'); let argv: string[] = [];
    const fake = ((_f: string, a: string[], _o: unknown, cb: (e: Error | null, out: string) => void) => { argv = a; cb(null, 'loading…\n{"output":{"text":"hi; rm -rf /","confidence":0.7,"proposed_actions":[]},"model":"Llama-3.2-3B","cost_usd":0}'); }) as never;
    const dir = mkdtempSync(join(tmpdir(), 'claw-argv-fixture-'));
    writeFileSync(join(dir, 'claw'), 'fixture only; injected execFile handles the call', { mode: 0o700 });
    try {
      const d = await runOnClaw(c, 'x"; rm -rf / #', { MUZEBOS_CLAW_DIR: dir }, fake);
      expect(argv).toEqual(['run', '--swarm', 'ContentForge', '--role', c.role, '--type', 'draft', '--task', 'x"; rm -rf / #']); expect(d).toMatchObject({ draft: 'hi; rm -rf /', model: 'Llama-3.2-3B' });
    } finally { rmSync(dir, { recursive: true, force: true }); s.close(); }
  });
});
