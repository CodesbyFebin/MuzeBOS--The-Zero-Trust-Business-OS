import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBounded } from '@/lib/bounded-body';
import { BusinessError, businessStore } from '@/lib/metabos/store';
import { checkSecret, proposeFromRakazo } from '@/lib/metabos/runtime/proposals';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/** Rakazo bots propose sends here (shared-secret header). Creates a pending two-reviewer dispatch; never sends. */
export async function POST(req: Request) {
  try { checkSecret(process.env, req.headers.get('x-muzebos-runtime-secret')); return NextResponse.json(proposeFromRakazo(businessStore(), await readJsonBounded(req)), { status: 202 }); }
  catch (e) { return e instanceof BusinessError ? NextResponse.json({ error: e.message }, { status: e.status }) : e instanceof z.ZodError ? NextResponse.json({ error: 'Invalid proposal' }, { status: 422 }) : NextResponse.json({ error: 'Server error' }, { status: 500 }); }
}
