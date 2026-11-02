import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBounded } from '@/lib/bounded-body';
import { BusinessError } from '@/lib/metabos/store';
import { memberRead } from '@/lib/metabos/member-read';
import { requirePermission } from '@/lib/metabos/biz/accounts';
import { hq, office, pipeline, sanctumReceipts, trustStack } from '@/lib/metabos/bos/core';
import { discord, operator, review } from '@/lib/metabos/bos/operator';
import { liveActivity } from '@/lib/metabos/agentverse/core';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const err = (e: unknown) => e instanceof BusinessError ? NextResponse.json({ error: e.message }, { status: e.status }) : e instanceof z.ZodError ? NextResponse.json({ error: 'Invalid request' }, { status: 400 }) : NextResponse.json({ error: 'Server error' }, { status: 500 });
/** Business Open Server read model. Plans go through /api/ai, sends through /api/dispatch; the only write here is a Jev review. */
export async function GET(req: Request) {
  try { const { s } = memberRead(req);
    return NextResponse.json({ office: office(s), sanctum: sanctumReceipts(s, process.env), trust: trustStack(s, process.env), pipeline: pipeline(s), hq: hq(s), activity: liveActivity(s, 30), operator: operator(s, process.env), discord: discord(s) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return err(e); }
}
export async function POST(req: Request) {
  try { const { s, me } = memberRead(req); requirePermission(me, 'jev.decide'); const b = z.object({ action: z.literal('review'), input: z.unknown() }).strict().parse(await readJsonBounded(req));
    return NextResponse.json(review(s, String((me as { email?: string; id: string }).email ?? me.id), b.input)); } catch (e) { return err(e); }
}
