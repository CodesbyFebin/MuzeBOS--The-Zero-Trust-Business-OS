import { describe, it, expect } from 'vitest';
import { BusinessStore } from '../lib/muzebos/store';
import { metaChat, basetenChat, metaImage, META_BASE, BASETEN_BASE, BASETEN_MUSE_SPARK_OPEN } from '../lib/muzebos/ai/meta';
import { runOpsAgent } from '../lib/muzebos/ai/ops-agent';
import { queue } from '../lib/muzebos/ai/jev';

const fakeFetch = (reply: (url: string, body: any) => any, calls: any[] = []) => (async (url: any, init: any) => {
  const body = init?.body && typeof init.body === 'string' ? JSON.parse(init.body) : null;
  calls.push({ url: String(url), body, auth: init?.headers?.authorization });
  return new Response(JSON.stringify(reply(String(url), body)), { status: 200, headers: { 'content-type': 'application/json' } });
}) as unknown as typeof fetch;
const chat = (content: string, model: string) => ({ model, choices: [{ message: { content } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
const REQ = 'Remind me to chase Acme on Friday about the overdue invoice; then design a full quarterly restock plan across all suppliers with cash flow and risk analysis for every product line, explaining the trade-offs step by step, and schedule it.';

describe('Meta adapters (mocked fetch)', () => {
  it('Muse Spark uses the documented chat completions endpoint with a bearer key', async () => {
    const calls: any[] = [];
    const r = await metaChat('muse-spark-1.3', [{ role: 'user', content: 'hi' }], { env: { META_MODEL_API_KEY: 'k' }, fetch: fakeFetch(() => chat('hello', 'muse-spark-1.3'), calls) });
    expect(calls[0].url).toBe(`${META_BASE}/chat/completions`); expect(calls[0].auth).toBe('Bearer k');
    expect(r).toMatchObject({ text: 'hello', provider: 'meta', live: true });
  });
  it('accepts MODEL_API_KEY alias and refuses with no key', async () => {
    await expect(metaChat('muse-spark-1.3', [], { env: {} })).rejects.toThrow(/META_MODEL_API_KEY/);
    await expect(metaChat('muse-spark-1.3', [{ role: 'user', content: 'x' }], { env: { MODEL_API_KEY: 'k' }, fetch: fakeFetch(() => chat('ok', 'm')) })).resolves.toMatchObject({ text: 'ok' });
  });
  it('Baseten defaults to the hackathon Muse Spark Open id', async () => {
    const calls: any[] = [];
    await basetenChat([{ role: 'user', content: 'x' }], { env: { BASETEN_API_KEY: 'b' }, fetch: fakeFetch(() => chat('ok', BASETEN_MUSE_SPARK_OPEN), calls) });
    expect(calls[0].url).toBe(`${BASETEN_BASE}/chat/completions`); expect(calls[0].body.model).toBe('meta-models/muse-spark-open-1026');
  });
  it('Muse Image refuses an empty response instead of inventing one', async () => {
    await expect(metaImage('logo', { env: { META_MODEL_API_KEY: 'k' }, fetch: fakeFetch(() => ({ data: [] })) })).rejects.toThrow(/no image/);
  });
});

describe('ops agent flow through Jev', () => {
  it('rule mode without keys: labelled, nothing executed', async () => {
    const s = new BusinessStore(':memory:');
    const run = await runOpsAgent(s, REQ, { env: {} });
    expect(run.mode).toBe('rule');
    expect(run.steps.every((x) => x.engine === 'rule' || x.engine === 'skipped')).toBe(true);
    expect(queue(s).length).toBeGreaterThan(0);
  });
  it('live-meta mode routes large subtasks to Muse Wonder and small to Muse Spark; proposals wait in Jev', async () => {
    const s = new BusinessStore(':memory:'); const calls: any[] = [];
    const f = fakeFetch((_u, b) => chat(JSON.stringify({ tool: 'reminders.create', args: { title: 'Chase Acme' }, rationale: 'overdue' }), b.model), calls);
    const run = await runOpsAgent(s, REQ, { env: { META_MODEL_API_KEY: 'k' }, fetch: f });
    expect(run.mode).toBe('live-meta');
    const models = calls.map((c) => c.body.model);
    expect(models).toContain('muse-spark-1.3'); expect(models).toContain('muse-wonder-1.0');
    expect(queue(s).every((r: any) => r.status !== 'succeeded')).toBe(true);
  });
  it('refuses a model that tries an unlisted tool', async () => {
    const s = new BusinessStore(':memory:');
    const f = fakeFetch((_u, b) => chat('{"tool":"invoices.issue","args":{"id":"x"}}', b.model));
    const run = await runOpsAgent(s, 'Remind me to call Acme', { env: { META_MODEL_API_KEY: 'k' }, fetch: f });
    expect(run.steps[0].runId).toBeNull(); expect(run.steps[0].outcome).toMatch(/Refused/); expect(queue(s)).toHaveLength(0);
  });
  it('baseten preference uses Muse Spark Open', async () => {
    const s = new BusinessStore(':memory:'); const calls: any[] = [];
    const f = fakeFetch((_u, b) => chat('{"tool":"reminders.create","args":{"title":"Call Acme"}}', b.model), calls);
    const run = await runOpsAgent(s, 'Remind me to call Acme', { env: { BASETEN_API_KEY: 'b', META_MODEL_API_KEY: 'k' }, fetch: f, prefer: 'baseten' });
    expect(run.mode).toBe('live-baseten'); expect(calls[0].body.model).toBe(BASETEN_MUSE_SPARK_OPEN); expect(run.steps[0].runId).toBeTruthy();
  });
});
