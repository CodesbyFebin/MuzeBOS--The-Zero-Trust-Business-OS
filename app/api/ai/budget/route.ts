import { NextResponse } from 'next/server';
import { z } from 'zod';
import { memberRead } from '@/lib/metabos/member-read';
import { businessStore, BusinessError } from '@/lib/metabos/store';
import { businessAccess } from '@/lib/metabos/http';
import { requireMember } from '@/lib/metabos/biz/accounts';
import { metaBudget, setMetaCap } from '@/lib/metabos/ai/meta-budget';
import { cacheStats, TASK_POLICY } from '@/lib/metabos/ai/token-saver';
import { HIGH_EFFORT_KEY, highEffortAllowed, CONTRIBUTOR_DISCLOSURE, MODEL_MODES, modelMode, setModelMode } from '@/lib/metabos/ai/meta-call';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const command = z.discriminatedUnion('action', [
  z.object({ action: z.literal('cap'), capMinor: z.number().int().min(0).max(1_000_000) }).strict(),
  z.object({ action: z.literal('mode'), mode: z.enum(['contributor', 'standard']) }).strict(),
  z.object({ action: z.literal('highEffort'), enabled: z.boolean() }).strict(),
]);
const no = { 'Cache-Control': 'no-store' };
function failure(e: unknown) {
  if (e instanceof BusinessError) return NextResponse.json({ error: e.message }, { status: e.status, headers: no });
  if (e instanceof z.ZodError || e instanceof SyntaxError) return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: no });
  return NextResponse.json({ error: 'Budget request failed' }, { status: 500, headers: no });
}
function snapshot(s = businessStore(), role: string) {
  const mode = modelMode(s);
  return { ...metaBudget(s), cache: cacheStats(s), mode, modes: MODEL_MODES, disclosure: CONTRIBUTOR_DISCLOSURE, highEffort: highEffortAllowed(s), policy: TASK_POLICY, canEdit: role === 'owner' };
}
export function GET(req: Request) {
  try { const { s, me } = memberRead(req, 'finance.read'); return NextResponse.json(snapshot(s, me.role), { headers: no }); } catch (e) { return failure(e); }
}
export async function POST(req: Request) {
  try {
    businessAccess(req);
    if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new BusinessError('JSON content type required', 415);
    const text = await req.text(); if (text.length > 2000) throw new BusinessError('Request too large', 413);
    const c = command.parse(JSON.parse(text));
    const s = businessStore(); const me = requireMember(s, req);
    const actor = { id: me.id, role: me.role };
    if (c.action === 'cap') setMetaCap(s, actor, c.capMinor);
    else if (c.action === 'mode') setModelMode(s, actor, c.mode);
    else {
      if (me.role !== 'owner') throw new BusinessError('Only the owner can allow high reasoning effort', 403);
      s.transact(() => { s.db.prepare('INSERT INTO mb_settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(HIGH_EFFORT_KEY, c.enabled ? '1' : '0'); s.appendEvidence('meta.highEffort', me.id, `High reasoning effort ${c.enabled ? 'allowed' : 'off'} for deep tasks`); });
    }
    return NextResponse.json(snapshot(s, me.role), { headers: no });
  } catch (e) { return failure(e); }
}
