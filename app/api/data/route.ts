import { NextResponse } from 'next/server';
import { z } from 'zod';
import { memberRead } from '@/lib/metabos/member-read';
import { BusinessError } from '@/lib/metabos/store';
import { can, requirePermission } from '@/lib/metabos/biz/accounts';
import { ask, exportSubject, INTENTS, privacyLog, redactSubject, runSelect, salesGoals, setSalesGoal } from '@/lib/metabos/data/service';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const cid = z.string().min(1).max(80);
const addrs = z.array(z.string().trim().min(3).max(200)).max(10).default([]);
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('ask'), question: z.string().trim().min(2).max(300) }).strict(),
  z.object({ action: z.literal('select'), sql: z.string().trim().min(6).max(2000) }).strict(),
  z.object({ action: z.literal('goal'), period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), targetMinor: z.number().int().min(0).max(1e13) }).strict(),
  z.object({ action: z.literal('export'), customerId: cid, addresses: addrs }).strict(),
  z.object({ action: z.literal('redact'), customerId: cid, confirm: z.string().min(1).max(200), addresses: addrs }).strict(),
]);
function failure(e: unknown) {
  if (e instanceof BusinessError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof z.ZodError || e instanceof SyntaxError) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  if (e instanceof Error && /SQLITE|no such|syntax/i.test(e.message)) return NextResponse.json({ error: `Query error: ${e.message.slice(0, 200)}` }, { status: 422 });
  console.error('Data failed', e instanceof Error ? e.name : 'unknown');
  return NextResponse.json({ error: 'Data action failed' }, { status: 500 });
}
/** Ask your data (read-only), DPDP export/redact, sales goals vs actuals. */
export async function GET(req: Request) {
  try {
    const { s, me } = memberRead(req);
    return NextResponse.json({ intents: INTENTS.map((i) => ({ id: i.id, label: i.label })), goals: can(me, 'finance.read') ? salesGoals(s) : null, privacy: can(me, 'members.manage') ? privacyLog(s) : null, customers: can(me, 'members.manage') ? s.customers() : null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return failure(e); }
}
export async function POST(req: Request) {
  try {
    const { s, me } = memberRead(req);
    if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new BusinessError('JSON content type required', 415);
    const text = await req.text(); if (text.length > 8000) throw new BusinessError('Request too large', 413);
    const b = Body.parse(JSON.parse(text));
    switch (b.action) {
      case 'ask': requirePermission(me, 'finance.read'); return NextResponse.json({ answer: ask(s, b.question) });
      case 'select': requirePermission(me, 'members.manage'); return NextResponse.json({ answer: runSelect(s, b.sql) });
      case 'goal': requirePermission(me, 'finance.write'); setSalesGoal(s, me.id, b.period, b.targetMinor); return NextResponse.json({ goals: salesGoals(s) });
      case 'export': requirePermission(me, 'members.manage'); return NextResponse.json({ bundle: exportSubject(s, me.id, b.customerId, b.addresses) }, { headers: { 'Content-Disposition': `attachment; filename="dpdp-export-${b.customerId.slice(0, 8)}.json"` } });
      case 'redact': requirePermission(me, 'members.manage'); return NextResponse.json(redactSubject(s, me.id, b.customerId, b.confirm, b.addresses));
    }
  } catch (e) { return failure(e); }
}
