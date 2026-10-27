import { NextResponse } from 'next/server';
import { z } from 'zod';
import { businessStore, BusinessError } from '@/lib/muzebos/store';
import { businessAccess } from '@/lib/muzebos/http';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
function fail(e: unknown) {
  if (e instanceof BusinessError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof z.ZodError || e instanceof SyntaxError) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  return NextResponse.json({ error: 'Request failed' }, { status: 500 });
}
const lane = { lane: z.enum(['meta', 'baseten']).default('meta'), paidConsent: z.boolean().default(false) };
import { listDeals, createDeal, moveDeal, pipelineSummary, dealEvents, requestNextStep, readNextStep, STAGES, STAGE_PROBABILITY, winProbability, weighted } from '@/lib/muzebos/biz/pipeline';
const cmd = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), deal: z.unknown() }),
  z.object({ action: z.literal('move'), dealId: z.string().max(64), stage: z.string(), note: z.string().optional(), probability: z.number().nullable().optional() }),
  z.object({ action: z.literal('requestNextStep'), dealId: z.string().max(64), ...lane }),
  z.object({ action: z.literal('readNextStep'), taskId: z.string().max(64) }),
]);
export async function GET(req: Request) {
  try { businessAccess(req); const s = businessStore(); return NextResponse.json({ stages: STAGES, defaults: STAGE_PROBABILITY, summary: pipelineSummary(s), deals: listDeals(s).map((d) => ({ ...d, winProbability: winProbability(d), weighted: weighted(d), events: dealEvents(s, d.id) })), customers: s.customers() }); } catch (e) { return fail(e); }
}
export async function POST(req: Request) {
  try {
    businessAccess(req); const c = cmd.parse(await req.json()); const s = businessStore();
    if (c.action === 'create') return NextResponse.json({ deal: createDeal(s, c.deal) });
    if (c.action === 'move') { const { action: _a, dealId, ...m } = c; return NextResponse.json({ deal: moveDeal(s, dealId, m) }); }
    if (c.action === 'requestNextStep') return NextResponse.json({ task: requestNextStep(s, c.dealId, { lane: c.lane, paidConsent: c.paidConsent }) });
    return NextResponse.json({ advice: readNextStep(s, c.taskId) });
  } catch (e) { return fail(e); }
}
