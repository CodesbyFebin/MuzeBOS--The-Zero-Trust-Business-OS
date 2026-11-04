import { NextResponse } from 'next/server';
import { BusinessError } from '@/lib/metabos/store';
import { memberRead } from '@/lib/metabos/member-read';
import { home } from '@/lib/metabos/home';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/** Read-only summary for the MuZe home page. Member-only. */
export async function GET(req: Request) {
  try { const { s } = memberRead(req); return NextResponse.json(home(s, process.env), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (e) { return e instanceof BusinessError ? NextResponse.json({ error: e.message }, { status: e.status }) : NextResponse.json({ error: 'Server error' }, { status: 500 }); }
}
