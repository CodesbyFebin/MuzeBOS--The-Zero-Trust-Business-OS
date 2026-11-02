import { NextResponse } from 'next/server';
import { z } from 'zod';
import { memberRead } from '@/lib/metabos/member-read';
import { BusinessError } from '@/lib/metabos/store';
import { can, requirePermission } from '@/lib/metabos/biz/accounts';
import { listAgents, upsertAgent } from '@/lib/metabos/brain/metering';
import { counterparties, gradeCounterpartyEvent, listFlows, proposeAgentCompletion, recordCounterpartyEvent, runFlow, saveFlow, toolGate } from '@/lib/metabos/brain/ops';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const id = z.string().uuid();
const code = z.string().regex(/^[a-z0-9][a-z0-9-]{1,39}$/);
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('agent'), code, name: z.string().trim().min(2).max(80), monthlyCapMicroUsd: z.number().int().min(0).max(1_000_000_000) }).strict(),
  z.object({ action: z.literal('agent-completion'), code, prompt: z.string().trim().min(1).max(8000), tier: z.enum(['auto', 'small', 'medium', 'large']).default('auto') }).strict(),
  z.object({ action: z.literal('tool-gate'), code: z.string().min(1).max(60) }).strict(),
  z.object({ action: z.literal('flow-save'), name: z.string().trim().min(2).max(80), spec: z.unknown() }).strict(),
  z.object({ action: z.literal('flow-run'), flowId: id, input: z.record(z.string(), z.union([z.string().max(500), z.number(), z.boolean(), z.array(z.union([z.string().max(200), z.number()])).max(50)])).optional() }).strict(),
  z.object({ action: z.literal('counterparty-event'), customerId: z.string().min(1).max(80), kind: z.enum(['late_payment', 'paid_on_time', 'dispute', 'other']), note: z.string().trim().min(3).max(500) }).strict(),
  z.object({ action: z.literal('counterparty-grade'), eventId: id, outcome: z.enum(['band_held', 'band_wrong']) }).strict(),
]);
function failure(e: unknown) {
  if (e instanceof BusinessError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof z.ZodError || e instanceof SyntaxError) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  console.error('Brain failed', e instanceof Error ? e.name : 'unknown');
  return NextResponse.json({ error: 'Brain action failed' }, { status: 500 });
}
/** Brain/Ops: agents with spend caps, flows that only propose, tool gates and counterparty risk. */
export async function GET(req: Request) {
  try {
    const { s, me } = memberRead(req);
    const agents = listAgents(s);
    return NextResponse.json({ agents, ...listFlows(s), counterparties: can(me, 'finance.read') ? counterparties(s) : null, openrouter: Boolean(process.env.OPENROUTER_API_KEY) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return failure(e); }
}
export async function POST(req: Request) {
  try {
    const { s, me } = memberRead(req);
    if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new BusinessError('JSON content type required', 415);
    const text = await req.text(); if (text.length > 32_000) throw new BusinessError('Request too large', 413);
    const b = Body.parse(JSON.parse(text));
    switch (b.action) {
      case 'agent': requirePermission(me, 'members.manage'); return NextResponse.json({ agent: upsertAgent(s, me.id, b.code, b.name, b.monthlyCapMicroUsd) });
      case 'agent-completion': requirePermission(me, 'deals.write'); return NextResponse.json(proposeAgentCompletion(s, me.id, b.code, b.prompt, b.tier));
      case 'tool-gate': return NextResponse.json({ gate: toolGate(s, b.code) });
      case 'flow-save': requirePermission(me, 'jev.decide'); return NextResponse.json({ flow: saveFlow(s, me.id, b.name, b.spec) });
      case 'flow-run': requirePermission(me, 'jev.decide'); return NextResponse.json({ run: runFlow(s, me.id, b.flowId, b.input) });
      case 'counterparty-event': requirePermission(me, 'finance.read'); return NextResponse.json({ id: recordCounterpartyEvent(s, me.id, b.customerId, b.kind, b.note) });
      case 'counterparty-grade': requirePermission(me, 'jev.decide'); gradeCounterpartyEvent(s, me.id, b.eventId, b.outcome); return NextResponse.json({ ok: true });
    }
  } catch (e) { return failure(e); }
}
