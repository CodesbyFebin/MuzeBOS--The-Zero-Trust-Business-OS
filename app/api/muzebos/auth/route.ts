import { NextResponse } from 'next/server';
import { z } from 'zod';
import { businessStore, BusinessError } from '@/lib/muzebos/store';
import { businessAccess } from '@/lib/muzebos/http';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
function fail(e: unknown) {
  if (e instanceof BusinessError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof z.ZodError || e instanceof SyntaxError) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  return NextResponse.json({ error: 'Request failed' }, { status: 500 });
}
import { setupWorkspace, signIn, signOut, requestMagicLink, redeemMagicLink, invite, setOwnPassword, currentMember, requireMember, workspace, setupNeeded, directory, outbox, can, tokenFrom, cookieHeader, clearCookie, ROLE_PERMISSIONS } from '@/lib/muzebos/biz/accounts';
const cmd = z.discriminatedUnion('action', [
  z.object({ action: z.literal('setup'), setup: z.unknown() }),
  z.object({ action: z.literal('signIn'), credentials: z.unknown() }),
  z.object({ action: z.literal('signOut') }),
  z.object({ action: z.literal('requestLink'), email: z.unknown() }),
  z.object({ action: z.literal('redeem'), link: z.string().min(10).max(200) }),
  z.object({ action: z.literal('invite'), member: z.unknown() }),
  z.object({ action: z.literal('setPassword'), password: z.unknown() }),
]);
const origin = (req: Request) => process.env.MUZEBOS_ORIGIN || new URL(req.url).origin;
const withSession = (body: object, token: string, req: Request) => { const r = NextResponse.json(body); r.headers.append('set-cookie', cookieHeader(token, new URL(req.url).protocol === 'https:')); return r; };
export async function GET(req: Request) {
  try {
    businessAccess(req); const s = businessStore(); const me = currentMember(s, req);
    return NextResponse.json({ me, workspace: workspace(s), setupNeeded: setupNeeded(s), roles: ROLE_PERMISSIONS, people: me ? directory(s) : [], outbox: me && can(me, 'members.manage') ? outbox(s) : [] });
  } catch (e) { return fail(e); }
}
export async function POST(req: Request) {
  try {
    businessAccess(req); const c = cmd.parse(await req.json()); const s = businessStore();
    if (c.action === 'setup') return withSession({ ok: true }, setupWorkspace(s, c.setup).token, req);
    if (c.action === 'signIn') return withSession({ ok: true }, signIn(s, c.credentials).token, req);
    if (c.action === 'redeem') return withSession({ ok: true }, redeemMagicLink(s, c.link).token, req);
    if (c.action === 'requestLink') return NextResponse.json(requestMagicLink(s, { email: c.email }, origin(req)));
    if (c.action === 'signOut') { signOut(s, tokenFrom(req)); const r = NextResponse.json({ ok: true }); r.headers.append('set-cookie', clearCookie); return r; }
    const me = requireMember(s, req);
    if (c.action === 'invite') return NextResponse.json({ member: invite(s, me, c.member, origin(req)) });
    setOwnPassword(s, me, { password: c.password }); return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}
