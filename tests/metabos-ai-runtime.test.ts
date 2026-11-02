import { afterEach, describe, expect, it, vi } from 'vitest';
import { BusinessStore, payloadHash } from '@/lib/metabos/store';
import { classify, route } from '@/lib/metabos/ai/router';
import { parseModelProposal, ruleProposal, sortTask } from '@/lib/metabos/ai/swarm';
import { propose, queue } from '@/lib/metabos/ai/jev';
import { metaProvider, openRouterProvider, localProvider, serverProviders } from '@/lib/metabos/ai/providers';
import { TIERS } from '@/lib/metabos/ai/models';
import { JEV_AGENT_WRITE, WorkflowEngine } from '@/lib/metabos/workflows';

const stores: BusinessStore[] = [];
const fresh = () => { const s = new BusinessStore(':memory:'); stores.push(s); return s; };
afterEach(() => { for (const s of stores.splice(0)) if (s.db.open) s.close(); vi.unstubAllEnvs(); });
const none = { webgpu: false, states: {} };
const all = { webgpu: true, states: { openrouter: 'ready', meta: 'ready', local: 'ready' } } as const;
const proposal = (title = 'Call Asha about invoice 12') => ({ taskId: 't1', role: 'customers', tool: 'reminders.create', args: { title }, rationale: '', source: 'rule', model: null });

describe('router', () => {
  it('classifies small, medium and large deterministically', () => {
    expect(classify('add tea to stock').tier).toBe('small');
    expect(classify('why did sales drop').tier).toBe('medium');
    expect(classify('Build a strategy and forecast for opening a second store next quarter with hiring').tier).toBe('large');
    expect(classify('word '.repeat(130)).tier).toBe('large');
    expect(classify('why did sales drop')).toEqual(classify('why did sales drop'));
  });
  it('sends small tasks to Llama and large tasks to Muse Wonder', () => {
    const s = route('add tea', 'auto', all);
    expect(s.tier).toBe('small'); expect(s.chosen?.family).toBe('llama'); expect(s.chosen?.model).toMatch(/Llama-3\.2-1B/);
    const l = route('x', 'large', all);
    expect(l.chosen).toMatchObject({ provider: 'meta', model: 'muse-wonder-1.0' }); expect(l.fallback).toBe(false);
  });
  it('skips WebLLM without WebGPU and explains it', () => {
    const d = route('add tea', 'small', { webgpu: false, states: { openrouter: 'ready' } });
    expect(d.chosen?.model).toBe('meta-llama/llama-3.2-3b-instruct');
    expect(d.skipped[0]).toMatchObject({ provider: 'webllm', why: 'this browser has no WebGPU' });
    expect(d.reasons.join(' ')).toMatch(/Chose meta-llama/);
  });
  it('falls back from Muse to Llama, and steps down tiers but never up', () => {
    const d = route('x', 'large', { webgpu: false, states: { local: 'ready' } });
    expect(d.tier).toBe('small'); expect(d.chosen?.provider).toBe('local'); expect(d.fallback).toBe(true);
    expect(d.reasons.join(' ')).toMatch(/fell back to the small tier/);
    expect(d.reasons.join(' ')).toMatch(/Muse unavailable here; using Llama/);
    const up = route('add tea', 'small', { webgpu: false, states: {} });
    expect(up.chosen).toBeNull();
    const mid = route('x', 'medium', { webgpu: false, states: { openrouter: 'needs_key' } });
    expect(mid.chosen).toBeNull(); expect(mid.skipped.every((s) => s.why)).toBe(true);
  });
  it('reports no model when nothing is configured', () => {
    const d = route('hello', 'auto', none);
    expect(d.chosen).toBeNull(); expect(d.reasons.at(-1)).toMatch(/No model is available/);
  });
  it('lists only verified ids and Muse Wonder is the large tier', () => {
    expect(TIERS.large.candidates.filter((c) => c.family === 'muse').map((c) => c.model)).toEqual(['muse-wonder-1.0', 'meta/muse-wonder']);
    expect(TIERS.small.candidates.every((c) => c.family === 'llama')).toBe(true);
  });
});

