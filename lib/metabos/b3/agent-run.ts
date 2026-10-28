/**
 * Run a swarm agent card on Yao (self-hosted, meta_muse connector) or on the local claw-local runner.
 * Built during the event; the Yao client is adapted from our own /workspace/yao-bridge/metabos-yao-adapter.ts
 * prototype (same author, same day), with the stream parser fixed against a live Yao 1.7.3 reply.
 * Every result becomes a Brain draft, goes through Llama Guard, and (unless flagged unsafe) becomes ONE pending
 * Jev review item. Proposed external actions are only listed on the draft; nothing here dispatches anything.
 */
import { execFile } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { BusinessStore } from '../store';
import { BusinessError } from '../store';
import { propose } from '../ai/jev';
import { guardDraft } from '../ai/local-llm';
import { WorkflowEngine } from '../workflows';
import { assertSafeOutput } from './safe-outputs';
import type { AgentCard } from './swarms';

type Env = Record<string, string | undefined>;
export type ProposedAction = { tool: string; args?: Record<string, unknown>; reason?: string };
export type AgentDraft = { draft: string; proposed_actions: ProposedAction[]; confidence: number };

// ---------- Yao ----------
export function yaoStatus(env: Env = process.env) {
  return env.MUZEBOS_YAO_BASE_URL && env.MUZEBOS_YAO_ACCESS_TOKEN ? { connected: true, label: 'Connected' } : { connected: false, label: 'Not connected — add MUZEBOS_YAO_BASE_URL and MUZEBOS_YAO_ACCESS_TOKEN' };
}

/**
 * Parse Yao's /v1/chat/completions SSE. Verified on a live reply (2026-10-28, Yao 1.7.3):
 * OpenAI chat.completion.chunk frames; the first frame has id "" and carries a trace/status line
 * ("🚀 output.stream_start - [output.view_trace](…)"), which is not model text and is dropped;
 * model frames have id "M1"…; no finish_reason frame; the stream ends with "data: [DONE]".
 */
