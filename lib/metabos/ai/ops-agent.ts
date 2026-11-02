/** PR #22 request sorter: create drafts for Jev review, never spend or execute on key presence.
 * The selected workspace route/model is frozen into each task. This does not claim a live swarm.
 */
import type { BusinessStore } from '../store';
import { InferenceStore } from '../inference/store';
import { routes } from '../inference/routing';
import { sortTask } from './swarm';
import { runtimeEnv } from '@/lib/creds';
import { BusinessError } from '../store';
export async function runOpsAgent(business: BusinessStore, request: string, opts: { env?: Record<string, string | undefined>; prefer?: 'meta' | 'baseten' } = {}) {
  if (!request.trim() || request.length > 12000) throw new BusinessError('Ops request must contain 1–12000 characters');
  const env = opts.env ?? runtimeEnv();
  const inference = new InferenceStore(business, () => routes(env));
  const selected = opts.prefer ?? 'meta';
  // A bounded atomic batch: failure cannot leave an unreported partial family of drafts.
  return business.transact(() => ({ mode: 'awaiting-inference-approval' as const, steps: sortTask(request, 'ops').slice(0, 5).map(subtask => {
    if (!subtask.wantsWrite) return { subtask, task: null, outcome: 'No write requested; no proposal created' };
    const task = inference.create({ title: `Ops: ${subtask.text.slice(0, 145)}`, prompt: `Propose only a reminder for human review for this request: ${subtask.text}. Return exactly {"tool":"reminders.create","args":{"title":"your reminder title"}}, no markdown or extra fields. Do not execute actions.`, kind: subtask.tier === 'large' ? 'plan' : 'draft', lane: selected, maxTokens: 2048, paidConsent: false });
    return { subtask, task, outcome: 'Draft created; no model call. Paid consent requires a new reviewed task; no silent provider fallback.' };
  }) }));
}
