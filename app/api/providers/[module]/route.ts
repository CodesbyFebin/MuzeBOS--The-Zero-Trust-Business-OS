import { NextResponse } from 'next/server';
import { z } from 'zod';
import { businessStore, BusinessError } from '@/lib/muzebos/store';
import { businessAccess } from '@/lib/muzebos/http';
import { providerConfig, setRef, testConnection } from '@/lib/muzebos/providers';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const Body = z.discriminatedUnion('action', [z.object({ action: z.literal('setRef'), field: z.string().max(64), ref: z.string().max(64) }), z.object({ action: z.literal('test') })]);
function failure(error: unknown) {
  if (error instanceof BusinessError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  console.error('Provider operation failed', error instanceof Error ? error.name : 'unknown');
  return NextResponse.json({ error: 'Provider operation failed' }, { status: 500 });
}
/** Provider configuration: env-var references and whether each is set. Values are never returned. */
export async function GET(req: Request, { params }: { params: { module: string } }) {
  try { businessAccess(req); return NextResponse.json(providerConfig(businessStore(), params.module), { headers: { 'Cache-Control': 'no-store' } }); } catch (e) { return failure(e); }
}
export async function POST(req: Request, { params }: { params: { module: string } }) {
  try {
    businessAccess(req);
    if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new BusinessError('JSON content type required', 415);
    const text = await req.text();
    if (text.length > 4_000) throw new BusinessError('Request too large', 413);
    const key = req.headers.get('idempotency-key');
    if (!key || !/^[0-9a-f-]{36}$/i.test(key)) throw new BusinessError('Idempotency-Key header (UUID) required', 428);
    const body = Body.parse(JSON.parse(text));
    const store = businessStore();
    providerConfig(store, params.module);
    if (body.action === 'setRef') return NextResponse.json({ config: store.command(key, { provider: params.module, body }, () => setRef(store, params.module, body.field, body.ref)) });
    const result = await testConnection(store, params.module);
    return NextResponse.json({ result, config: providerConfig(store, params.module) });
  } catch (e) { return failure(e); }
}
