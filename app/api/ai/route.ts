import { memberRead } from '@/lib/metabos/member-read';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { businessStore, BusinessError } from '@/lib/metabos/store';
import { businessAccess } from '@/lib/metabos/http';
import { MUSE_FINDINGS, PRICES, SOURCES, TIERS, VERIFIED_AT, WEBLLM_VERSION } from '@/lib/metabos/ai/models';
import { serverProviders, type ChatMessage, type ProviderState } from '@/lib/metabos/ai/providers';
import { route, type Availability, type RouteDecision } from '@/lib/metabos/ai/router';
import { parseModelProposal, PROPOSAL_PROMPT, ruleProposal, sortTask } from '@/lib/metabos/ai/swarm';
import { propose, queue } from '@/lib/metabos/ai/jev';
import { AGENT_ROLES } from '@/lib/metabos/workflows';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const tier = z.enum(['auto', 'small', 'medium', 'large']);
const command = z.discriminatedUnion('action', [
  z.object({ action: z.literal('chat'), message: z.string().trim().min(1).max(4000), tier, webgpu: z.boolean() }),
  z.object({ action: z.literal('swarm'), task: z.string().trim().min(3).max(4000), webgpu: z.boolean() }),
  z.object({ action: z.literal('proposeFromModel'), taskId: z.string().max(64), role: z.enum(AGENT_ROLES), model: z.string().max(120), raw: z.string().max(8000) }),
  z.object({ action: z.literal('logBrowserRun'), decision: z.string().max(600), usage: z.string().max(200) }),
]);
function failure(e: unknown) {
  if (e instanceof BusinessError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof z.ZodError || e instanceof SyntaxError) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  console.error('AI runtime failed', e instanceof Error ? e.name : 'unknown');
  return NextResponse.json({ error: 'AI runtime failed' }, { status: 500 });
}
const states = () => Object.fromEntries(Object.values(serverProviders()).map((p) => [p.id, p.status().state])) as Record<string, ProviderState>;
const log = (action: string, target: string, detail: string) => { const s = businessStore(); s.transact(() => s.appendEvidence(action, target, detail.slice(0, 1000))); };
const summary = (d: RouteDecision) => `${d.requested}->${d.tier}: ${d.chosen ? `${d.chosen.provider}/${d.chosen.model}` : 'none'}; ${d.reasons.join(' ')}`;

/** Route and call a server model, re-routing (down only) when a provider errors. */
async function callWithFallback(text: string, t: z.infer<typeof tier>, a: Availability, messages: ChatMessage[]) {
  const providers = serverProviders(); const errors: string[] = [];
  for (let i = 0; i < 4; i++) {
    const d = route(text, t, a);
    if (errors.length) d.reasons.unshift(...errors);
    if (!d.chosen || d.chosen.provider === 'webllm') return { decision: d, result: null };
    try { return { decision: d, result: await providers[d.chosen.provider].chat(d.chosen.model, messages, AbortSignal.timeout(60_000)) }; }
    catch (e) { errors.push(`${d.chosen.provider}/${d.chosen.model} failed (${e instanceof Error ? e.message.slice(0, 120) : 'error'}); trying the next candidate.`); a = { ...a, states: { ...a.states, [d.chosen.provider]: 'unconfigured' } }; }
  }
  const d = route(text, t, { webgpu: false, states: {} }); d.reasons.unshift(...errors); return { decision: d, result: null };
}

export async function GET(req: Request) {
  try {
    memberRead(req, 'finance.read');
    return NextResponse.json({ verifiedAt: VERIFIED_AT, webllmVersion: WEBLLM_VERSION, sources: SOURCES, tiers: TIERS, prices: PRICES, providers: Object.values(serverProviders()).map((p) => p.status()), muse: MUSE_FINDINGS, queue: queue(businessStore()) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return failure(e); }
}

export async function POST(req: Request) {
  try {
    businessAccess(req);
    const raw = await req.text(); if (raw.length > 16_000) throw new BusinessError('Request too large', 413);
    const c = command.parse(JSON.parse(raw));
    const store = businessStore();
    if (c.action === 'chat') {
      const { decision, result } = await callWithFallback(c.message, c.tier, { webgpu: c.webgpu, states: states() }, [{ role: 'user', content: c.message }]);
      log('ai.route', 'chat', `${summary(decision)} usage=${result?.usage ? `${result.usage.totalTokens} tokens` : 'unavailable'}`);
      return NextResponse.json({ decision, runInBrowser: decision.chosen?.provider === 'webllm', reply: result?.text ?? null, usage: result?.usage ?? null, model: result?.model ?? null });
    }
    if (c.action === 'logBrowserRun') { log('ai.route', 'chat', `browser: ${c.decision} usage=${c.usage}`); return NextResponse.json({ ok: true }); }
    if (c.action === 'proposeFromModel') {
      const p = parseModelProposal(c.raw, { taskId: c.taskId, role: c.role, model: c.model });
      if (!p.ok) { log('ai.proposal.refused', c.taskId, p.reason); return NextResponse.json({ error: p.reason }, { status: 422 }); }
      return NextResponse.json(propose(store, p.proposal));
    }
    // swarm
    const prefix = `t${Date.now().toString(36)}-`;
    const subtasks = sortTask(c.task, prefix);
    const out = [];
    for (const t of subtasks) {
      const a: Availability = { webgpu: false, states: states() }; // proposals are made server-side
      let proposal: unknown = null; let note = 'No write needed.'; let decision: RouteDecision | null = null;
      if (t.wantsWrite) {
        const r = await callWithFallback(t.text, t.tier, a, [{ role: 'system', content: PROPOSAL_PROMPT }, { role: 'user', content: t.text }]);
        decision = r.decision;
        if (r.result) {
          const parsed = parseModelProposal(r.result.text, { taskId: t.id, role: t.role, model: r.result.model });
          if (parsed.ok) { proposal = parsed.proposal; note = 'Model proposal passed the schema.'; } else { note = parsed.reason; log('ai.proposal.refused', t.id, parsed.reason); }
        } else { proposal = ruleProposal(t); note = 'No server model available; rule-based draft (no model used).'; }
      }
      let run = null; let error = null;
      if (proposal) { try { run = propose(store, proposal); } catch (e) { error = e instanceof Error ? e.message : 'Refused'; } }
      out.push({ ...t, decision, note, runId: run?.id ?? null, payloadHash: run?.payloadHash ?? null, error });
    }
    log('ai.swarm', 'swarm', `${subtasks.length} subtasks: ${subtasks.map((t) => `${t.id}=${t.role}/${t.tier}`).join(', ')}`);
    return NextResponse.json({ subtasks: out });
  } catch (e) { return failure(e); }
}
