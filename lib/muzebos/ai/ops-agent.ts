/**
 * Hackathon agentic flow: a founder writes one messy ops request; the swarm sorter splits it, each
 * write-like subtask goes to a Meta model (Muse Spark for small/medium, Muse Wonder for large, or
 * Muse Spark Open on Baseten), the model's JSON is parsed as untrusted data, and every proposal is
 * filed with the Jev gate. Nothing executes: a person approves the exact payload hash in the Brain UI.
 * Without keys the flow runs in 'rule' mode and every step says so. It never fabricates model output.
 */
import type { BusinessStore } from '../store';
import { propose } from './jev';
import { sortTask, parseModelProposal, ruleProposal, PROPOSAL_PROMPT, type Subtask } from './swarm';
import { metaChat, basetenChat, metaKey, basetenKey, META_MODELS, BASETEN_MUSE_SPARK_OPEN } from './meta';

type Env = Record<string, string | undefined>;
export type StepTrace = { subtask: Subtask; engine: 'meta' | 'baseten' | 'rule' | 'skipped'; model: string | null; raw: string | null; outcome: string; runId: string | null };
export type OpsRun = { mode: 'live-meta' | 'live-baseten' | 'rule'; steps: StepTrace[] };

export function pickEngine(env: Env, prefer: 'meta' | 'baseten' = 'meta'): OpsRun['mode'] {
  if (prefer === 'baseten' && basetenKey(env)) return 'live-baseten';
  if (metaKey(env)) return 'live-meta';
  if (basetenKey(env)) return 'live-baseten';
  return 'rule';
}

export async function runOpsAgent(store: BusinessStore, request: string, opts: { env?: Env; fetch?: typeof fetch; prefer?: 'meta' | 'baseten' } = {}): Promise<OpsRun> {
  const env = opts.env ?? process.env;
  const mode = pickEngine(env, opts.prefer);
  const steps: StepTrace[] = [];
  for (const t of sortTask(request, 'ops')) {
    if (!t.wantsWrite) { steps.push({ subtask: t, engine: 'skipped', model: null, raw: null, outcome: 'No write needed; nothing proposed.', runId: null }); continue; }
    if (mode === 'rule') {
      const p = ruleProposal(t)!; const run = propose(store, p) as any;
      steps.push({ subtask: t, engine: 'rule', model: null, raw: null, outcome: 'Rule-based proposal filed with Jev (no model key set).', runId: run?.id ?? null });
      continue;
    }
    const messages = [{ role: 'system' as const, content: PROPOSAL_PROMPT }, { role: 'user' as const, content: `Agent role: ${t.role}. Subtask: ${t.text}` }];
    try {
      const r = mode === 'live-baseten' ? await basetenChat(messages, { env, fetch: opts.fetch })
        : await metaChat(t.tier === 'large' ? META_MODELS.wonder : META_MODELS.spark, messages, { env, fetch: opts.fetch });
      const parsed = parseModelProposal(r.text, { taskId: t.id, role: t.role, model: r.model });
      if (!parsed.ok) { steps.push({ subtask: t, engine: r.provider, model: r.model, raw: r.text.slice(0, 2000), outcome: parsed.reason, runId: null }); continue; }
      const run = propose(store, parsed.proposal) as any;
      steps.push({ subtask: t, engine: r.provider, model: r.model, raw: r.text.slice(0, 2000), outcome: 'Model proposal filed with Jev; awaiting human approval of its payload hash.', runId: run?.id ?? null });
    } catch (e) {
      steps.push({ subtask: t, engine: mode === 'live-baseten' ? 'baseten' : 'meta', model: mode === 'live-baseten' ? BASETEN_MUSE_SPARK_OPEN : null, raw: null, outcome: `Model call failed: ${(e as Error).message}`, runId: null });
    }
  }
  return { mode, steps };
}
