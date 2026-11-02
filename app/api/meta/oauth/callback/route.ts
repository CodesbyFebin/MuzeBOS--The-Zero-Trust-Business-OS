import { NextResponse } from 'next/server';
import { businessStore, BusinessError } from '@/lib/metabos/store';
import { oauthCallback } from '@/lib/metabos/meta/integration';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/** Login with Facebook callback. The state row (10 min, single use) binds it to the member who started it. The token is sealed and never echoed. */
export async function GET(req: Request) {
  const u = new URL(req.url); const code = u.searchParams.get('code'); const state = u.searchParams.get('state');
  const back = (q: string) => NextResponse.redirect(new URL(`/workspace/developer/meta-integration?${q}`, u.origin));
  if (!code || !state) return back('oauth=denied');
  try { await oauthCallback(businessStore(), process.env, code, state); return back('oauth=stored'); }
  catch (e) { return back(`oauth=${encodeURIComponent(e instanceof BusinessError ? e.message.slice(0, 80) : 'error')}`); }
}
