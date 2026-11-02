import { NextResponse } from 'next/server';
import { z } from 'zod';
import { memberRead } from '@/lib/metabos/member-read';
import { BusinessError } from '@/lib/metabos/store';
import { authenticationOptions, listPasskeys, registrationOptions, removePasskey, verifyAuthentication, verifyRegistration } from '@/lib/metabos/passkeys';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('register-options') }).strict(),
  z.object({ action: z.literal('register-verify'), response: z.record(z.string(), z.unknown()) }).strict(),
  z.object({ action: z.literal('auth-options') }).strict(),
  z.object({ action: z.literal('auth-verify'), response: z.record(z.string(), z.unknown()) }).strict(),
  z.object({ action: z.literal('remove'), id: z.string().min(1).max(512) }).strict(),
]);
function failure(e: unknown) {
  if (e instanceof BusinessError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof z.ZodError || e instanceof SyntaxError) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  return NextResponse.json({ error: 'Passkey operation failed' }, { status: 500 });
}
/** WebAuthn passkeys for the signed-in member: register, verify (step-up), list, remove. */
export async function GET(req: Request) {
  try { const { s, me } = memberRead(req); return NextResponse.json({ passkeys: listPasskeys(s, me.id), configured: !!(process.env.MUZEBOS_WEBAUTHN_RP_ID && process.env.MUZEBOS_WEBAUTHN_ORIGIN) }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (e) { return failure(e); }
}
export async function POST(req: Request) {
  try {
    const { s, me } = memberRead(req);
    if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new BusinessError('JSON content type required', 415);
    const text = await req.text(); if (text.length > 32_000) throw new BusinessError('Request too large', 413);
    const b = Body.parse(JSON.parse(text));
    switch (b.action) {
      case 'register-options': return NextResponse.json(await registrationOptions(s, me));
      case 'register-verify': return NextResponse.json({ passkey: await verifyRegistration(s, me.id, b.response) });
      case 'auth-options': return NextResponse.json(await authenticationOptions(s, me.id));
      case 'auth-verify': return NextResponse.json(await verifyAuthentication(s, me.id, b.response as { id?: string }));
      case 'remove': removePasskey(s, me.id, b.id); return NextResponse.json({ ok: true });
    }
  } catch (e) { return failure(e); }
}
