// Browser e2e: 3-minute judge Demo mode. Fresh MUZEBOS_DB; inbound lead is a labelled FIXTURE.
// Usage: AXE=/path/axe.min.js node scripts/e2e-demo.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const [base, out = '/tmp/shots-win'] = process.argv.slice(2); const axeSrc = process.env.AXE ? readFileSync(process.env.AXE, 'utf8') : null;
const b = await chromium.launch({ args: ['--no-sandbox'] }); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
console.log('setup', (await p.request.post(`${base}/api/metabos/auth`, { headers: { origin: base }, data: { action: 'setup', setup: { workspace: 'Demo Shop', name: 'Owner', email: 'owner@example.com', password: 'e2e-only-Passw0rd!' } } })).status());
const audits = {};
const audit = async (name) => { if (!axeSrc) return; await p.addScriptTag({ content: axeSrc });
  audits[name] = await p.evaluate(async () => { const root = document.querySelector('[data-testid=judge-demo]');
    const ax = (await window.axe.run(root, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'] })).violations.map((v) => ({ id: v.id, n: v.nodes.length }));
    const hue = (c) => { const m = c.match(/rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?/); if (!m || m[4] === '0') return null; const [r, g, bl] = [m[1], m[2], m[3]].map(Number); const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl); if (mx - mn < 40) return null; let h; if (mx === r) h = ((g - bl) / (mx - mn)) % 6; else if (mx === g) h = (bl - r) / (mx - mn) + 2; else h = (r - g) / (mx - mn) + 4; return (h * 60 + 360) % 360; };
    const bad = [], small = [];
    for (const el of root.querySelectorAll('*')) { const cs = getComputedStyle(el); for (const prop of ['color', 'backgroundColor', 'borderTopColor']) { const h = hue(cs[prop]); if (h !== null && h > 170 && h < 320) bad.push(`${el.tagName} ${prop}=${cs[prop]}`); }
      if (el.matches('button, a, input, select, textarea') && el.offsetParent) { const rc = el.getBoundingClientRect(); if (rc.height < 44) small.push(`${el.tagName} ${Math.round(rc.height)}px`); } }
    return { axe: ax, blueOrPurple: [...new Set(bad)], under44: [...new Set(small)] }; }); };
const shot = async (n) => { await p.screenshot({ path: `${out}/${n}.png`, fullPage: true }); await audit(n); };
await p.goto(base + '/workspace/builder/demo'); await p.getByTestId('judge-demo').waitFor({ timeout: 30000 });
await p.getByRole('button', { name: 'Start demo' }).waitFor(); await shot('demo-1-muse-greets');
await p.getByRole('button', { name: 'Start demo' }).click();
await p.getByLabel(/Your brand name/).fill('Kochi Ewaste'); await shot('demo-2-workspace'); await p.getByRole('button', { name: 'Create workspace' }).click();
await p.getByRole('button', { name: /FIXTURE lead/ }).click(); await p.getByText(/do you do pickups/).waitFor(); await shot('demo-3-fixture-lead');
await p.getByRole('button', { name: /draft a reply/ }).click(); await p.getByText('TEMPLATE — not model output').waitFor(); await shot('demo-4-draft');
await p.getByRole('button', { name: 'Propose as commit' }).click(); await p.getByText(/PENDING/).waitFor(); await shot('demo-5-pending-commit');
await p.getByRole('button', { name: /Approve/ }).click(); const o = p.getByTestId('demo-outcome'); await o.waitFor({ timeout: 20000 });
const ot = await o.innerText(); console.log('outcome', ot); assert.match(ot, /held|not sent|Not connected|sent/i); await shot('demo-6-dispatch-evidence');
await p.setViewportSize({ width: 390, height: 844 }); await shot('demo-7-mobile');
console.log(JSON.stringify(audits, null, 1)); console.log('page errors', errs.length, errs.slice(0, 3)); assert.equal(errs.length, 0);
console.log('E2E DEMO OK'); await b.close();
