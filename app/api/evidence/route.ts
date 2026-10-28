import { memberRead } from '@/lib/metabos/member-read';
import { NextResponse } from 'next/server';
import { businessStore, BusinessError } from '@/lib/metabos/store';
import { businessAccess } from '@/lib/metabos/http';
import { annotate, evidenceCsv, EVIDENCE_EXPLANATION, filterEvidence } from '@/lib/metabos/evidence';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(req: Request) {
  try {
    memberRead(req, 'finance.read');
    const u = new URL(req.url); const p = (k: string) => u.searchParams.get(k);
    const all = annotate(businessStore().evidence());
    const rows = filterEvidence(all.rows, { actor: p('actor'), entity: p('entity'), action: p('action'), result: p('result'), from: p('from'), to: p('to'), q: p('q') }).reverse();
    if (p('format') === 'csv') return new NextResponse(evidenceCsv(rows), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="metabos-evidence.csv"', 'Cache-Control': 'no-store' } });
    if (p('format') === 'json') return new NextResponse(JSON.stringify({ exportedAt: new Date().toISOString(), chainValid: all.valid, headHash: all.headHash, rows }, null, 2), { headers: { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="metabos-evidence.json"', 'Cache-Control': 'no-store' } });
    return NextResponse.json({ total: all.rows.length, valid: all.valid, firstBrokenSeq: all.firstBrokenSeq, headHash: all.headHash, rows: rows.slice(0, 500), matched: rows.length,
      facets: { actors: [...new Set(all.rows.map((r) => r.actor))].sort(), entities: [...new Set(all.rows.map((r) => r.entity))].sort(), results: ['success', 'denied', 'failed'] }, explanation: EVIDENCE_EXPLANATION }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof BusinessError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: 'Evidence unavailable' }, { status: 500 });
  }
}
