import { memberRead } from '@/lib/metabos/member-read';
import { fail } from '@/lib/metabos/canvas/http';
import { getFrame, exportHtml } from '@/lib/metabos/canvas/store';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/** HTML export. PNG export is rendered in the browser (Canvas.tsx) or via the screenshot_frame MCP tool. */
export async function GET(req: Request) {
  try { const { s } = memberRead(req); const id = new URL(req.url).searchParams.get('id') ?? ''; const f = getFrame(s, id);
    return new Response(exportHtml(f), { headers: { 'content-type': 'text/html; charset=utf-8', 'content-disposition': `attachment; filename="frame-${f.id.slice(0, 8)}.html"`, 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:", 'x-content-type-options': 'nosniff' } }); }
  catch (e) { return fail(e); }
}
