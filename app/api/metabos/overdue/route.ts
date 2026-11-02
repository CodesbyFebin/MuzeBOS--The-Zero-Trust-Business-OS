import { readJsonBounded } from '@/lib/bounded-body';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { businessStore, BusinessError } from '@/lib/metabos/store';
import { businessAccess } from '@/lib/metabos/http';
import { requireMember, requirePermission } from '@/lib/metabos/biz/accounts';
import { WorkflowEngine, OVERDUE_INVOICE_REMINDER } from '@/lib/metabos/workflows';
import { findOverdue, draftReminder, proposeReminder, dispatchOutbound, outbound, liveGate, termsDays, setTermsDays, senderConnectedFromEnv, DRAFT_LIMITS, spendLimits, setSpendLimits, spendLimitsSchema } from '@/lib/metabos/overdue';
import { sendEmailReply } from '@/lib/connectors/email';
import { runtimeEnv } from '@/lib/creds';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
function fail(e: unknown) {
  if (e instanceof BusinessError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof z.ZodError || e instanceof SyntaxError) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  return NextResponse.json({ error: 'Request failed' }, { status: 500 });
}
const id = z.string().uuid();
const cmd = z.discriminatedUnion('action', [
  z.object({ action: z.literal('draft'), invoiceId: id }),
  z.object({ action: z.literal('propose'), invoiceId: id, subject: z.string().max(200), body: z.string().max(2000), mode: z.enum(['live', 'fixture']), model: z.string().max(120).nullable() }),
  z.object({ action: z.literal('approve'), runId: id, hash: z.string().regex(/^[a-f0-9]{64}$/) }),
  z.object({ action: z.literal('reject'), runId: id }),
  z.object({ action: z.literal('limits'), limits: spendLimitsSchema }),
  z.object({ action: z.literal('terms'), days: z.number().int().min(0).max(365) }),
]);
const engineFor = (s: ReturnType<typeof businessStore>) => new WorkflowEngine(s, { senderConnected: () => senderConnectedFromEnv(runtimeEnv()) });
const view = (s: ReturnType<typeof businessStore>) => {
  const e = engineFor(s); const env = runtimeEnv();
  return {
    findings: findOverdue(s), terms: termsDays(s), liveGate: liveGate(s, env), limits: { ...DRAFT_LIMITS, ...spendLimits(s) },
    senderConnected: senderConnectedFromEnv(env),
    runs: e.runs(100).filter((r) => r.workflowId === OVERDUE_INVOICE_REMINDER.id).map((r) => ({ ...r, steps: e.steps(r.id) })),
    outbound: outbound(s).map(({ body: _b, ...m }) => m),
  };
};
export async function GET(req: Request) {
  try { businessAccess(req); const s = businessStore(); requirePermission(requireMember(s, req), 'finance.read'); return NextResponse.json(view(s)); } catch (e) { return fail(e); }
}
export async function POST(req: Request) {
  try {
    businessAccess(req); const c = cmd.parse(await readJsonBounded(req)); const s = businessStore(); const me = requireMember(s, req); requirePermission(me, 'finance.read');
    if (c.action === 'draft') return NextResponse.json({ draft: await draftReminder(s, c.invoiceId, { env: runtimeEnv() }) });
    if (c.action === 'propose') return NextResponse.json({ run: proposeReminder(s, c, Date.now(), engineFor(s)) });
    if (c.action === 'limits') { requirePermission(me, 'finance.write'); setSpendLimits(s, me.id, c.limits); return NextResponse.json(view(s)); }
    requirePermission(me, 'jev.decide');
    if (c.action === 'terms') { setTermsDays(s, c.days); return NextResponse.json(view(s)); }
    const e = engineFor(s);
    if (e.run(c.runId).workflowId !== OVERDUE_INVOICE_REMINDER.id) throw new BusinessError('Not an overdue reminder run', 409);
    if (c.action === 'reject') return NextResponse.json({ run: e.cancel(c.runId) });
    const { run: approved, denied } = e.tryApprove(c.runId, c.hash);
    if (denied) throw new BusinessError('Approval hash does not match the current draft', 409);
    if (approved.status !== 'running') return NextResponse.json({ run: approved });
    const done = e.execute(c.runId);
    const dispatched = await dispatchOutbound(s, (m) => sendEmailReply({ to: m.to, subject: m.subject, text: m.text }, runtimeEnv()));
    return NextResponse.json({ run: done, steps: e.steps(c.runId), dispatched });
  } catch (e) { return fail(e); }
}
