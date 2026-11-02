// Browser e2e + axe/hue/44px audit for the Board. Fresh MUZEBOS_DB; creates a disposable owner.
// Usage: AXE=/path/axe.min.js node scripts/e2e-board.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
const [base, out = '/tmp/shots-board'] = process.argv.slice(2); mkdirSync(out, { recursive: true }); const axeSrc = process.env.AXE ? readFileSync(process.env.AXE, 'utf8') : null;
const b = await chromium.launch({ args: ['--no-sandbox'] }); const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
const r = await p.request.post(`${base}/api/metabos/auth`, { headers: { origin: base }, data: { action: 'setup', setup: { workspace: 'E2E Shop', name: 'Owner', email: 'owner@example.com', password: 'e2e-only-Passw0rd!' } } }); console.log('setup', r.status());
const audit = async (name) => { if (!axeSrc) return; await p.addScriptTag({ content: axeSrc });
  const res = await p.evaluate(async () => { const root = document.querySelector('[data-testid=bos-board]');
    const ax = (await window.axe.run(root, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'] })).violations.map((v) => ({ id: v.id, n: v.nodes.length, ex: v.nodes.slice(0, 2).map((x) => x.target.join(' ')) }));
    const hue = (c) => { const m = c.match(/rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?/); if (!m || m[4] === '0') return null; const [r, g, bl] = [m[1], m[2], m[3]].map(Number); const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl); if (mx - mn < 40) return null; let h; if (mx === r) h = ((g - bl) / (mx - mn)) % 6; else if (mx === g) h = (bl - r) / (mx - mn) + 2; else h = (r - g) / (mx - mn) + 4; return (h * 60 + 360) % 360; };
    const bad = [], small = []; for (const el of root.querySelectorAll('*')) { const cs = getComputedStyle(el); for (const prop of ['color', 'backgroundColor', 'borderTopColor']) { const h = hue(cs[prop]); if (h !== null && h > 170 && h < 320) bad.push(`${el.tagName} ${prop}=${cs[prop]}`); }
      if (el.matches('button, a, input, select, textarea, summary') && el.offsetParent) { const rc = el.getBoundingClientRect(); if (rc.height < 44) small.push(`${el.tagName} ${Math.round(rc.height)}px`); } }
    return { axe: ax, blueOrPurple: [...new Set(bad)].slice(0, 8), under44: [...new Set(small)].slice(0, 8) }; });
  console.log('audit', name, JSON.stringify(res)); assert.equal(res.axe.length, 0, 'axe'); assert.equal(res.blueOrPurple.length, 0, 'hue'); assert.equal(res.under44.length, 0, '44px'); };
await p.goto(base + '/workspace/builder/business-open-server?view=board'); await p.getByTestId('bos-board').waitFor({ timeout: 30000 });
await p.getByTestId('tile-sqlite').locator('.mb-board-pill', { hasText: 'ok' }).waitFor({ timeout: 20000 });
for (const id of ['openrouter', 'stripe', 'slack', 'notion']) assert.equal(await p.getByTestId(`tile-${id}`).locator('.mb-board-pill').innerText(), 'not configured');
assert.equal(await p.getByText('autonomous', { exact: false }).count(), 0);
const st = await (await p.request.get(`${base}/api/board/status`)).json(); console.log('status', st.tiles.map((t) => `${t.id}=${t.status}`).join(' '));
await p.screenshot({ path: `${out}/board.png`, fullPage: true }); await audit('board');
await p.getByTestId('tile-ledger').evaluate((e) => e.scrollIntoView({ block: 'center' })); await p.getByTestId('tile-ledger').getByRole('button', { name: /Ask MuZe about/ }).click(); const g = p.getByTestId('muze-roam-guide'); await g.waitFor({ timeout: 10000 }); console.log('roam →', await g.textContent());
await p.screenshot({ path: `${out}/board-roam.png` });
await p.getByRole('button', { name: 'Edit board' }).click(); await p.getByRole('button', { name: 'Move Jev queue earlier' }).waitFor();
for (let i = 0; i < 9; i++) { const m = p.getByRole('button', { name: 'Move Jev queue earlier' }); await m.press('Enter'); /* keyboard path: MuZe parks over the guided tile by design */ }
await p.getByTestId('tile-stripe').getByRole('button', { name: 'Hide' }).press('Enter'); await p.getByTestId('tile-jev').getByLabel('Size').selectOption('lg');
await p.screenshot({ path: `${out}/board-edit.png`, fullPage: true }); await audit('board edit');
await p.getByRole('button', { name: 'Save layout' }).press('Enter'); await p.getByText('Layout saved.').waitFor();
await p.reload(); await p.getByTestId('bos-board').waitFor(); await p.getByTestId('tile-jev').waitFor();
const order = await p.locator('.mb-board-tile').evaluateAll((els) => els.map((e) => e.dataset.testid)); console.log('order after reload', order.slice(0, 3).join(','));
assert.equal(order[0], 'tile-jev'); assert.equal(order.includes('tile-stripe'), false, 'hidden stays hidden');
await p.screenshot({ path: `${out}/board-saved.png`, fullPage: true });
assert.deepEqual(errs, []); console.log('E2E BOARD OK'); await b.close();
