import { NextResponse } from 'next/server';
import { businessStore, BusinessError } from '@/lib/muzebos/store';
import { businessAccess } from '@/lib/muzebos/http';
import { infraReport } from '@/lib/muzebos/infra';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/** Live measurements for an infra page (process, DB, filesystem). Read-only. */
export async function GET(req: Request, { params }: { params: { page: string } }) {
  try {
    businessAccess(req);
    const r = infraReport(businessStore(), params.page);
    if (!r) throw new BusinessError('Unknown infra page', 404);
    return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof BusinessError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('Infra measurement failed', e instanceof Error ? e.name : 'unknown');
    return NextResponse.json({ error: 'Measurement failed' }, { status: 500 });
  }
}
