// Browser e2e + axe/hue/44px audit for the board summary and Issues panel (feat/hackathon-ready). Fresh MUZEBOS_DB; creates a disposable owner.
// Usage: AXE=/path/axe.min.js node scripts/e2e-hr.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
const [base, out = '/tmp/shots-hr'] = process.argv.slice(2); mkdirSync(out, { recursive: true }); const axeSrc = process.env.AXE ? readFileSync(process.env.AXE, 'utf8') : null;
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
await p.goto(base + '/workspace/builder/business-open-server?view=board'); await p.getByTestId('bos-board').waitFor({ timeout: 30000 });
await p.getByTestId('board-summary').waitFor({ timeout: 20000 });
const st = await (await p.request.get(`${base}/api/board/status`)).json(); const ok = st.tiles.filter((t) => t.status === 'ok').length;
const shown = await p.getByTestId('systems-ok').innerText(); console.log('summary', shown, '| api ok =', ok, 'of', st.tiles.length);
assert.equal(shown, `${ok} of ${st.tiles.length}`, 'summary matches real status');
console.log('models', (await p.locator('.mb-board-models').innerText()).replace(/\s+/g, ' '));
assert.equal(await p.getByText('autonomous', { exact: false }).count(), 0);
await p.screenshot({ path: `${out}/board-summary.png`, fullPage: true }); await audit('board+summary');
await p.locator('[data-guide-id="rail-issues"]').press('Enter'); await p.getByTestId('bos-issues').waitFor();
await p.getByTestId('issues-no-agents').waitFor(); await p.getByTestId('issues-empty').waitFor(); console.log('issues: empty states shown (no desks, no issues)');
const bad = await p.request.post(`${base}/api/board/issues`, { headers: { origin: base }, data: { title: 'Made up', agent: 'ghost agent' } }); console.log('assign to unknown agent →', bad.status()); assert.equal(bad.status(), 400);
const anon = await (await chromium.launch({ args: ['--no-sandbox'] })).newContext(); const ar = await anon.request.get(`${base}/api/board/issues`); console.log('anonymous GET →', ar.status()); assert.ok(ar.status() >= 401 && ar.status() < 404);
await p.screenshot({ path: `${out}/issues-empty.png`, fullPage: true }); await audit('issues', '[data-testid=bos-issues]');
assert.deepEqual(errs, []); console.log('E2E HR OK'); await b.close(); process.exit(0);