export function parseYaoStream(sse: string): string {
  let raw = '';
  for (const line of sse.split('\n')) {
    if (!line.startsWith('data:')) continue; const d = line.slice(5).trim(); if (!d || d === '[DONE]') continue;
    try { const j = JSON.parse(d); if (j?.id === '' || j?.id === undefined) continue; raw += j?.choices?.[0]?.delta?.content ?? ''; } catch { /* skip non-JSON frames */ }
  }
  return raw;
}
export function toDraft(raw: string): AgentDraft {
  const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
  try { const j = JSON.parse(a >= 0 && b > a ? raw.slice(a, b + 1) : raw); if (typeof j.draft === 'string') return { draft: j.draft, proposed_actions: Array.isArray(j.proposed_actions) ? j.proposed_actions : [], confidence: Number(j.confidence) || 0 }; } catch { /* fall through */ }
  return { draft: raw.trim(), proposed_actions: [], confidence: 0 };
}
export async function runOnYao(card: AgentCard, task: string, env: Env = process.env, fetcher: typeof fetch = fetch): Promise<AgentDraft> {
  const st = yaoStatus(env); if (!st.connected) throw new BusinessError(st.label, 503);
  const base = env.MUZEBOS_YAO_BASE_URL!.replace(/\/+$/, '');
  let res: Response;
  try {
    res = await fetcher(`${base}/chat/completions?assistant_id=${encodeURIComponent(`metabos.${card.id.toLowerCase()}`)}`, { method: 'POST', signal: AbortSignal.timeout(120_000), headers: { Authorization: `Bearer ${env.MUZEBOS_YAO_ACCESS_TOKEN}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify({ messages: [{ role: 'user', content: task }] }) });
  } catch (e) { throw new BusinessError(`Not connected — Yao is not reachable (${e instanceof Error ? e.message.slice(0, 60) : 'error'})`, 503); }
  if (!res.ok) throw new BusinessError(res.status === 401 || res.status === 403 ? 'Yao refused the token (check MUZEBOS_YAO_ACCESS_TOKEN)' : `Yao returned HTTP ${res.status}`, 502);
  const raw = parseYaoStream(await res.text());
  if (!raw.trim()) throw new BusinessError('Yao returned no text', 502);
  return toDraft(raw);
}

// ---------- claw-local ----------
export function clawStatus(env: Env = process.env) {
  const dir = env.MUZEBOS_CLAW_DIR; if (!dir) return { connected: false, label: 'Not connected — set MUZEBOS_CLAW_DIR to your claw-local folder' };
  try { accessSync(join(dir, 'claw'), constants.X_OK); return { connected: true, label: 'Ready (local models; Meta fallback only within the $5 cap)' }; } catch { return { connected: false, label: `Not connected — no executable claw in ${dir}` }; }
}
export type ClawResult = { output?: { text?: string; draft?: string; proposed_actions?: ProposedAction[]; confidence?: number } | null; model?: string; escalated?: boolean; cost_usd?: number; guard_verdict?: string; validated?: boolean };
export function runOnClaw(card: AgentCard, task: string, env: Env = process.env, exec: typeof execFile = execFile): Promise<AgentDraft & { model: string; costUsd: number }> {
  const st = clawStatus(env); if (!st.connected) return Promise.reject(new BusinessError(st.label, 503));
  return new Promise((resolve, reject) => {
    // execFile, no shell: the task is one argv entry and cannot inject commands.
    exec(join(env.MUZEBOS_CLAW_DIR!, 'claw'), ['run', '--swarm', card.swarm, '--role', card.role, '--type', 'draft', '--task', task], { cwd: env.MUZEBOS_CLAW_DIR, timeout: 300_000, maxBuffer: 2_000_000, env: { ...process.env } }, (err, stdout) => {
      if (err) return reject(new BusinessError(`claw-local failed: ${String(err.message).slice(0, 120)}`, 502));
      try {
        const s = String(stdout); const j = JSON.parse(s.slice(s.indexOf('{'))) as ClawResult;
        const o = j.output ?? {}; const text = o.text ?? o.draft ?? '';
        if (!text) return reject(new BusinessError('claw-local returned no draft', 502));
        resolve({ draft: text, proposed_actions: o.proposed_actions ?? [], confidence: Number(o.confidence) || 0, model: j.model ?? 'unknown', costUsd: Number(j.cost_usd) || 0 });
      } catch { reject(new BusinessError('claw-local output was not JSON', 502)); }
    });
  });
}

// ---------- intake: Brain draft → Llama Guard → pending Jev ----------
const ensure = (s: BusinessStore) => s.db.exec('CREATE TABLE IF NOT EXISTS mb_agent_drafts(id TEXT PRIMARY KEY, cardId TEXT NOT NULL, agent TEXT NOT NULL, source TEXT NOT NULL, task TEXT NOT NULL, text TEXT NOT NULL, confidence REAL, model TEXT, costMicroUsd INTEGER NOT NULL DEFAULT 0, guard TEXT NOT NULL, actions TEXT NOT NULL, rejected TEXT NOT NULL, jevRunId TEXT, createdAt TEXT NOT NULL)');
export async function intakeDraft(s: BusinessStore, card: AgentCard, source: 'yao' | 'claw-local', task: string, d: AgentDraft & { model?: string; costUsd?: number }, opts: { guard?: typeof guardDraft } = {}) {
  ensure(s); const id = `ad_${randomUUID().slice(0, 12)}`;
  assertSafeOutput(s, 'writer', 'brain_draft', id);
  const actions: ProposedAction[] = [], rejected: (ProposedAction & { why: string })[] = [];
  for (const a of d.proposed_actions.slice(0, 10)) {
    const tool = String(a?.tool ?? '');
    if (card.tools.includes(tool)) actions.push({ tool, args: a.args ?? {}, reason: String(a.reason ?? '').slice(0, 300) });
    else rejected.push({ tool, args: a?.args ?? {}, reason: String(a?.reason ?? '').slice(0, 300), why: 'tool not declared on agent card' });
  }
  const g = await (opts.guard ?? guardDraft)(s, d.draft.slice(0, 8000), { target: id });
  let jevRunId: string | null = null;
  if (g.verdict !== 'unsafe') {
    const run = propose(s, { taskId: `agent-${id}`, role: 'writer', tool: 'reminders.create', args: { title: `Review ${source} draft from ${card.name}`.slice(0, 180) }, rationale: `Brain draft ${id}; guard ${g.verdict}; ${actions.length} proposed action(s) held, none sent`.slice(0, 500), source: 'model', model: d.model ?? (source === 'yao' ? 'muse-spark-1.3-contributor (Yao meta_muse)' : 'claw-local') });
    jevRunId = run.id;
  }
  const costMicro = Math.round((d.costUsd ?? 0) * 1e6);
  s.transact(() => {
    s.db.prepare('INSERT INTO mb_agent_drafts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id, card.id, card.name, source, task.slice(0, 4000), d.draft.slice(0, 20000), d.confidence, d.model ?? null, costMicro, g.verdict, JSON.stringify(actions), JSON.stringify(rejected), jevRunId, new Date().toISOString());
    s.appendEvidence(jevRunId ? 'agent.draft.pending_jev' : 'agent.draft.blocked_unsafe', id, `${source} ${card.id}; guard ${g.verdict}${jevRunId ? `; Jev ${jevRunId}` : '; not sent to Jev'}`);
  });
  return { id, source, guard: g, jevRunId, actions, rejected, dispatched: false as const, status: jevRunId ? 'pending_jev' : 'blocked_unsafe' };
}
export function listDrafts(s: BusinessStore, limit = 50) {
  ensure(s); const e = new WorkflowEngine(s);
  return (s.db.prepare('SELECT * FROM mb_agent_drafts ORDER BY createdAt DESC LIMIT ?').all(limit) as Record<string, unknown>[]).map((r) => ({ ...r, actions: JSON.parse(String(r.actions)), rejected: JSON.parse(String(r.rejected)), jevStatus: r.jevRunId ? e.run(String(r.jevRunId)).status : null }));
}
