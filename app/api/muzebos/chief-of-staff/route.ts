import { memberRead } from '@/lib/muzebos/member-read';
import { readJsonBounded } from '@/lib/bounded-body';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { businessStore, BusinessError } from '@/lib/muzebos/store';
import { businessAccess } from '@/lib/muzebos/http';
import { brief, recordDecision, lookupDecision } from '@/lib/muzebos/chief-of-staff';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const cmd = z.discriminatedUnion('action', [
  z.object({ action: z.literal('recordDecision'), question: z.string(), answer: z.string(), decidedBy: z.string().optional() }),
  z.object({ action: z.literal('lookup'), question: z.string().trim().min(1).max(300) }),
]);
function fail(e: unknown) {
  if (e instanceof BusinessError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof z.ZodError || e instanceof SyntaxError) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  return NextResponse.json({ error: 'Chief of staff failed' }, { status: 500 });
}
export async function GET(req: Request) {
  try { memberRead(req, 'finance.read'); return NextResponse.json({ brief: brief(businessStore()) }); } catch (e) { return fail(e); }
}
export async function POST(req: Request) {
  try {
    businessAccess(req); const c = cmd.parse(await readJsonBounded(req)); const s = businessStore();
    if (c.action === 'lookup') return NextResponse.json({ matches: lookupDecision(s, c.question) });
    const { action: _a, ...d } = c; return NextResponse.json({ decision: recordDecision(s, d) });
  } catch (e) { return fail(e); }
}
