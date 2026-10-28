/** Submission path: a completed server draft can propose one action, never approve it. */
import { z } from 'zod';
import { BusinessError } from '@/lib/metabos/store';
import { propose } from '@/lib/metabos/ai/jev';
import { InferenceStore } from './store';
import { fingerprint } from './routing';
export const reminderProposal = z.object({
  tool: z.literal('reminders.create'),
  args: z.object({ title: z.string().trim().min(1).max(180) }).strict(),
}).strict();
export function proposeInferenceAction(store: InferenceStore, taskId: string) {
  return store.business.transact(() => {
    const task = store.task(taskId);
    if (task.state !== 'completed' || !['meta', 'baseten'].includes(task.payload.provider)) throw new BusinessError('A completed Meta or Baseten server draft is required', 409);
    if (task.approvedHash !== task.hash || fingerprint(task.payload) !== task.hash || !task.output || fingerprint(task.output) !== task.outputHash) throw new BusinessError('Inference evidence integrity mismatch', 409);
    // No markdown stripping, heuristic repair, tool invocation, reasoning fallback or widened scopes.
    let proposal;
    try { proposal = reminderProposal.parse(JSON.parse(task.output)); }
    catch { throw new BusinessError('Expected only a reminders.create JSON proposal; nothing executed', 422); }
    return propose(store.business, {
      taskId: task.id, role: 'operations', ...proposal, source: 'model', model: task.payload.model,
      rationale: `Inference payload SHA256=${task.hash}; output SHA256=${task.outputHash}`,
    });
  });
}
