import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BusinessStore } from '@/lib/metabos/store';
import { authorizeTool, describeWorkflow, LOW_STOCK_REMINDER, WorkflowEngine, WORKFLOWS } from '@/lib/metabos/workflows';

const stores: BusinessStore[] = []; const dirs: string[] = [];
const fresh = (f = ':memory:') => { const s = new BusinessStore(f); stores.push(s); return s; };
afterEach(() => { for (const s of stores.splice(0)) if (s.db.open) s.close(); for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const seed = (s: BusinessStore) => { const a = s.product({ name: 'Tea', sku: 'TEA', price: 100, taxBps: 0, stock: 2 }); const b = s.product({ name: 'Mug', sku: 'MUG', price: 100, taxBps: 0, stock: 9 }); return { a, b }; };

describe('workflow definitions', () => {
  it('declare trigger, input, permissions, tools, approval, idempotency, retry, timeout, compensation', () => {
    for (const w of WORKFLOWS) {
      const d = describeWorkflow(w);
      for (const k of ['trigger', 'input', 'permissions', 'tools', 'approval', 'idempotency', 'retry', 'timeoutMs', 'compensation'] as const) expect(d[k], `${w.id}.${k}`).toBeTruthy();
      for (const t of w.tools) expect(authorizeTool(w, { tool: t, requestedBy: 'definition' }).allowed).toBe(true);
      for (const s of w.steps) expect(w.tools).toContain(s.tool);
    }
  });
  it('a model request never grants a permission', () => {
    const r = authorizeTool(LOW_STOCK_REMINDER, { tool: 'messages.send', requestedBy: 'model', permissions: ['messages.send'] });
    expect(r.allowed).toBe(false);
    expect(authorizeTool(LOW_STOCK_REMINDER, { tool: 'invoices.issue', requestedBy: 'model', permissions: ['invoices.issue'] }).allowed).toBe(false);
    expect(authorizeTool(LOW_STOCK_REMINDER, { tool: 'rm -rf', requestedBy: 'model' }).allowed).toBe(false);
    expect(LOW_STOCK_REMINDER.permissions).not.toContain('messages.send');
  });
});

describe('durable run engine: low-stock -> reminder', () => {
  it('requires approval bound to the payload, then creates one linked reminder per low product', () => {
    const s = fresh(); const { a } = seed(s); const e = new WorkflowEngine(s);
    const r = e.start('low-stock-reminder', { threshold: 3 });
    expect(r.status).toBe('awaiting_approval'); expect(r.plan).toMatchObject({ products: [{ sku: 'TEA', stock: 2 }] });
    expect(() => e.execute(r.id)).toThrow(/must be approved/);
    expect(() => e.approve(r.id, '0'.repeat(64))).toThrow(/does not match/);
    e.approve(r.id, r.payloadHash);
    const done = e.execute(r.id);
    expect(done.status).toBe('succeeded');
    const rem = s.reminders(); expect(rem).toHaveLength(1); expect(rem[0]).toMatchObject({ linkKind: 'product', linkId: a.id, status: 'open' });
    expect(e.events(r.id).map((x) => x.type)).toEqual(['run.started', 'approval.requested', 'approval.denied', 'approval.granted', 'step.succeeded', 'step.succeeded', 'run.succeeded']);
    expect(s.verifyAudit()).toBe(true);
    expect(s.evidence().some((x) => x.action === 'workflow.run.succeeded')).toBe(true);
  });
  it('is idempotent on start and on execute replay', () => {
    const s = fresh(); seed(s); const e = new WorkflowEngine(s);
    const r1 = e.start('low-stock-reminder', { threshold: 3 }); const r2 = e.start('low-stock-reminder', { threshold: 3 });
    expect(r2.id).toBe(r1.id);
    e.approve(r1.id, r1.payloadHash); e.execute(r1.id);
    expect(() => e.execute(r1.id)).toThrow(/succeeded/); expect(s.reminders()).toHaveLength(1);
  });
  it('fails a stale approval when stock changed after approval and writes nothing', () => {
    const s = fresh(); const { b } = seed(s); const e = new WorkflowEngine(s);
    const r = e.start('low-stock-reminder', { threshold: 3 }); e.approve(r.id, r.payloadHash);
    s.db.prepare('UPDATE mb_products SET stock=1 WHERE id=?').run(b.id);
    const out = e.execute(r.id);
    expect(out.status).toBe('failed'); expect(out.error).toMatch(/changed since approval/); expect(s.reminders()).toHaveLength(0);
    expect(() => e.retry(r.id)).toThrow(/Start a new run/);
  });
  it('retries an idempotent failed step without duplicating effects, up to maxAttempts', () => {
    const s = fresh(); seed(s); let fail = 1;
    const e = new WorkflowEngine(s, { fault: (id) => { if (id === 'remind' && fail-- > 0) throw new Error('transient'); } });
    const r = e.start('low-stock-reminder', { threshold: 3 }); e.approve(r.id, r.payloadHash);
    expect(e.execute(r.id).status).toBe('failed'); expect(s.reminders()).toHaveLength(0);
    expect(e.retry(r.id).status).toBe('succeeded'); expect(s.reminders()).toHaveLength(1);
    expect(e.steps(r.id).find((x) => x.stepId === 'remind')!.attempts).toBe(2);
    const always = new WorkflowEngine(s, { fault: (id) => { if (id === 'remind') throw new Error('down'); } });
    s.db.prepare("UPDATE mb_products SET stock=0 WHERE sku='MUG'").run();
    const r2 = always.start('low-stock-reminder', { threshold: 3 }); always.approve(r2.id, r2.payloadHash); always.execute(r2.id); always.retry(r2.id); always.retry(r2.id);
    expect(() => always.retry(r2.id)).toThrow(/Retry limit 3/);
  });
  it('cancel before execution writes nothing; cancel after partial effects compensates', () => {
    const s = fresh(); seed(s); const e = new WorkflowEngine(s);
    const r = e.start('low-stock-reminder', { threshold: 3 }); expect(e.cancel(r.id).status).toBe('cancelled'); expect(() => e.approve(r.id, r.payloadHash)).toThrow(/cancelled/);
    // Simulate a crash after the reminder step persisted but before the run finished.
    const r2 = e.start('low-stock-reminder', { threshold: 4 }); e.approve(r2.id, r2.payloadHash);
    const crash = new WorkflowEngine(s, { fault: () => undefined }); crash.execute(r2.id);
    s.db.prepare("UPDATE mb_workflow_runs SET status='running' WHERE id=?").run(r2.id);
    const c = e.cancel(r2.id); expect(c.status).toBe('compensated'); expect(s.reminders().every((x) => x.status === 'done')).toBe(true);
  });
  it('times out an approval past the deadline', () => {
    const s = fresh(); seed(s); let t = Date.now(); const e = new WorkflowEngine(s, { clock: () => t });
    const r = e.start('low-stock-reminder', { threshold: 3 }); t += LOW_STOCK_REMINDER.timeoutMs + 1;
    expect(e.approve(r.id, r.payloadHash).status).toBe('timed_out'); expect(s.reminders()).toHaveLength(0);
  });
  it('records denied model tool requests as evidence and ignores requested permissions', () => {
    const s = fresh(); seed(s); const e = new WorkflowEngine(s); const r = e.start('low-stock-reminder', { threshold: 3 });
    const d = e.requestTool(r.id, { tool: 'messages.send', requestedBy: 'model', permissions: ['messages.send', 'invoices.issue'] });
    expect(d).toMatchObject({ allowed: false, ignoredPermissions: ['messages.send', 'invoices.issue'] });
    expect(e.events(r.id).at(-1)).toMatchObject({ type: 'tool.denied' });
    expect(s.evidence().at(-1)!.action).toBe('workflow.tool.denied');
  });
  it('survives a restart: a running run resumes from its last persisted step', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'wf-')); dirs.push(dir); const file = path.join(dir, 'b.db');
    const s1 = fresh(file); seed(s1); const e1 = new WorkflowEngine(s1, { fault: (id) => { if (id === 'remind') throw new Error('power cut'); } });
    const r = e1.start('low-stock-reminder', { threshold: 3 }); e1.approve(r.id, r.payloadHash); e1.execute(r.id); s1.close();
    const s2 = fresh(file); const e2 = new WorkflowEngine(s2);
    expect(e2.steps(r.id).map((x) => x.status)).toEqual(['succeeded', 'failed']);
    expect(e2.retry(r.id).status).toBe('succeeded'); expect(e2.steps(r.id)[0].attempts).toBe(1); expect(s2.reminders()).toHaveLength(1); expect(s2.verifyAudit()).toBe(true);
  });
});

