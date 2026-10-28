import { readJsonBounded } from '@/lib/bounded-body';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { memberRead } from '@/lib/metabos/member-read';
import { BusinessError } from '@/lib/metabos/store';
import { getDb } from '@/lib/data';
import { filmingMode } from '@/lib/paths';
import { metaKey } from '@/lib/metabos/ai/meta';
import { metaCall } from '@/lib/metabos/ai/meta-call';
import { handleCommand, INTENT_PROMPT } from '@/lib/metabos/voice/assistant';
import { transcribe, SttError } from '@/lib/metabos/voice/stt';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const typed = z.object({ text: z.string().max(1000), tz: z.number().int().min(-840).max(840).optional() }).strict();
/** POST JSON {text} (typed or browser speech) or multipart {audio: WAV} (Muse Voice Transcribe). Members only. */
export async function POST(req: Request) {
  try {
    const { s } = memberRead(req);
    const tasks = filmingMode() ? [] : await Promise.resolve().then(() => getDb().agentTasks.all()).catch(() => []);
    const key = metaKey();
    let heard: string; let stt: unknown = null; let tz = 0;
    if ((req.headers.get('content-type') ?? '').startsWith('multipart/form-data')) {
      if (Number(req.headers.get('content-length') ?? 'NaN') > 33_000_000 || !req.headers.get('content-length')) throw new BusinessError('Audio must be a WAV of 32 MB or less with a Content-Length', 413);
      const form = await req.formData(); const audio = form.get('audio');
      if (!(audio instanceof Blob)) throw new BusinessError('audio (WAV) is required', 400);
      tz = Number(form.get('tz')) || 0;
      const t = await transcribe(s, audio, key); heard = t.transcript; stt = { model: 'muse-voice-transcribe-1.0', audioDurationMs: t.audioDurationMs, ms: t.ms };
    } else { const b = typed.parse(await readJsonBounded(req)); heard = b.text; tz = b.tz ?? 0; }
    const route = key ? async (text: string) => {
      const r = await metaCall({ store: s, key, task: 'classify', messages: [{ role: 'system', content: INTENT_PROMPT }, { role: 'user', content: text }], skipRules: true, sideEffects: false });
      return { text: r.text, model: r.model };
    } : undefined;
    const reply = await handleCommand({ store: s, tasks, tzOffsetMinutes: tz }, heard, route);
    return NextResponse.json({ ...reply, stt }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof SttError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof BusinessError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    return NextResponse.json({ error: 'Voice assistant unavailable' }, { status: 503 });
  }
}
