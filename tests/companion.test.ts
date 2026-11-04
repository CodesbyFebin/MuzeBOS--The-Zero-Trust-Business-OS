import { describe, expect, it } from 'vitest';
import { BusinessStore } from '@/lib/metabos/store';
import { companionSnapshot, DraftInput, proposeCompanionDraft } from '@/lib/metabos/companion/core';
import { readCompanionMessage } from '@/lib/metabos/companion/bridge';
import { InferenceStore } from '@/lib/metabos/inference/store';
const channel = 'f5fda3bc-d756-4ff6-81c0-6982171d6598';
const envelope = (intent: unknown) => ({ protocol: 'muze-argon/v1', channel, intent });
describe('opaque Argon bridge', () => {
  it('accepts only fixed destinations and bounded UI intents for this frame channel', () => {
    expect(readCompanionMessage(envelope({ type: 'navigate', target: 'board' }), channel)).toEqual({ type: 'navigate', target: 'board' });
    expect(readCompanionMessage(envelope({ type: 'navigate', target: 'https://evil.example' }), channel)).toBeNull();
    expect(readCompanionMessage(envelope({ type: 'approve', id: 'x' }), channel)).toBeNull();
    expect(readCompanionMessage(envelope({ type: 'draft', text: 'a'.repeat(12001) }), channel)).toBeNull();
    expect(readCompanionMessage(envelope({ type: 'status' }), crypto.randomUUID())).toBeNull();
    expect(readCompanionMessage({ ...envelope({ type: 'status' }), url: '/api/dispatch' }, channel)).toBeNull();
  });
});
describe('one durable business brain', () => {
  it('creates an approval-bound draft without running a model or writing a dispatch', () => {
    const s = new BusinessStore(':memory:');
    const t = proposeCompanionDraft(s, { title: 'Review invoices', prompt: 'Analyse overdue invoices and draft a follow up', lane: 'browser' });
    expect(t.payload.prompt).toContain('Workspace facts:'); expect(t.payload.prompt).toContain('Do not invent revenue'); expect(t.state).toBe('awaiting_approval'); expect(t.approvedHash).toBeNull(); expect(t.output).toBeNull();
    const brain = new InferenceStore(s); expect(brain.task(t.id).hash).toBe(t.hash);
    const snap = companionSnapshot(s, {}); expect(snap.brain.tasks[0].id).toBe(t.id);
    expect(snap.workspace.pendingSends).toBe(0); expect(snap.brain.workers).toEqual([]); expect(s.verifyAudit()).toBe(true); s.close();
  });
  it('reports worker liveness from persisted heartbeat age, not UI presence', () => {
    const s = new BusinessStore(':memory:'); const brain = new InferenceStore(s);
    brain.claim('test-server', 'server');
    expect(companionSnapshot(s, {}).brain.workers[0].online).toBe(true);
    s.db.prepare('UPDATE mb_inference_workers SET lastSeen=?').run('2000-01-01T00:00:00.000Z');
    expect(companionSnapshot(s, {}).brain.workers[0].online).toBe(false); s.close();
  });
  it('does not accept caller-selected approval state or execution tools', () => {
    expect(DraftInput.safeParse({ title: 'Task', prompt: 'Do this', approved: true }).success).toBe(false);
    expect(DraftInput.safeParse({ title: 'Task', prompt: 'Do this', tool: 'shell' }).success).toBe(false);
  });
});
