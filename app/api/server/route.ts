import { readJsonBounded } from '@/lib/bounded-body';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { memberRead } from '@/lib/metabos/member-read';
import { BusinessError } from '@/lib/metabos/store';
import { adDraft, commitLog, metaConnections, suiteDraft, SUITE_SETUP_ENV } from '@/lib/metabos/server/commits';
import { hubView } from '@/lib/metabos/hub/agent-hub';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const err = (e: unknown) => e instanceof BusinessError ? NextResponse.json({ error: e.message }, { status: e.status }) : e instanceof z.ZodError ? NextResponse.json({ error: 'Invalid request', issues: e.issues.slice(0, 5).map((i) => `${i.path.join('.')} ${i.message}`) }, { status: 400 }) : NextResponse.json({ error: 'Server error' }, { status: 500 });
const cmd = z.object({ action: z.enum(['adDraft', 'suiteDraft']), input: z.unknown() }).strict();

/** MeTa Server: commit log ("git for agents"), Meta connector status and swarm servers. Read-only except ad drafts, which only queue for Jev. */
export async function GET(req: Request) {
  try { const { s } = memberRead(req);
    return NextResponse.json({ commits: commitLog(s), meta: metaConnections(), suiteSetupEnv: SUITE_SETUP_ENV, swarms: hubView(s).servers }, { headers: { 'Cache-Control': 'no-store' } }); } catch (e) { return err(e); }
}
export async function POST(req: Request) {
  try { const { s, me } = memberRead(req, 'jev.decide'); const c = cmd.parse(await readJsonBounded(req)); const who = String((me as { name?: string; id: string }).name ?? me.id);
    return NextResponse.json(c.action === 'suiteDraft' ? suiteDraft(s, who, c.input) : adDraft(s, who, c.input)); } catch (e) { return err(e); }
}
