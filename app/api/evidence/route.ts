import { memberRead } from '@/lib/metabos/member-read';
import { NextResponse } from 'next/server';
import { businessStore, BusinessError } from '@/lib/metabos/store';
import { businessAccess } from '@/lib/metabos/http';
import { annotate, evidenceCsv, EVIDENCE_EXPLANATION, filterEvidence } from '@/lib/metabos/evidence';
import { evidenceBundle, evidenceProof, MAX_EVIDENCE_RECORDS } from '@/lib/metabos/evidence-bundle';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(req: Request) {
  try {
    memberRead(req, 'finance.read');
    const u = new URL(req.url); const p = (k: string) => u.searchParams.get(k);
    if (p('format') === 'bundle' || p('format') === 'proof') {
      const records = businessStore().db.prepare('SELECT * FROM mb_audit ORDER BY seq LIMIT ?').all(MAX_EVIDENCE_RECORDS + 1);
      if (records.length > MAX_EVIDENCE_RECORDS) throw new BusinessError('Evidence exceeds the 50,000-event export limit', 413);
      let result;
      try {
        if (p('format') === 'proof') {
          if (!/^[1-9][0-9]{0,14}$/.test(p('seq') || '')) throw new BusinessError('Provide a positive event sequence');
          const seq = Number(p('seq'));
          if (!records.some(r => (r as { seq: number }).seq === seq)) throw new BusinessError('Evidence event not found', 404);
          result = evidenceProof(records, seq);
        } else result = evidenceBundle(records);
      } catch (e) {
        if (e instanceof BusinessError) throw e;
        throw new BusinessError('Cannot export invalid or oversized evidence', 422);
      }
      return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': `attachment; filename="metabos-evidence-${p('format')}.json"` } });
    }
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
