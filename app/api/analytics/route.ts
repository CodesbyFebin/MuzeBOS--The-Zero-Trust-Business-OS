import { memberRead } from '@/lib/muzebos/member-read';
import { NextResponse } from 'next/server';
import { businessAccess } from '@/lib/muzebos/http';
import { businessStore, BusinessError } from '@/lib/muzebos/store';
import { analyticsCsv, computeAnalytics, parseRange } from '@/lib/muzebos/analytics';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(req: Request) {
  try {
    memberRead(req, 'finance.read');
    const q = new URL(req.url).searchParams;
    const tzRaw = Number(q.get('tz')); const tz = Number.isInteger(tzRaw) && Math.abs(tzRaw) <= 840 ? tzRaw : 0;
    let range; try { range = parseRange(q.get('from'), q.get('to')); } catch (e) { throw new BusinessError(e instanceof Error ? e.message : 'Invalid range'); }
    const store = businessStore(); const invoices = store.invoices(); const orders = store.orders();
    if (q.get('format') === 'csv') return new NextResponse(analyticsCsv(invoices, orders, range, tz), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="muzebos-invoices-${range.from ?? 'all'}-${range.to ?? 'now'}.csv"`, 'Cache-Control': 'no-store' } });
    return NextResponse.json(computeAnalytics(invoices, orders, range, tz), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof BusinessError ? e.message : 'Analytics unavailable' }, { status: e instanceof BusinessError ? e.status : 503 });
  }
}