describe('task sorter', () => {
  it('splits a request and assigns roles and tiers', () => {
    const t = sortTask('Restock tea before Friday. Then remind me to follow up with Asha about her invoice; write a launch caption');
    expect(t.map((x) => x.role)).toEqual(['inventory', 'finance', 'writer']);
    expect(t[0].wantsWrite).toBe(true); expect(t[2].wantsWrite).toBe(false);
    expect(t.map((x) => x.id)).toEqual(['t1', 't2', 't3']);
  });
  it('caps at 8 subtasks and defaults to operations', () => {
    expect(sortTask(Array.from({ length: 12 }, (_, i) => `step number ${i}`).join('\n')).length).toBe(8);
    expect(sortTask('tidy the office')[0].role).toBe('operations');
  });
  it('rule proposals are labelled and only for write-like tasks', () => {
    const [a, b] = sortTask('remind me to pay rent\nwhat is our margin');
    expect(ruleProposal(a)).toMatchObject({ source: 'rule', model: null, tool: 'reminders.create' });
    expect(ruleProposal(b)).toBeNull();
  });
});

describe('untrusted model output', () => {
  const ctx = { taskId: 't9', role: 'finance' as const, model: 'meta/muse-wonder' };
  it('accepts only the strict proposal shape and fixes caller-owned fields', () => {
    const p = parseModelProposal('Sure! {"tool":"reminders.create","args":{"title":"Chase invoice"},"rationale":"late","taskId":"evil","role":"inventory","source":"rule"}', ctx);
    expect(p).toMatchObject({ ok: true, proposal: { taskId: 't9', role: 'finance', source: 'model', model: 'meta/muse-wonder' } });
  });
  it('refuses other tools, extra args, prose and broken JSON', () => {
    expect(parseModelProposal('{"tool":"invoices.issue","args":{"title":"x"}}', ctx).ok).toBe(false);
    expect(parseModelProposal('{"tool":"reminders.create","args":{"title":"x","permissions":["messages.send"]}}', ctx).ok).toBe(false);
    expect(parseModelProposal('I will do it', ctx).ok).toBe(false);
    expect(parseModelProposal('{"tool":', ctx).ok).toBe(false);
    expect(parseModelProposal('{"tool":null}', ctx).ok).toBe(false);
  });
});

