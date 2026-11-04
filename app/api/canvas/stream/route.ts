import { memberRead } from '@/lib/metabos/member-read';
import { fail } from '@/lib/metabos/canvas/http';
import { canvasVersion, listFrames } from '@/lib/metabos/canvas/store';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/** SSE: polls SQLite every 400 ms and sends the frames when anything changed. Closes after 5 minutes; EventSource reconnects. */
export async function GET(req: Request) {
  try { const { s } = memberRead(req); const enc = new TextEncoder(); let last = ''; let timer: ReturnType<typeof setInterval> | undefined; const t0 = Date.now();
    const body = new ReadableStream({ start(c) {
      const tick = () => { try { if (req.signal.aborted || Date.now() - t0 > 300_000) { clearInterval(timer); c.close(); return; } const v = canvasVersion(s); if (v !== last) { last = v; c.enqueue(enc.encode(`event: frames\ndata: ${JSON.stringify({ version: v, frames: listFrames(s) })}\n\n`)); } else c.enqueue(enc.encode(': ping\n\n')); } catch { clearInterval(timer); try { c.close(); } catch { /* closed */ } } };
      tick(); timer = setInterval(tick, 400); }, cancel() { clearInterval(timer); } });
    return new Response(body, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' } }); }
  catch (e) { return fail(e); }
}
