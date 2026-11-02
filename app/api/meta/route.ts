import { readJsonBounded } from '@/lib/bounded-body';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { memberRead } from '@/lib/metabos/member-read';
import { BusinessError } from '@/lib/metabos/store';
import { requirePermission } from '@/lib/metabos/biz/accounts';
import { metaOverview, oauthStart, proposeLeadReply, saveTenant, updateLead } from '@/lib/metabos/meta/integration';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const err = (e: unknown) => e instanceof BusinessError ? NextResponse.json({ error: e.message }, { status: e.status }) : e instanceof z.ZodError ? NextResponse.json({ error: 'Invalid request', issues: e.issues.slice(0, 5).map((i) => `${i.path.join('.')} ${i.message}`) }, { status: 400 }) : NextResponse.json({ error: 'Server error' }, { status: 500 });
const Cmd = z.object({ action: z.enum(['saveTenant', 'updateLead', 'leadReply', 'oauthStart']), input: z.unknown() }).strict();
/** Meta integration status. GET is read-only for any member; values of env vars and tokens are never returned. */
export async function GET(req: Request) {
  try { const { s } = memberRead(req); return NextResponse.json(metaOverview(s, process.env), { headers: { 'Cache-Control': 'no-store' } }); } catch (e) { return err(e); }
}
export async function POST(req: Request) {
  try { const { s, me } = memberRead(req); const c = Cmd.parse(await readJsonBounded(req)); const who = String((me as { name?: string; id: string }).name ?? me.id);
    requirePermission(me, c.action === 'saveTenant' || c.action === 'oauthStart' ? 'members.manage' : 'jev.decide');
    if (c.action === 'saveTenant') return NextResponse.json(saveTenant(s, who, c.input));
    if (c.action === 'updateLead') return NextResponse.json(updateLead(s, who, c.input));
    if (c.action === 'oauthStart') { const i = z.object({ scopes: z.array(z.string().max(60)).max(20) }).strict().parse(c.input); return NextResponse.json(oauthStart(s, who, process.env, i.scopes)); }
    const i = z.object({ conversationId: z.string().max(80), body: z.string().max(4096) }).strict().parse(c.input);
    return NextResponse.json(proposeLeadReply(s, who, i.conversationId, i.body));
  } catch (e) { return err(e); }
}
