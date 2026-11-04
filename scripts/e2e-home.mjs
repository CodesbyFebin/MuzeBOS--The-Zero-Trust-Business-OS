// Browser e2e + axe/hue/44px/keyboard audit for the MuZe home tiles (feat/muze-home). Fresh MUZEBOS_DB; disposable owner.
// Usage: AXE=/path/axe.min.js node scripts/e2e-home.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
const [base, out = '/tmp/shots-home'] = process.argv.slice(2); mkdirSync(out, { recursive: true }); const axeSrc = process.env.AXE ? readFileSync(process.env.AXE, 'utf8') : null;
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
// Signed-out first: tiles must show an honest sign-in message, not numbers.
const anon = await (await b.newContext()).newPage(); await anon.goto(base + '/'); await anon.getByTestId('home-tiles').waitFor({ timeout: 30000 });
await anon.getByText('Sign in to see your workspace numbers.').waitFor({ timeout: 15000 }); console.log('home: signed-out empty state shown'); await anon.close();
await p.goto(base + '/'); await p.getByTestId('home-tiles').waitFor({ timeout: 30000 }); await p.getByTestId('muse-voice').waitFor({ timeout: 30000 });
await p.getByText('Nothing waiting for review.').waitFor({ timeout: 20000 });
const ids = ['board', 'jev', 'dispatch', 'office', 'canvas', 'issues', 'sanctum', 'operator', 'mcp', 'trust', 'meta', 'evidence'];
for (const id of ids) assert.equal(await p.getByTestId(`home-tile-${id}`).count(), 1, id);
for (const t of ['No dispatches yet.', 'No frames yet.', 'No issues.']) await p.getByText(t, { exact: false }).first().waitFor(); console.log('home: 12 tiles, fresh-store empty states shown');
assert.equal(await p.getByText('autonomous', { exact: false }).count(), 0);
assert.match(await p.getByTestId('home-tile-trust').innerText(), /R0 not attested/); console.log('home: trust tile reports R0 not attested');
await p.waitForTimeout(800); await p.screenshot({ path: `${out}/home-empty.png`, fullPage: true }); await audit('home-empty', '[data-testid=home-tiles]');
// Keyboard: Tab reaches the guide button, Enter starts the tour, MuZe reads the first tile's data-guide.
await p.getByTestId('home-guide').focus(); await p.keyboard.press('Enter');
const g1 = await p.getByTestId('muze-roam-guide').innerText(); assert.match(g1, /Systems board/); console.log('home: guide 1 →', g1.slice(0, 60));
await p.getByTestId('home-guide-next').focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
assert.match(await p.getByTestId('muze-roam-guide').innerText(), /Jev queue/); console.log('home: guide 2 → Jev queue');
await p.screenshot({ path: `${out}/home-guide.png` });
// Real data: create a canvas frame; the canvas tile must list it after reload.
const cf = await p.request.post(`${base}/api/canvas`, { headers: { origin: base }, data: { title: 'Home e2e frame' } }); console.log('create frame', cf.status());
await p.reload(); await p.getByTestId('home-tile-canvas').getByText(/Home e2e frame · draft/).waitFor({ timeout: 20000 }); console.log('home: canvas tile lists the real frame');
const evText = await p.getByTestId('home-tile-evidence').innerText(); assert.match(evText, /verified/); console.log('home: evidence tile', evText.replace(/\s+/g, ' ').slice(0, 80));
// Every tile link opens its BOS view by keyboard.
await p.getByTestId('home-tile-canvas').getByRole('link').focus(); await p.keyboard.press('Enter'); await p.getByTestId('bos-canvas').waitFor({ timeout: 30000 }); console.log('home: canvas tile link opens ?view=canvas');
await p.goto(base + '/'); await p.getByTestId('home-tiles').waitFor(); await p.waitForTimeout(1500); await p.screenshot({ path: `${out}/home-data.png`, fullPage: true }); await audit('home-data', '[data-testid=home-tiles]');
assert.deepEqual(errs, []); console.log('E2E HOME OK'); await b.close();
