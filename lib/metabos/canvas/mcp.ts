/** Canvas tools for agents over MCP-style JSON-RPC (same shape as the GST MCP at /api/b3/mcp). Writes are canvas-only. */
import { z } from 'zod';
import type { BusinessStore } from '../store';
import { createFrame, getFrame, patchFrame, exportHtml } from './store';
export const CANVAS_TOOLS = [
  { name: 'canvas.create_frame', description: 'Create a frame on the MuZe design canvas. Returns its id.', inputSchema: { type: 'object', required: ['title'], properties: { title: { type: 'string' }, html: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } } } },
  { name: 'canvas.write_html', description: 'Replace a frame\'s HTML, or append a chunk (append:true) so viewers see it stream in.', inputSchema: { type: 'object', required: ['id', 'html'], properties: { id: { type: 'string' }, html: { type: 'string' }, append: { type: 'boolean' } } } },
  { name: 'canvas.get_frame', description: 'Read a frame (title, HTML, status, revision).', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  { name: 'canvas.screenshot_frame', description: 'Render a frame headless and return a PNG (base64). Needs Playwright Chromium on the server; otherwise returns an error saying so.', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
] as const;
type Shot = (html: string, w: number, h: number) => Promise<Buffer>;
/** Real headless render. Scripts and network are blocked in the page. */
export const playwrightShot: Shot = async (html, w, h) => {
  let pw: { chromium: { launch: (o: object) => Promise<any> } };
  try { pw = await import(/* webpackIgnore: true */ 'playwright' as string); } catch { throw new Error('Screenshots need Playwright on the server (not installed)'); }
  let b; try { b = await pw.chromium.launch({ headless: true }); } catch { throw new Error('Screenshots need Playwright Chromium on the server (browser not installed)'); }
  try { const ctx = await b.newContext({ viewport: { width: Math.round(w), height: Math.round(h) }, javaScriptEnabled: false }); await ctx.route('**/*', (r: any) => r.request().url().startsWith('data:') ? r.continue() : r.abort());
    const p = await ctx.newPage(); await p.setContent(html, { waitUntil: 'load', timeout: 10_000 }); return await p.screenshot({ type: 'png' }); } finally { await b.close(); }
};
export async function callCanvasTool(s: BusinessStore, actor: string, name: string, args: unknown, shot: Shot = playwrightShot): Promise<unknown> {
  if (name === 'canvas.create_frame') { const f = createFrame(s, actor, args); return { id: f.id, rev: f.rev }; }
  if (name === 'canvas.write_html') { const a = z.object({ id: z.string().uuid(), html: z.string(), append: z.boolean().default(false) }).strict().parse(args); const f = patchFrame(s, actor, a.append ? { id: a.id, appendHtml: a.html } : { id: a.id, html: a.html }); return { id: f.id, rev: f.rev, bytes: f.html.length }; }
  if (name === 'canvas.get_frame') { const { id } = z.object({ id: z.string().uuid() }).strict().parse(args); const f = getFrame(s, id); return { id: f.id, title: f.title, html: f.html, status: f.status, rev: f.rev }; }
  if (name === 'canvas.screenshot_frame') { const { id } = z.object({ id: z.string().uuid() }).strict().parse(args); const f = getFrame(s, id); const png = await shot(exportHtml(f), f.w, f.h); s.appendEvidence('canvas.frame.screenshot', f.id, JSON.stringify({ by: actor, rev: f.rev, bytes: png.length })); return { __image: png.toString('base64') }; }
  throw new Error(`Unknown tool ${name}`);
}
type Rpc = { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: { name?: string; arguments?: unknown } };
export async function handleCanvasRpc(s: BusinessStore, actor: string, m: Rpc, shot?: Shot) {
  const ok = (result: unknown) => ({ jsonrpc: '2.0', id: m.id ?? null, result });
  if (m.method === 'initialize') return ok({ protocolVersion: '2025-06-18', serverInfo: { name: 'muze-canvas', version: '0.1.0' }, capabilities: { tools: {} } });
  if (m.method === 'tools/list') return ok({ tools: CANVAS_TOOLS });
  if (m.method === 'tools/call') {
    try { const r = await callCanvasTool(s, actor, String(m.params?.name), m.params?.arguments ?? {}, shot);
      if (r && typeof r === 'object' && '__image' in r) return ok({ content: [{ type: 'image', data: (r as { __image: string }).__image, mimeType: 'image/png' }] });
      return ok({ content: [{ type: 'text', text: JSON.stringify(r) }] }); }
    catch (e) { return ok({ isError: true, content: [{ type: 'text', text: e instanceof z.ZodError ? 'Invalid arguments' : e instanceof Error ? e.message.slice(0, 200) : 'Tool failed' }] }); }
  }
  return { jsonrpc: '2.0', id: m.id ?? null, error: { code: -32601, message: 'Method not found' } };
}
