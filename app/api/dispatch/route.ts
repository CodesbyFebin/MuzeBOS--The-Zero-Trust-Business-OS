import { NextResponse } from 'next/server';
import { z } from 'zod';
import { memberRead } from '@/lib/metabos/member-read';
import { BusinessError } from '@/lib/metabos/store';
import { decide, dispatch, listDispatches, propose, connection } from '@/lib/metabos/dispatch/service';
import { requirePermission } from '@/lib/metabos/biz/accounts';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const Channel = z.enum(['whatsapp', 'email', 'payment-link', 'completion']);
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('propose'), channel: Channel, payload: z.record(z.string(), z.unknown()) }).strict(),
  z.object({ action: z.literal('decide'), id: z.string().uuid(), payloadHash: z.string().regex(/^[0-9a-f]{64}$/), approve: z.boolean() }).strict(),
  z.object({ action: z.literal('dispatch'), id: z.string().uuid(), payloadHash: z.string().regex(/^[0-9a-f]{64}$/) }).strict(),
]);
function failure(e: unknown) {
  if (e instanceof BusinessError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof z.ZodError || e instanceof SyntaxError) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  console.error('Dispatch failed', e instanceof Error ? e.name : 'unknown');
  return NextResponse.json({ error: 'Dispatch failed' }, { status: 500 });
}
/** Outbound sends (WhatsApp, SMTP email, Razorpay payment link, OpenRouter completion) behind Jev approval. */
export async function GET(req: Request) {
  try { const { s } = memberRead(req, 'finance.read'); return NextResponse.json({ connection: connection(process.env), dispatches: listDispatches(s) }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (e) { return failure(e); }
}
export async function POST(req: Request) {
  try {
    const { s, me } = memberRead(req);
    if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new BusinessError('JSON content type required', 415);
    const text = await req.text(); if (text.length > 32_000) throw new BusinessError('Request too large', 413);
    const b = Body.parse(JSON.parse(text));
    if (b.action === 'propose') { requirePermission(me, 'expense.submit'); return NextResponse.json({ dispatch: propose(s, me.id, b.channel, b.payload) }); }
    requirePermission(me, 'jev.decide');
    if (b.action === 'decide') return NextResponse.json({ dispatch: decide(s, me.id, b.id, b.payloadHash, b.approve) });
    const key = req.headers.get('idempotency-key') ?? '';
    return NextResponse.json({ dispatch: await dispatch(s, b.id, b.payloadHash, key, { env: process.env, fetch: (u, i) => fetch(u, i) }) });
  } catch (e) { return failure(e); }
}
