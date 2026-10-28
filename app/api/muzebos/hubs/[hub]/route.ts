import { NextResponse } from 'next/server';
import { BusinessError } from '@/lib/muzebos/store';
import { memberRead } from '@/lib/muzebos/member-read';
import { HUBS, hubView, type Hub } from '@/lib/muzebos/hubs';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(req: Request, ctx: { params: Promise<{ hub: string }> }) {
  try {
    const { s } = memberRead(req, 'finance.read');
    const { hub } = await ctx.params;
    if (!(HUBS as readonly string[]).includes(hub)) return NextResponse.json({ error: 'Unknown hub' }, { status: 404 });
    return NextResponse.json(hubView(s, hub as Hub), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof BusinessError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: 'Hub request failed' }, { status: 500 });
  }
}