import { annotate, classify, evidenceCsv, filterEvidence } from '@/lib/metabos/evidence';
describe('evidence explorer', () => {
  it('derives actor/entity/result and filters', () => {
    expect(classify('workflow.tool.denied')).toEqual({ actor: 'workflow engine', entity: 'workflow tool', result: 'denied' });
    expect(classify('invoice.issued')).toEqual({ actor: 'operator', entity: 'invoice', result: 'success' });
    expect(classify('webhook.received').actor).toBe('webhook');
    const s = fresh(); seed(s); const e = new WorkflowEngine(s); const r = e.start('low-stock-reminder', { threshold: 3 });
    e.requestTool(r.id, { tool: 'messages.send', requestedBy: 'model' });
    const a = annotate(s.evidence()); expect(a.valid).toBe(true); expect(a.headHash).toBe(s.evidence().at(-1)!.hash);
    expect(filterEvidence(a.rows, { result: 'denied' }).map((x) => x.action)).toEqual(['workflow.tool.denied']);
    expect(filterEvidence(a.rows, { entity: 'product' })).toHaveLength(2);
    expect(filterEvidence(a.rows, { actor: 'workflow engine', q: r.id.slice(0, 8) }).length).toBeGreaterThan(0);
    expect(filterEvidence(a.rows, { from: '2999-01-01T00:00:00Z' })).toHaveLength(0);
    expect(evidenceCsv([]).trim()).toBe('seq,createdAt,actor,entity,action,result,target,detail,previousHash,hash,linkValid');
  });
  it('locates the first broken link after tampering', () => {
    const s = fresh(); seed(s); s.db.prepare("UPDATE mb_audit SET detail='forged' WHERE seq=1").run();
    const a = annotate(s.evidence()); expect(a.valid).toBe(false); expect(a.firstBrokenSeq).toBe(1); expect(a.rows.every((x) => !x.linkValid)).toBe(true);
  });
});
