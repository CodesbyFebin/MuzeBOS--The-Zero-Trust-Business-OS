import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BusinessStore } from '@/lib/metabos/store';
import { createFrame, patchFrame, listFrames, addComment, markReady, canvasVersion, exportHtml } from '@/lib/metabos/canvas/store';
import { handleCanvasRpc } from '@/lib/metabos/canvas/mcp';
import { canvasModel } from '@/lib/metabos/canvas/generate';
import { queue } from '@/lib/metabos/ai/jev';
import { loadCatalog, connectionLabel } from '@/lib/metabos/muse-catalog';
import * as core from '@/lib/metabos/bos/core';
let s: BusinessStore; beforeEach(() => { s = new BusinessStore(':memory:'); vi.restoreAllMocks(); });
describe('canvas', () => {
  it('starts empty', () => { expect(listFrames(s)).toEqual([]); });
  it('creates, streams appends, bumps version, records evidence', () => {
    const f = createFrame(s, 'o', { title: 'Hero' }); const v0 = canvasVersion(s);
    patchFrame(s, 'o', { id: f.id, appendHtml: '<h1>' }); const g = patchFrame(s, 'o', { id: f.id, appendHtml: 'Hi</h1>' });
    expect(g.html).toBe('<h1>Hi</h1>'); expect(g.rev).toBe(3); expect(canvasVersion(s)).not.toBe(v0);
    expect(s.evidence().filter((e) => e.action === 'canvas.frame.write')).toHaveLength(2); expect(s.verifyAudit()).toBe(true);
    expect(() => patchFrame(s, 'o', { id: f.id, html: 'a', appendHtml: 'b' })).toThrow();
  });
  it('comment without agent stays a comment; with a desk agent opens an Issue', () => {
    const f = createFrame(s, 'o', { title: 'A' }); expect(addComment(s, 'o', { frameId: f.id, body: 'tighten' }).issueId).toBeNull();
    expect(() => addComment(s, 'o', { frameId: f.id, body: 'x', agent: 'ghost' })).toThrow(/Unknown agent/);
    vi.spyOn(core, 'office').mockReturnValue({ desks: [{ agent: 'writer agent' }] } as ReturnType<typeof core.office>);
    expect(addComment(s, 'o', { frameId: f.id, body: 'copy', agent: 'writer agent' }).issueId).toBeTruthy();
  });
  it('mark ready refuses empty frames and opens a Jev run otherwise', () => {
    const f = createFrame(s, 'o', { title: 'A' }); expect(() => markReady(s, 'o', f.id)).toThrow(/empty/);
    patchFrame(s, 'o', { id: f.id, html: '<p>x</p>' }); const r = markReady(s, 'o', f.id); expect(r.frame.status).toBe('ready'); expect(queue(s).length).toBe(1);
    expect(patchFrame(s, 'o', { id: f.id, html: '<p>y</p>' }).status).toBe('draft');
  });
  it('export wraps html without adding scripts', () => { const f = createFrame(s, 'o', { title: 'T<x>', html: '<b>b</b>' }); const h = exportHtml(f); expect(h).toContain('<b>b</b>'); expect(h).not.toContain('<script'); expect(h).toContain('<title>Tx</title>'); });
  it('MCP tools: list, create, write, get, and screenshot via a TEST DOUBLE renderer', async () => {
    const l = await handleCanvasRpc(s, 'agent', { jsonrpc: '2.0', id: 1, method: 'tools/list' }) as { result: { tools: { name: string }[] } };
    expect(l.result.tools.map((t) => t.name)).toEqual(['canvas.create_frame', 'canvas.write_html', 'canvas.get_frame', 'canvas.screenshot_frame']);
    const c = await handleCanvasRpc(s, 'agent', { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'canvas.create_frame', arguments: { title: 'M' } } }) as { result: { content: { text: string }[] } };
    const id = JSON.parse(c.result.content[0].text).id;
    await handleCanvasRpc(s, 'agent', { jsonrpc: '2.0', method: 'tools/call', params: { name: 'canvas.write_html', arguments: { id, html: '<i>', append: true } } });
    const g = await handleCanvasRpc(s, 'agent', { jsonrpc: '2.0', method: 'tools/call', params: { name: 'canvas.get_frame', arguments: { id } } }) as { result: { content: { text: string }[] } };
    expect(JSON.parse(g.result.content[0].text).html).toBe('<i>');
    const fakeShot = async () => Buffer.from('PNGTESTDOUBLE'); // TEST DOUBLE, not a real render
    const sh = await handleCanvasRpc(s, 'agent', { jsonrpc: '2.0', method: 'tools/call', params: { name: 'canvas.screenshot_frame', arguments: { id } } }, fakeShot) as { result: { content: { type: string }[] } };
    expect(sh.result.content[0].type).toBe('image');
    const bad = await handleCanvasRpc(s, 'agent', { jsonrpc: '2.0', method: 'tools/call', params: { name: 'canvas.write_html', arguments: { id: 'nope', html: '' } } }) as { result: { isError: boolean } };
    expect(bad.result.isError).toBe(true);
  });
  it('no model configured means no generation', () => { expect(canvasModel({})).toBeNull(); });
  it('MCP directory lists the canvas server and Doop as external, AGPL reference', () => {
    const e = loadCatalog().entries; const c = e.find((x) => x.id === 'mcp:muze/canvas')!; const d = e.find((x) => x.id === 'mcp:external/doop')!;
    expect(connectionLabel(c, {})).toMatch(/Built in/); expect(d.status).toBe('reference'); expect(d.license).toMatch(/AGPL/); expect(connectionLabel(d, {})).toMatch(/authorize/);
  });
});
