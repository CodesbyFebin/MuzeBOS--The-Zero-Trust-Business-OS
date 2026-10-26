import { NextResponse } from 'next/server';
import { z } from 'zod';
import { businessStore, BusinessError } from '@/lib/muzebos/store';
import { businessAccess } from '@/lib/muzebos/http';
import { perform, view } from '@/lib/muzebos/modules/engine';
import { moduleById } from '@/lib/muzebos/modules';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
function failure(error: unknown) {
  if (error instanceof BusinessError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  console.error('Module operation failed', error instanceof Error ? error.name : 'unknown');
  return NextResponse.json({ error: 'Module operation failed' }, { status: 500 });
}
/** Declarative workspace module records: list with computed fields, or create/update/transition. */
export async function GET(req: Request, { params }: { params: { module: string } }) {
  try {
    businessAccess(req);
    if (!moduleById(params.module)) throw new BusinessError('Unknown module', 404);
    return NextResponse.json(view(businessStore(), params.module), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return failure(e); }
}
export async function POST(req: Request, { params }: { params: { module: string } }) {
  try {
    businessAccess(req);
    if (!moduleById(params.module)) throw new BusinessError('Unknown module', 404);
    if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new BusinessError('JSON content type required', 415);
    const text = await req.text();
    if (text.length > 64_000) throw new BusinessError('Request too large', 413);
    const key = req.headers.get('idempotency-key');
    if (!key || !/^[0-9a-f-]{36}$/i.test(key)) throw new BusinessError('Idempotency-Key header (UUID) required', 428);
    const body = JSON.parse(text);
    const store = businessStore();
    const record = store.command(key, { module: params.module, body }, () => perform(store, params.module, body));
    return NextResponse.json({ record });
  } catch (e) { return failure(e); }
}
