import { memberRead } from '@/lib/metabos/member-read';
import { readJsonBounded } from '@/lib/bounded-body';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { businessStore, BusinessError } from '@/lib/metabos/store';
import { businessAccess } from '@/lib/metabos/http';
import { requireMember } from '@/lib/metabos/biz/accounts';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
function fail(e: unknown) {
  if (e instanceof BusinessError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof z.ZodError || e instanceof SyntaxError) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  return NextResponse.json({ error: 'Request failed' }, { status: 500 });
}
const lane = { lane: z.enum(['meta', 'baseten']).default('meta'), paidConsent: z.boolean().default(false) };
import { founderDashboard, setCash, requestFounderBrief, readFounderBrief } from '@/lib/metabos/biz/dashboard';
const cmd = z.discriminatedUnion('action', [
  z.object({ action: z.literal('setCash'), amount: z.number(), asOf: z.string() }),
  z.object({ action: z.literal('requestBrief'), ...lane }),
  z.object({ action: z.literal('readBrief'), taskId: z.string().max(64) }),
]);
export async function GET(req: Request) {
  try { memberRead(req, 'finance.read'); return NextResponse.json({ dashboard: founderDashboard(businessStore()) }); } catch (e) { return fail(e); }
}
export async function POST(req: Request) {
  try {
    businessAccess(req); const c = cmd.parse(await readJsonBounded(req)); const s = businessStore();
    if (c.action === 'setCash') return NextResponse.json({ cash: setCash(s, requireMember(s, req).id, { amount: c.amount, asOf: c.asOf }) });
    if (c.action === 'requestBrief') return NextResponse.json({ task: requestFounderBrief(s, { lane: c.lane, paidConsent: c.paidConsent }) });
    return NextResponse.json({ brief: readFounderBrief(s, c.taskId) });
  } catch (e) { return fail(e); }
}
