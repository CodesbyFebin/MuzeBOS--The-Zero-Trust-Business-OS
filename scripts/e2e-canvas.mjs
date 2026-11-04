// Browser e2e + axe/hue/44px audit for the design canvas and Rakazo runtime (feat/rakazo-canvas). Fresh MUZEBOS_DB; disposable owner.
// Usage: AXE=/path/axe.min.js node scripts/e2e-canvas.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
const [base, out = '/tmp/shots-canvas'] = process.argv.slice(2); mkdirSync(out, { recursive: true }); const axeSrc = process.env.AXE ? readFileSync(process.env.AXE, 'utf8') : null;
const b = await chromium.launch({ args: ['--no-sandbox'] }); const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
const r = await p.request.post(`${base}/api/metabos/auth`, { headers: { origin: base }, data: { action: 'setup', setup: { workspace: 'E2E Shop', name: 'Owner', email: 'owner@example.com', password: 'e2e-only-Passw0rd!' } } }); console.log('setup', r.status());
const audit = async (name, sel = "[data-testid=bos-board]") => { if (!axeSrc) return; await p.addScriptTag({ content: axeSrc });
  const res = await p.evaluate(async (sel) => { const root = document.querySelector(sel);
    const ax = (await window.axe.run(root, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'] })).violations.map((v) => ({ id: v.id, n: v.nodes.length, ex: v.nodes.slice(0, 2).map((x) => x.target.join(' ')) }));
    const hue = (c) => { const m = c.match(/rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?/); if (!m || m[4] === '0') return null; const [r, g, bl] = [m[1], m[2], m[3]].map(Number); const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl); if (mx - mn < 40) return null; let h; if (mx === r) h = ((g - bl) / (mx - mn)) % 6; else if (mx === g) h = (bl - r) / (mx - mn) + 2; else h = (r - g) / (mx - mn) + 4; return (h * 60 + 360) % 360; };
    const bad = [], small = []; for (const el of root.querySelectorAll('*')) { const cs = getComputedStyle(el); for (const prop of ['color', 'backgroundColor', 'borderTopColor']) { const h = hue(cs[prop]); if (h !== null && h > 170 && h < 320) bad.push(`${el.tagName} ${prop}=${cs[prop]}`); }
      if (el.matches('button, a, input, select, textarea, summary') && el.offsetParent) { const rc = el.getBoundingClientRect(); if (rc.height < 44) small.push(`${el.tagName} ${Math.round(rc.height)}px`); } }
    return { axe: ax, blueOrPurple: [...new Set(bad)].slice(0, 8), under44: [...new Set(small)].slice(0, 8) }; }, sel);
  console.log('audit', name, JSON.stringify(res)); assert.equal(res.axe.length, 0, 'axe'); assert.equal(res.blueOrPurple.length, 0, 'hue'); assert.equal(res.under44.length, 0, '44px'); };
const mcp = async (name, args) => { const r = await p.request.post(`${base}/api/canvas/mcp`, { headers: { origin: base }, data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } } }); return (await r.json()).result; };
await p.goto(base + '/workspace/builder/business-open-server?view=canvas'); await p.getByTestId('bos-canvas').waitFor({ timeout: 30000 });
await p.getByTestId('canvas-empty').waitFor({ timeout: 20000 }); console.log('canvas: empty state shown');
await p.getByText('Live updates on.').waitFor({ timeout: 15000 }); console.log('canvas: SSE connected');
assert.equal(await p.getByText('autonomous', { exact: false }).count(), 0);
await p.screenshot({ path: `${out}/canvas-empty.png`, fullPage: true }); await audit('canvas-empty', '[data-testid=bos-canvas]');
// An agent writes through the MCP tools; the open page must update over SSE without a reload.
const c = await mcp('canvas.create_frame', { title: 'Pricing hero' }); const id = JSON.parse(c.content[0].text).id; console.log('mcp create_frame →', id);
for (const chunk of ['<section style="background:#0A0A0A;color:#fff;padding:24px;font-family:sans-serif">', '<h1 style="color:#FF2A2A">MuZe pricing</h1>', '<p>Written by an agent in three chunks.</p></section>']) { await mcp('canvas.write_html', { id, html: chunk, append: true }); await p.waitForTimeout(300); }
await p.getByTestId('canvas-frame').first().waitFor(); const fr = p.frameLocator('iframe[title="Frame Pricing hero"]'); await fr.getByText('Written by an agent in three chunks.').waitFor({ timeout: 10000 }); console.log('canvas: streamed HTML visible live (no reload)');
const g = JSON.parse((await mcp('canvas.get_frame', { id })).content[0].text); console.log('get_frame rev', g.rev, 'status', g.status); assert.equal(g.rev, 4);
const sh = await mcp('canvas.screenshot_frame', { id }); console.log('screenshot_frame →', sh.isError ? 'error: ' + sh.content[0].text : `${sh.content[0].type} ${sh.content[0].data.length} b64 chars`);
await p.getByRole('button', { name: /Pricing hero · rev/ }).press('Enter'); await p.getByTestId('canvas-side').waitFor();
await p.getByTestId('canvas-no-model').waitFor(); console.log('canvas: no-model empty state shown');
await p.getByLabel('Comment', { exact: true }).fill('Make the price bigger'); await p.getByRole('button', { name: 'Comment', exact: true }).press('Enter'); await p.getByText('Comment saved.').waitFor();
const badC = await p.request.post(`${base}/api/canvas/comments`, { headers: { origin: base }, data: { frameId: id, body: 'x', agent: 'ghost agent' } }); console.log('comment → unknown agent issue', badC.status()); assert.equal(badC.status(), 400);
await p.getByTestId('canvas-ready').press('Enter'); await p.getByText('Marked ready. A Jev approval is waiting for a reviewer.').waitFor();
const fs = (await (await p.request.get(`${base}/api/canvas`)).json()).frames; assert.equal(fs[0].status, 'ready'); console.log('frame status', fs[0].status);
const ex = await p.request.get(`${base}/api/canvas/export?id=${id}`); const exb = await ex.text(); console.log('export html', ex.status(), ex.headers()['content-security-policy']); assert.ok(exb.includes('MuZe pricing'));
await p.getByRole('button', { name: 'Zoom in' }).press('Enter'); console.log('zoom', await p.getByTestId('canvas-zoom').innerText());
await p.screenshot({ path: `${out}/canvas-frame.png`, fullPage: true }); await audit('canvas-frame', '[data-testid=bos-canvas]');
const anon = await (await chromium.launch({ args: ['--no-sandbox'] })).newContext(); for (const u of ['/api/canvas', '/api/canvas/stream', '/api/runtime']) { const ar = await anon.request.get(base + u); console.log('anonymous GET', u, '→', ar.status()); assert.ok(ar.status() === 401 || ar.status() === 403); }
// Rakazo runtime: not configured in this run.
await p.locator('[data-guide-id="rail-runtime"]').press('Enter'); await p.getByTestId('rakazo-not-configured').waitFor(); console.log('runtime:', await p.getByTestId('runtime-mode').innerText(), '|', (await p.getByTestId('rakazo-not-configured').innerText()).slice(0, 60));
const sw = await p.request.put(`${base}/api/runtime`, { headers: { origin: base }, data: { action: 'mode', mode: 'rakazo' } }); console.log('switch to rakazo →', sw.status()); assert.equal(sw.status(), 409);
const pr = await anon.request.post(`${base}/api/runtime/rakazo/propose`, { data: { channel: 'email', botId: 'b', to: 'a@b.co', subject: 's', body: 'b' } }); console.log('rakazo propose without secret →', pr.status()); assert.ok([401, 503].includes(pr.status()));
const oa = await anon.request.get(`${base}/api/runtime/rakazo/openapi.json`); console.log('openapi.json →', oa.status(), Object.keys((await oa.json()).paths));
await p.screenshot({ path: `${out}/runtime.png`, fullPage: true }); await audit('runtime', '[data-testid=bos-runtime]');
const st = await (await p.request.get(`${base}/api/board/status`)).json(); const rk = st.tiles.find((t) => t.id === 'rakazo'); console.log('board tile rakazo:', rk.status, '-', rk.detail); assert.match(rk.detail, /Rakazo not configured/);
assert.deepEqual(errs, []); console.log('E2E CANVAS OK'); await b.close(); process.exit(0);
