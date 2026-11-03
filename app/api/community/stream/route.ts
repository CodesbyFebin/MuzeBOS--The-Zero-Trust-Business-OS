import { memberRead } from '@/lib/metabos/member-read';
import { fail } from '@/lib/metabos/canvas/http';
import { communityVersion } from '@/lib/metabos/community/store';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/** SSE: polls SQLite every 400 ms and sends the community revision when it changes; the client refetches. Closes after 5 minutes. */
export async function GET(req: Request) {
  try { const { s } = memberRead(req); const enc = new TextEncoder(); let last = -1; let timer: ReturnType<typeof setInterval> | undefined; const t0 = Date.now();
    const body = new ReadableStream({ start(c) {
      const tick = () => { try { if (req.signal.aborted || Date.now() - t0 > 300_000) { clearInterval(timer); c.close(); return; } const v = communityVersion(s); if (v !== last) { last = v; c.enqueue(enc.encode(`event: rev\ndata: ${v}\n\n`)); } } catch { clearInterval(timer); try { c.close(); } catch { /* closed */ } } };
      tick(); timer = setInterval(tick, 400); }, cancel() { clearInterval(timer); } });
    return new Response(body, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' } }); }
  catch (e) { return fail(e); }
}
