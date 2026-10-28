import { memberRead } from '@/lib/metabos/member-read';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { businessStore, BusinessError } from '@/lib/metabos/store';
import { businessAccess } from '@/lib/metabos/http';
import { describeWorkflow, WorkflowEngine, WORKFLOWS } from '@/lib/metabos/workflows';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const hash = z.string().regex(/^[0-9a-f]{64}$/); const id = z.string().uuid();
const command = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), workflowId: z.string(), input: z.unknown() }),
  z.object({ action: z.literal('approve'), id, hash }),
  z.object({ action: z.literal('execute'), id }),
  z.object({ action: z.literal('retry'), id }),
  z.object({ action: z.literal('cancel'), id }),
  z.object({ action: z.literal('requestTool'), id, tool: z.string().max(80), permissions: z.array(z.string().max(80)).max(10).optional() }),
]);
function failure(e: unknown) {
  if (e instanceof BusinessError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof z.ZodError || e instanceof SyntaxError) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  console.error('Workflow operation failed', e instanceof Error ? e.name : 'unknown');
  return NextResponse.json({ error: 'Workflow operation failed' }, { status: 500 });
}
function snapshot() {
  const store = businessStore(); const e = new WorkflowEngine(store);
  return { workflows: WORKFLOWS.map(describeWorkflow), runs: e.runs().map((r) => ({ ...r, steps: e.steps(r.id), events: e.events(r.id) })) };
}
export async function GET(req: Request) { try { memberRead(req, 'finance.read'); return NextResponse.json(snapshot(), { headers: { 'Cache-Control': 'no-store' } }); } catch (e) { return failure(e); } }
export async function POST(req: Request) {
  try {
    businessAccess(req);
    const raw = await req.text(); if (raw.length > 16_000) throw new BusinessError('Request too large', 413);
    const c = command.parse(JSON.parse(raw));
    const key = z.string().uuid().parse(req.headers.get('idempotency-key'));
    const store = businessStore(); const e = new WorkflowEngine(store);
    const result = store.command(key, c, () => {
      switch (c.action) {
        case 'start': return e.start(c.workflowId, c.input);
        case 'approve': return e.tryApprove(c.id, c.hash);
        case 'execute': return e.execute(c.id);
        case 'retry': return e.retry(c.id);
        case 'cancel': return e.cancel(c.id);
        // A model-originated request: permissions it names are reported back as ignored, never granted.
        case 'requestTool': return e.requestTool(c.id, { tool: c.tool, requestedBy: 'model', permissions: c.permissions });
      }
    });
    if (c.action === 'approve' && (result as { denied?: boolean }).denied) return NextResponse.json({ error: 'Approval does not match the planned payload; denial recorded' }, { status: 409 });
    return NextResponse.json(c.action === 'approve' ? (result as { run: unknown }).run : result);
  } catch (e) { return failure(e); }
}
