/**
 * Multi-agent pipeline with an approval stop (batch 3 #5; pattern idea from OHAS, rebuilt during the event).
 * research -> draft -> review (Llama Guard) -> Jev. The pipeline stops at Jev; if nobody answers by the
 * deadline it is "blocked" and never continues on its own. Steps take owner-supplied or model text only.
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { BusinessStore } from '../store';
import { propose } from '../ai/jev';
import { guardDraft } from '../ai/local-llm';
import { WorkflowEngine } from '../workflows';
import { assertSafeOutput } from './safe-outputs';
export const PipelineInput = z.object({ goal: z.string().trim().min(3).max(200), research: z.string().trim().min(1).max(6000), draft: z.string().trim().min(1).max(6000), role: z.enum(['writer', 'operations']), approveWithinHours: z.number().int().min(1).max(168).default(24) }).strict();
export type PipelineStage = 'awaiting_approval' | 'blocked' | 'approved' | 'rejected';
type Row = { id: string; goal: string; role: string; research: string; draft: string; guard: string; jevRunId: string; deadline: string; createdAt: string };
const ensure = (s: BusinessStore) => s.db.exec('CREATE TABLE IF NOT EXISTS mb_pipelines(id TEXT PRIMARY KEY, goal TEXT, role TEXT, research TEXT, draft TEXT, guard TEXT, jevRunId TEXT, deadline TEXT, createdAt TEXT)');
export async function startPipeline(s: BusinessStore, raw: unknown, opts: { now?: Date; guard?: typeof guardDraft } = {}) {
  ensure(s); const p = PipelineInput.parse(raw); const id = `pl_${randomUUID().slice(0, 12)}`;
  assertSafeOutput(s, p.role, 'pipeline_draft', id);
  const g = await (opts.guard ?? guardDraft)(s, p.draft);
  if (g.verdict === 'unsafe') { s.transact(() => s.appendEvidence('pipeline.review.unsafe', id, 'Llama Guard flagged the draft; not sent to Jev')); return { id, stage: 'rejected' as const, guard: g }; }
  const run = propose(s, { taskId: `pipeline-${id}`, role: p.role, tool: 'reminders.create', args: { title: `Review pipeline draft: ${p.goal}`.slice(0, 180) }, rationale: `research→draft→review done; guard ${g.verdict}`, source: 'rule', model: null });
  const now = opts.now ?? new Date(); const deadline = new Date(now.getTime() + p.approveWithinHours * 3_600_000).toISOString();
  s.transact(() => { s.db.prepare('INSERT INTO mb_pipelines VALUES(?,?,?,?,?,?,?,?,?)').run(id, p.goal, p.role, p.research, p.draft, g.verdict, run.id, deadline, now.toISOString()); s.appendEvidence('pipeline.stopped.at.jev', id, `Jev ${run.id}; deadline ${deadline}`); });
  return { id, stage: 'awaiting_approval' as const, guard: g, jevRunId: run.id, deadline };
}
export function listPipelines(s: BusinessStore, now = new Date()) {
  ensure(s); const e = new WorkflowEngine(s);
  return (s.db.prepare('SELECT * FROM mb_pipelines ORDER BY createdAt DESC').all() as Row[]).map((r) => {
    const st = e.run(r.jevRunId).status;
    const stage: PipelineStage = st === 'awaiting_approval' ? (Date.parse(r.deadline) < now.getTime() ? 'blocked' : 'awaiting_approval') : st === 'cancelled' || st === 'failed' || st === 'timed_out' ? 'rejected' : 'approved';
    return { ...r, stage, steps: ['research', 'draft', 'review', 'jev'] };
  });
}
