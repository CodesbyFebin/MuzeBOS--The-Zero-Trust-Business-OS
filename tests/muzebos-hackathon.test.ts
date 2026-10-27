import { afterEach, describe, expect, it, vi } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { BusinessStore } from '@/lib/muzebos/store';
import { InferenceStore } from '@/lib/muzebos/inference/store';
import { routes } from '@/lib/muzebos/inference/routing';
import { runServerOnce } from '@/lib/muzebos/inference/providers';
import { proposeInferenceAction } from '@/lib/muzebos/inference/jev-bridge';
import { WorkflowEngine } from '@/lib/muzebos/workflows';
const env = { META_MODEL_API_KEY: 'fixture-meta', BASETEN_API_KEY: 'fixture-baseten', MUZEBOS_INFERENCE_PAID: '1', MUZEBOS_META_MODEL: 'muse-spark-1.3' };
const opened: BusinessStore[] = [];
const fresh = () => { const b = new BusinessStore(':memory:'); opened.push(b); return new InferenceStore(b, () => routes(env)); };
const task = (s: InferenceStore, lane = 'baseten') => s.create({ title: 'Synthetic demo', prompt: 'Propose one reminder', kind: 'draft', lane, paidConsent: true });
const reply = (content: unknown = JSON.stringify({ tool: 'reminders.create', args: { title: 'Review shelf' } }), extra = {}) => new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop', ...extra }] }));
afterEach(() => opened.splice(0).forEach(b => b.close()));
describe('Hackathon server proposals (injected protocol fixtures, not live inference)', () => {
  it('blocks missing keys, paid opt-in and unknown Meta models', () => {
    expect(routes({ BASETEN_API_KEY: 'x' }).find(r => r.provider === 'baseten')?.configured).toBe(false);
    expect(routes({ ...env, MUZEBOS_META_MODEL: 'invented' }).find(r => r.provider === 'meta')?.configured).toBe(false);
    const s = fresh(); const t = s.create({ title: 'No consent', prompt: 'x', kind: 'draft', lane: 'baseten' });
    expect(() => s.approve(t.id, t.hash)).toThrow('consent');
  });
  it.each(['meta', 'baseten'])('binds %s transport, model and output to two distinct approvals and one idempotent write', async provider => {
    const s = fresh(), t = task(s, provider), mock = vi.fn(async () => reply());
    expect((await runServerOnce(s, 'test', env, mock as typeof fetch)).state).toBe('idle'); expect(mock).not.toHaveBeenCalled();
    s.approve(t.id, t.hash);
    expect((await runServerOnce(s, 'test', env, mock as typeof fetch)).state).toBe('completed');
    const [url, init] = (mock.mock.calls as unknown as [string, RequestInit][])[0];
    expect(url).toBe(provider === 'meta' ? 'https://api.meta.ai/v1/chat/completions' : 'https://inference.baseten.co/v1/chat/completions');
    expect(init.redirect).toBe('error'); expect((init.headers as Record<string,string>).Authorization).toBe(`Bearer fixture-${provider}`);
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe(provider === 'meta' ? 'muse-spark-1.3' : 'meta-models/muse-spark-open-1026');
    expect(body).not.toHaveProperty('response_format'); expect(body).not.toHaveProperty('reasoning_effort'); expect(body).not.toHaveProperty('tools');
    const run = proposeInferenceAction(s, t.id), engine = new WorkflowEngine(s.business);
    expect(run.status).toBe('awaiting_approval'); expect(run.input).toMatchObject({ taskId: t.id, source: 'model' });
    expect(JSON.stringify(run.input)).toContain(s.task(t.id).outputHash);
    expect(proposeInferenceAction(s, t.id).id).toBe(run.id);
    expect(s.business.db.prepare('SELECT COUNT(*) n FROM mb_reminders').get()).toEqual({ n: 0 });
    expect(() => engine.execute(run.id)).toThrow('approved');
    expect(() => engine.approve(run.id, '0'.repeat(64))).toThrow();
    engine.approve(run.id, run.payloadHash); expect(engine.execute(run.id).status).toBe('succeeded');
    expect(s.business.db.prepare('SELECT COUNT(*) n FROM mb_reminders').get()).toEqual({ n: 1 });
    expect(proposeInferenceAction(s, t.id).id).toBe(run.id); expect(s.business.verifyAudit()).toBe(true);
    expect(s.task(t.id).usage).toBeNull();
  });
  it.each([
    '{"tool":"invoices.issue","args":{"title":"No"}}',
    '{"tool":"reminders.create","args":{"title":"No"},"permissions":["payments.write"]}',
    '```json\n{"tool":"reminders.create","args":{"title":"No"}}\n```',
  ])('refuses unapproved output shape %s', async output => {
    const s = fresh(), t = task(s); s.approve(t.id, t.hash);
    await runServerOnce(s, 'test', env, (async () => reply(output)) as typeof fetch);
    expect(() => proposeInferenceAction(s, t.id)).toThrow('JSON proposal');
    expect(new WorkflowEngine(s.business).runs()).toHaveLength(0);
  });
  it('rejects output tampering and browser-client provenance', async () => {
    const s = fresh(), t = task(s); s.approve(t.id, t.hash); await runServerOnce(s, 'test', env, (async () => reply()) as typeof fetch);
    s.business.db.prepare('UPDATE mb_inference_tasks SET output=? WHERE id=?').run('changed', t.id);
    expect(() => proposeInferenceAction(s, t.id)).toThrow('integrity');
    const browser = task(s, 'browser'); s.approve(browser.id, browser.hash); const lease = s.claim('browser', 'browser')!; s.complete(browser.id, lease.token, '{}');
    expect(() => proposeInferenceAction(s, browser.id)).toThrow('server draft');
  });
  it.each([
    { message: { content: '{}', function_call: { name: 'pay' } } },
    { finish_reason: 'length' },
    { finish_reason: null },
    { message: { content: null, reasoning_content: '{}' } },
  ])('refuses unsafe or incomplete provider response %# without automatic retry', async extra => {
    const s = fresh(), t = task(s); s.approve(t.id, t.hash);
    const mock = vi.fn(async () => reply('{}', extra));
    expect((await runServerOnce(s, 'test', env, mock as typeof fetch)).state).toBe('failed');
    expect((await runServerOnce(s, 'test', env, mock as typeof fetch)).state).toBe('idle'); expect(mock).toHaveBeenCalledTimes(1);
    expect(() => proposeInferenceAction(s, t.id)).toThrow('completed');
  });
});