describe('Jev gate', () => {
  it('a proposal waits for approval and never writes on its own', () => {
    const s = fresh(); const run = propose(s, proposal());
    expect(run.status).toBe('awaiting_approval'); expect(run.workflowId).toBe(JEV_AGENT_WRITE.id);
    expect(s.reminders()).toHaveLength(0);
    expect(() => new WorkflowEngine(s).execute(run.id)).toThrow(/awaiting_approval/);
    expect(s.reminders()).toHaveLength(0);
  });
  it('rejects an approval for a changed payload and records the denial', () => {
    const s = fresh(); const e = new WorkflowEngine(s);
    const run = propose(s, proposal());
    const changed = { ...proposal('Wire 50000 to unknown account') };
    const changedHash = payloadHash({ workflowId: JEV_AGENT_WRITE.id, version: 1, input: changed, plan: { tool: changed.tool, args: changed.args, role: changed.role, taskId: changed.taskId } });
    expect(changedHash).not.toBe(run.payloadHash);
    expect(() => e.approve(run.id, changedHash)).toThrow(/does not match/);
    expect(e.run(run.id).status).toBe('awaiting_approval');
    expect(e.events(run.id).map((x) => x.type)).toContain('approval.denied');
    expect(s.reminders()).toHaveLength(0);
  });
  it('the approved exact payload creates one reminder; replay is safe', () => {
    const s = fresh(); const e = new WorkflowEngine(s);
    const run = propose(s, proposal());
    expect(propose(s, proposal()).id).toBe(run.id);
    e.approve(run.id, run.payloadHash); const done = e.execute(run.id);
    expect(done.status).toBe('succeeded');
    expect(s.reminders().map((r) => r.title)[0]).toMatch(/^Call Asha about invoice 12 \[run /);
    expect(() => e.execute(run.id)).toThrow();
    expect(s.reminders()).toHaveLength(1);
    expect(() => e.cancel(run.id)).toThrow(/already succeeded/);
  });
  it('refuses malformed proposals with evidence and the queue lists only Jev runs', () => {
    const s = fresh();
    expect(() => propose(s, { ...proposal(), tool: 'messages.send' })).toThrow(/refused by Jev/);
    expect(() => propose(s, { ...proposal(), args: { title: 'x'.repeat(181) } })).toThrow(/refused by Jev/);
    expect((s.db.prepare("SELECT count(*) n FROM mb_audit WHERE action='ai.proposal.refused'").get() as { n: number }).n).toBe(2);
    s.product({ name: 'Tea', sku: 'TEA', price: 1, taxBps: 0, stock: 1 });
    new WorkflowEngine(s).start('low-stock-reminder', { threshold: 3 });
    propose(s, proposal());
    expect(queue(s)).toHaveLength(1);
  });
});

describe('providers', () => {
  it('never exposes keys in status and needs a key to call', async () => {
    const env = { OPENROUTER_API_KEY: 'sk-or-secret', META_MODEL_API_KEY: 'meta-secret' };
    const statuses = JSON.stringify(Object.values(serverProviders(env)).map((p) => p.status()));
    expect(statuses).not.toContain('secret');
    expect(openRouterProvider({}).status().state).toBe('needs_key');
    expect(metaProvider({}).status().state).toBe('needs_key');
    expect(localProvider({}).status().state).toBe('unconfigured');
    await expect(Promise.resolve().then(() => openRouterProvider({}).chat('m', []))).rejects.toThrow(/OPENROUTER_API_KEY/);
  });
  it('OpenRouter sends the key server-side and returns measured usage', async () => {
    const f = vi.fn(async (_u: any, init: any) => new Response(JSON.stringify({ model: 'meta/muse-wonder', choices: [{ message: { content: 'hi' } }], usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } })));
    const r = await openRouterProvider({ OPENROUTER_API_KEY: 'k1' }, f as any).chat('meta/muse-wonder', [{ role: 'user', content: 'hello' }]);
    expect(f.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect((f.mock.calls[0][1] as any).headers.authorization).toBe('Bearer k1');
    expect(r).toEqual({ text: 'hi', usage: { promptTokens: 5, completionTokens: 2, totalTokens: 7 }, model: 'meta/muse-wonder', provider: 'openrouter' });
  });
  it('usage is null when the provider does not report it', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })));
    const r = await localProvider({ MUZEBOS_LOCAL_OPENAI_BASE_URL: 'http://127.0.0.1:11434/v1/', MUZEBOS_LOCAL_MODEL: 'llama3.2' }, f as any).chat('x', []);
    expect(r.usage).toBeNull(); expect((f.mock.calls[0] as any)[0]).toBe('http://127.0.0.1:11434/v1/chat/completions');
  });
  it('Meta adapter uses the Responses API and maps usage; errors surface', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ output_text: 'yo', usage: { input_tokens: 3, output_tokens: 4 } })));
    const r = await metaProvider({ META_MODEL_API_KEY: 'k' }, f as any, 'responses').chat('muse-wonder-1.0', []);
    expect((f.mock.calls[0] as any)[0]).toBe('https://api.meta.ai/v1/responses'); expect(r.usage?.totalTokens).toBe(7);
    const bad = vi.fn(async () => new Response('{}', { status: 401 }));
    await expect(openRouterProvider({ OPENROUTER_API_KEY: 'k' }, bad as any).chat('m', [])).rejects.toThrow(/401/);
  });
});
