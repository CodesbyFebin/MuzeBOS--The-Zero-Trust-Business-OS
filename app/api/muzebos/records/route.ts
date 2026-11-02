import { readJsonBounded } from '@/lib/bounded-body';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { businessStore, BusinessError } from '@/lib/muzebos/store';
import { businessAccess } from '@/lib/muzebos/http';
import { requireMember, requirePermission } from '@/lib/muzebos/biz/accounts';
import { invoiceQrSvg, stockLedger, taxCsv, evidenceExport, backupAndVerify } from '@/lib/muzebos/records';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const cmd = z.discriminatedUnion('action', [
  z.object({ action: z.literal('qr'), invoiceId: z.string().uuid() }),
  z.object({ action: z.literal('stock-ledger') }),
  z.object({ action: z.literal('tax-csv') }),
  z.object({ action: z.literal('evidence') }),
  z.object({ action: z.literal('backup') }),
]);
/** POST only: every record export requires a signed-in member with the right permission. */
export async function POST(req: Request) {
  try {
    businessAccess(req); const c = cmd.parse(await readJsonBounded(req)); const s = businessStore(); const me = requireMember(s, req);
    if (c.action === 'backup') { requirePermission(me, 'members.manage'); return NextResponse.json(await backupAndVerify(s)); }
    requirePermission(me, 'finance.read');
    if (c.action === 'qr') return NextResponse.json(await invoiceQrSvg(s, c.invoiceId));
    if (c.action === 'stock-ledger') return NextResponse.json({ products: stockLedger(s) });
    if (c.action === 'tax-csv') return new NextResponse(taxCsv(s), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="tax-register.csv"' } });
    return NextResponse.json(evidenceExport(s));
  } catch (e) {
    if (e instanceof BusinessError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError || e instanceof SyntaxError) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    return NextResponse.json({ error: 'Request failed' }, { status: 500 });
  }
}