describe('Submission demo process', () => {
  it('runs both fixture routes with tagged evidence and unknown token usage', () => {
    const output = execFileSync(process.execPath, ['--import', 'tsx', 'scripts/hackathon-demo.ts', '--fixture', 'both'], { encoding: 'utf8', env: { ...process.env, MODEL_API_KEY: '', BASETEN_API_KEY: '' }, timeout: 20_000 });
    const reportPath = output.match(/Report: (.+report\.json)/)![1];
    try {
      const report = JSON.parse(readFileSync(reportPath, 'utf8'));
      expect(report.evidenceMode).toBe('fixture'); expect(report.auditValid).toBe(true);
      expect(report.results).toHaveLength(2);
      for (const result of report.results) { expect(result.requests).toBe(1); expect(result.usage).toBeNull(); expect(result.status).toBe('succeeded'); expect(result.payloadHash).not.toBe(result.actionHash); }
      expect(output.match(/FIXTURE: scripted approval/g)).toHaveLength(4);
    } finally { rmSync(path.dirname(reportPath), { recursive: true, force: true }); }
  });
  it('refuses unattended live mode rather than auto-approving provider spend', () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/hackathon-demo.ts', '--live', 'both'], { encoding: 'utf8', timeout: 20_000 });
    expect(result.status).toBe(1); expect(result.stdout).not.toContain('Disposable');
  });
});
