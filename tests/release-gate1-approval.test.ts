/** Gate 1: Jev agent-write approval journey edge cases (lib + HTTP). */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BusinessStore } from '@/lib/metabos/store';
import { WorkflowEngine } from '@/lib/metabos/workflows';
import { propose } from '@/lib/metabos/ai/jev';
const dirs: string[] = []; const stores: BusinessStore[] = [];
const open = () => { const d = mkdtempSync(path.join(tmpdir(), 'mb-gate1-')); dirs.push(d); const s = new BusinessStore(path.join(d, 'b.sqlite')); stores.push(s); return s; };
afterEach(() => { stores.splice(0).forEach((s) => s.db.open && s.close()); dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })); });
const proposal = (title = 'Call Kaveri about INV-1') => ({ taskId: 't1', role: 'operations', tool: 'reminders.create', args: { title }, source: 'model', model: 'muse-spark-1.3' });
const reminders = (s: BusinessStore) => (s.db.prepare('SELECT COUNT(*) n FROM mb_reminders').get() as { n: number }).n;
describe('Gate 1 approval journey', () => {
  it('approve -> execute -> re-execute/re-propose creates exactly one durable reminder', () => {
    const s = open(); const e = new WorkflowEngine(s); const run = propose(s, proposal());
    expect(run.status).toBe('awaiting_approval'); expect(reminders(s)).toBe(0);
    expect(() => e.execute(run.id)).toThrow(/approved/);
    e.approve(run.id, run.payloadHash); expect(e.execute(run.id).status).toBe('succeeded');
    expect(() => e.execute(run.id)).toThrow(); expect(propose(s, proposal()).id).toBe(run.id);
    expect(reminders(s)).toBe(1); expect(s.verifyAudit()).toBe(true);
  });
  it('reject (cancel) executes nothing and is recorded', () => {
    const s = open(); const e = new WorkflowEngine(s); const run = propose(s, proposal());
    expect(e.cancel(run.id).status).toBe('cancelled'); expect(() => e.approve(run.id, run.payloadHash)).toThrow(/cancelled/);
    expect(reminders(s)).toBe(0); expect(e.events(run.id).map((x) => x.type)).toContain('run.cancelled');
  });
  it('expired approval window times out and executes nothing', () => {
    const s = open(); let t = Date.now(); const e = new WorkflowEngine(s, { clock: () => t }); const run = propose(s, proposal());
    t += 25 * 3600 * 1000; expect(e.approve(run.id, run.payloadHash).status).toBe('timed_out');
    expect(() => e.execute(run.id)).toThrow(); expect(reminders(s)).toBe(0);
  });
  it('a wrong hash is denied and recorded; a changed proposal is a new run needing fresh approval', () => {
    const s = open(); const e = new WorkflowEngine(s); const a = propose(s, proposal());
    expect(() => e.approve(a.id, '0'.repeat(64))).toThrow(/does not match/);
    expect(e.events(a.id).map((x) => x.type)).toContain('approval.denied');
    const b = propose(s, proposal('Call Kaveri about INV-1 and waive fee'));
    expect(b.id).not.toBe(a.id); expect(b.payloadHash).not.toBe(a.payloadHash);
    expect(() => e.approve(b.id, a.payloadHash)).toThrow(/does not match/); expect(reminders(s)).toBe(0);
  });
  it('a stored payload edited after approval is refused at execution (hash-bound)', () => {
    const s = open(); const e = new WorkflowEngine(s); const run = propose(s, proposal()); e.approve(run.id, run.payloadHash);
    const row = s.db.prepare('SELECT input FROM mb_workflow_runs WHERE id=?').get(run.id) as { input: string };
    const tampered = JSON.parse(row.input); tampered.input.args.title = 'Transfer money'; tampered.plan.args.title = 'Transfer money';
    s.db.prepare('UPDATE mb_workflow_runs SET input=? WHERE id=?').run(JSON.stringify(tampered), run.id);
    const out = e.execute(run.id); expect(out.status).toBe('failed'); expect(out.error).toMatch(/changed/); expect(reminders(s)).toBe(0);
  });
  it('agents cannot propose outside the allowed tool (schema-refused, evidenced)', () => {
    const s = open(); expect(() => propose(s, { ...proposal(), tool: 'invoices.issue' })).toThrow(/refused/);
    expect(s.evidence().some((x) => x.action === 'ai.proposal.refused')).toBe(true);
  });
  it('cross-workspace: one database is one workspace; a run in one is unknown in another', () => {
    const a = open(), b = open(); const run = propose(a, proposal());
    expect(() => new WorkflowEngine(b).approve(run.id, run.payloadHash)).toThrow(/not found/); expect(reminders(b)).toBe(0);
  });
});
