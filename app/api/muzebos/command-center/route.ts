import { readJsonBounded } from '@/lib/bounded-body';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { businessStore, BusinessError } from '@/lib/muzebos/store';
import { businessAccess } from '@/lib/muzebos/http';
import { requireMember, requirePermission } from '@/lib/muzebos/biz/accounts';
import { commandCenter, addPromise, closePromise, submitProof, decideProof, approveBundle } from '@/lib/muzebos/command-center';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const id = z.string().uuid();
const cmd = z.discriminatedUnion('action', [
  z.object({ action: z.literal('promise.add'), promise: z.unknown() }),
  z.object({ action: z.literal('promise.close'), id, status: z.enum(['kept', 'dropped']) }),
  z.object({ action: z.literal('proof.submit'), proof: z.unknown() }),
  z.object({ action: z.literal('proof.accept'), id, invoiceId: id }),
  z.object({ action: z.literal('proof.reject'), id, reason: z.string().trim().min(1).max(200) }),
  z.object({ action: z.literal('bundle.approve'), workflowId: z.string().max(80), bundleHash: z.string().regex(/^[a-f0-9]{64}$/) }),
]);
export async function GET(req: Request) {
  try { businessAccess(req); return NextResponse.json(commandCenter(businessStore())); } catch (e) { return fail(e); }
}
export async function POST(req: Request) {
  try {
    businessAccess(req); const c = cmd.parse(await readJsonBounded(req)); const s = businessStore(); const me = requireMember(s, req);
    if (c.action === 'promise.add') { requirePermission(me, 'finance.read'); addPromise(s, c.promise); }
    else if (c.action === 'proof.submit') { requirePermission(me, 'finance.read'); submitProof(s, c.proof); }
    else if (c.action === 'promise.close') { requirePermission(me, 'finance.write'); closePromise(s, c.id, c.status); }
    else if (c.action === 'proof.accept') { requirePermission(me, 'finance.write'); decideProof(s, c.id, { accept: true, invoiceId: c.invoiceId }); }
    else if (c.action === 'proof.reject') { requirePermission(me, 'finance.write'); decideProof(s, c.id, { accept: false, reason: c.reason }); }
    else { requirePermission(me, 'jev.decide'); return NextResponse.json({ results: approveBundle(s, c.workflowId, c.bundleHash), ...commandCenter(s) }); }
    return NextResponse.json(commandCenter(s));
  } catch (e) { return fail(e); }
}
function fail(e: unknown) {
  if (e instanceof BusinessError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof z.ZodError || e instanceof SyntaxError) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  return NextResponse.json({ error: 'Request failed' }, { status: 500 });
}
