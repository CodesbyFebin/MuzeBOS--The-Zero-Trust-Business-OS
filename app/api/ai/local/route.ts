import { NextResponse } from 'next/server';
import { memberRead } from '@/lib/metabos/member-read';
import { localStatus, guardUrl, localUrl } from '@/lib/metabos/ai/local-llm';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/** Local Llama tier status. Never reports "ready" without a live answer from the server. */
export async function GET(req: Request) {
  try {
    memberRead(req);
    const chat = await localStatus();
    const g = guardUrl();
    const guard = !g ? { state: 'not_configured', label: 'Not connected — set MUZEBOS_LOCAL_GUARD_URL' } : g === localUrl() ? { ...chat, label: chat.state === 'ready' ? `Same server as chat (${chat.model ?? 'model unknown'})` : chat.label } : await localStatus({ MUZEBOS_LOCAL_LLM_URL: g });
    return NextResponse.json({ chat, guard });
  } catch (e: any) { return NextResponse.json({ error: e?.message ?? 'Error' }, { status: e?.status ?? 500 }); }
}
