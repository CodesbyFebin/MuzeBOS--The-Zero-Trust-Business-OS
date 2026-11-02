import { readJsonBounded } from '@/lib/bounded-body';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { memberRead } from '@/lib/metabos/member-read';
import { BusinessError } from '@/lib/metabos/store';
import { swarmNames, swarmTree, type AgentCard } from '@/lib/metabos/b3/swarms';
import { clawStatus, intakeDraft, listDrafts, runOnClaw, runOnYao, yaoStatus } from '@/lib/metabos/b3/agent-run';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;
const q = z.object({ tier: z.enum(['lead', 'pm', 'worker']).optional(), risk: z.enum(['low', 'medium', 'high']).optional(), jev: z.enum(['yes', 'no']).optional(), swarm: z.string().max(80).optional(), q: z.string().max(80).optional() });
const run = z.object({ cardId: z.string().regex(/^S\d{2}-[A-Z0-9-]+$/).max(20), task: z.string().trim().min(3).max(2000), target: z.enum(['yao', 'claw-local']) }).strict();
const err = (e: unknown) => e instanceof BusinessError ? NextResponse.json({ error: e.message }, { status: e.status }) : e instanceof z.ZodError ? NextResponse.json({ error: 'Invalid request' }, { status: 400 }) : NextResponse.json({ error: 'Swarms unavailable' }, { status: 503 });
export async function GET(req: Request) {
  try { const { s } = memberRead(req); const p = q.parse(Object.fromEntries(new URL(req.url).searchParams));
    return NextResponse.json({ ...swarmTree(s, { tier: p.tier, risk: p.risk, swarm: p.swarm, q: p.q, jev: p.jev === undefined ? undefined : p.jev === 'yes' }), swarmList: swarmNames(s), yao: yaoStatus(), claw: clawStatus(), drafts: listDrafts(s, 20) }); } catch (e) { return err(e); }
}
export async function POST(req: Request) {
  try { const { s } = memberRead(req, 'jev.decide'); const b = run.parse(await readJsonBounded(req));
    const card = (swarmTree(s, {}).swarms.flatMap((w) => w.subclusters.flatMap((c) => c.agents)) as AgentCard[]).find((a) => a.id === b.cardId);
    if (!card) throw new BusinessError('Agent card not found', 404);
    const d = b.target === 'yao' ? await runOnYao(card, b.task) : await runOnClaw(card, b.task);
    return NextResponse.json(await intakeDraft(s, card, b.target, b.task, d));
  } catch (e) { return err(e); }
}
