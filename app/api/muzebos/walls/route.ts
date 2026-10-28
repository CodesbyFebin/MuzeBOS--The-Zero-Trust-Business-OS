import { memberRead } from '@/lib/muzebos/member-read';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { businessStore, BusinessError } from '@/lib/muzebos/store';
import { businessAccess } from '@/lib/muzebos/http';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
function fail(e: unknown) {
  if (e instanceof BusinessError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof z.ZodError || e instanceof SyntaxError) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  return NextResponse.json({ error: 'Request failed' }, { status: 500 });
}
import { readScope, wallMatrix } from '@/lib/muzebos/biz/departments';
export async function GET(req: Request) {
  try {
    memberRead(req, 'finance.read'); const u = new URL(req.url); const d = u.searchParams.get('department'); const sc = u.searchParams.get('scope');
    if (!d || !sc) return NextResponse.json({ walls: wallMatrix() });
    const rows = readScope(businessStore(), d, sc); return NextResponse.json({ department: d, scope: sc, count: rows.length, rows: rows.slice(0, 50) });
  } catch (e) { return fail(e); }
}
