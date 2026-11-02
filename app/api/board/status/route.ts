import { NextResponse } from 'next/server';
import { BusinessError } from '@/lib/metabos/store';
import { memberRead } from '@/lib/metabos/member-read';
import { boardStatus, CACHE_MS } from '@/lib/metabos/board/registry';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/** Live health of every board tile. Each check is cached for CACHE_MS; no secrets are returned. */
export async function GET(req: Request) {
  try { const { s } = memberRead(req); return NextResponse.json({ tiles: await boardStatus(s), cacheMs: CACHE_MS, at: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (e) { return e instanceof BusinessError ? NextResponse.json({ error: e.message }, { status: e.status }) : NextResponse.json({ error: 'Server error' }, { status: 500 }); }
}
