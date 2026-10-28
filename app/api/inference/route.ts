import { memberRead } from '@/lib/muzebos/member-read';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { businessAccess } from '@/lib/muzebos/http';
import { businessStore, BusinessError } from '@/lib/muzebos/store';
import { InferenceStore } from '@/lib/muzebos/inference/store';
import { proposeInferenceAction } from '@/lib/muzebos/inference/jev-bridge';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const id = z.string().uuid();
const command = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), data: z.unknown() }).strict(),
  z.object({ action: z.literal('approve'), id, hash: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  z.object({ action: z.literal('cancel'), id }).strict(),
  z.object({ action: z.literal('proposeAction'), id }).strict(),
  z.object({ action: z.literal('delegate'), id, children: z.unknown() }).strict(),
  z.object({ action: z.literal('claimBrowser'), workerId: z.string().min(1).max(100) }).strict(),
  z.object({ action: z.literal('renewBrowser'), id, token: id }).strict(),
  z.object({ action: z.literal('completeBrowser'), id, token: id, output: z.string().max(100000), usage: z.unknown().optional() }).strict(),
  z.object({ action: z.literal('failBrowser'), id, token: id }).strict(),
]);
function failure(error: unknown) { return NextResponse.json({ error: error instanceof BusinessError ? error.message : error instanceof z.ZodError || error instanceof SyntaxError ? 'Invalid inference request' : 'Inference operation failed' }, { status: error instanceof BusinessError ? error.status : error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 500, headers: { 'Cache-Control': 'no-store' } }); }
export function GET(req: Request) {
  try { memberRead(req, 'finance.read'); return NextResponse.json(new InferenceStore(businessStore()).snapshot(), { headers: { 'Cache-Control': 'no-store' } }); } catch (e) { return failure(e); }
}
export async function POST(req: Request) {
  try {
    businessAccess(req);
    if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new BusinessError('JSON content type required', 415);
    const key = z.string().uuid().parse(req.headers.get('idempotency-key'));
    const reader = req.body?.getReader(); if (!reader) throw new BusinessError('Request body required');
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 128000) { await reader.cancel(); throw new BusinessError('Request too large', 413); } chunks.push(value); }
    const c = command.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    const business = businessStore(), store = new InferenceStore(business);
    const result = business.command(key, c, () => {
      if (c.action === 'create') return store.create(c.data);
      if (c.action === 'approve') return store.approve(c.id, c.hash);
      if (c.action === 'cancel') return store.cancel(c.id);
      if (c.action === 'proposeAction') return proposeInferenceAction(store, c.id);
      if (c.action === 'delegate') return store.delegate(c.id, c.children);
      if (c.action === 'claimBrowser') return store.claim(c.workerId, 'browser');
      if (store.task(c.id).payload.provider !== 'browser') throw new BusinessError('Browser cannot complete a server route', 403);
      if (c.action === 'renewBrowser') return store.renew(c.id, c.token);
      if (c.action === 'failBrowser') return store.fail(c.id, c.token);
      return store.complete(c.id, c.token, c.output, c.usage);
    });
    return NextResponse.json({ result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return failure(e); }
}
