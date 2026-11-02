import { memberRead } from '@/lib/metabos/member-read';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { businessAccess } from '@/lib/metabos/http';
import { businessStore, BusinessError } from '@/lib/metabos/store';
import { getLayout, resetLayout, saveLayout } from '@/lib/metabos/mission-layout';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const Body = z.discriminatedUnion('action', [z.object({ action: z.literal('save'), widgets: z.array(z.string().max(32)).max(16) }), z.object({ action: z.literal('reset') })]);
const fail = (e: unknown) => e instanceof BusinessError ? NextResponse.json({ error: e.message }, { status: e.status }) : e instanceof z.ZodError || e instanceof SyntaxError ? NextResponse.json({ error: 'Invalid request' }, { status: 400 }) : NextResponse.json({ error: 'Layout operation failed' }, { status: 500 });
/** Saved Mission Control widget layout (order and visibility). */
export async function GET(req: Request) {
  try { memberRead(req); return NextResponse.json(getLayout(businessStore()), { headers: { 'Cache-Control': 'no-store' } }); } catch (e) { return fail(e); }
}
export async function POST(req: Request) {
  try {
    businessAccess(req);
    if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new BusinessError('JSON content type required', 415);
    const text = await req.text(); if (text.length > 2000) throw new BusinessError('Request too large', 413);
    const key = req.headers.get('idempotency-key'); if (!key || !/^[0-9a-f-]{36}$/i.test(key)) throw new BusinessError('Idempotency-Key header (UUID) required', 428);
    const body = Body.parse(JSON.parse(text)); const store = businessStore();
    return NextResponse.json(store.command(key, { layout: body }, () => body.action === 'save' ? saveLayout(store, body.widgets) : resetLayout(store)));
  } catch (e) { return fail(e); }
}
