import { readJsonBounded } from '@/lib/bounded-body';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { memberRead } from '@/lib/metabos/member-read';
import { BusinessError } from '@/lib/metabos/store';
import { requirePermission } from '@/lib/metabos/biz/accounts';
import { hubView } from '@/lib/metabos/hub/agent-hub';
import { addRule, adWizard, approveReply, AV_ROLES, createWorkspace, evaluateRules, gitOp, home, markProduct, overview, proposeIntent, search } from '@/lib/metabos/agentverse/core';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const err = (e: unknown) => e instanceof BusinessError ? NextResponse.json({ error: e.message }, { status: e.status }) : e instanceof z.ZodError ? NextResponse.json({ error: 'Invalid request', issues: e.issues.slice(0, 5).map((i) => `${i.path.join('.')} ${i.message}`) }, { status: 400 }) : NextResponse.json({ error: 'Server error' }, { status: 500 });
const Cmd = z.object({ action: z.enum(['createWorkspace', 'approveReply', 'adWizard', 'addRule', 'evaluateRules', 'gitOp', 'proposeIntent', 'markProduct']), input: z.unknown() }).strict();

/** AgentVerse OS V3. GET is a read for any member (Viewer). Writes need Agent (jev.decide) or Admin (members.manage) and only create drafts or Jev items. */
export async function GET(req: Request) {
  try { const { s, me } = memberRead(req); const q = new URL(req.url).searchParams.get('q');
    const role = AV_ROLES[(me as { role: keyof typeof AV_ROLES }).role] ?? 'Viewer';
    if (q !== null) return NextResponse.json({ results: search(s, q.slice(0, 200), hubView(s).servers.map((x) => x.name)) }, { headers: { 'Cache-Control': 'no-store' } });
    return NextResponse.json({ role, ...overview(s, process.env, hubView(s).servers), home: await home(s, process.env) }, { headers: { 'Cache-Control': 'no-store' } }); } catch (e) { return err(e); }
}
export async function POST(req: Request) {
  try { const { s, me } = memberRead(req); const c = Cmd.parse(await readJsonBounded(req)); const who = String((me as { name?: string; id: string }).name ?? me.id);
    requirePermission(me, c.action === 'createWorkspace' ? 'members.manage' : 'jev.decide');
    const r = c.action === 'createWorkspace' ? createWorkspace(s, who, c.input) : c.action === 'approveReply' ? approveReply(s, who, c.input) : c.action === 'adWizard' ? adWizard(s, who, c.input) : c.action === 'addRule' ? addRule(s, who, c.input) : c.action === 'evaluateRules' ? evaluateRules(s) : c.action === 'proposeIntent' ? proposeIntent(s, who, c.input) : c.action === 'markProduct' ? markProduct(s, who, c.input) : gitOp(s, who, c.input);
    return NextResponse.json(r); } catch (e) { return err(e); }
}
