// Theme + a11y audit for Agent Hub and MUSE. Usage: AXE=/path/axe.min.js node scripts/hub-muse-audit.mjs <baseUrl>  (run e2e-hub-muse.mjs first; it creates the disposable owner)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const [base] = process.argv.slice(2); const axe = readFileSync(process.env.AXE, 'utf8');
const b = await chromium.launch({ args: ['--no-sandbox'] }); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage();
const si = await p.request.post(`${base}/api/metabos/auth`, { headers: { origin: base }, data: { action: 'signIn', credentials: { email: 'owner@example.com', password: 'e2e-only-Passw0rd!' } } }); console.log('signIn', si.status());
const out = {};
for (const [path, root] of [['/workspace/builder/meta-server', '[data-testid=meta-server]'], ['/workspace/builder/agent-hub', '[data-testid=agent-hub]'], ['/workspace/brain/voice', '.mb-muse']]) {
  await p.goto(base + path); await p.locator(root).waitFor({ timeout: 20000 }); await p.waitForTimeout(1200);
  await p.addScriptTag({ content: axe });
  const ax = await p.evaluate(async (root) => { const r = await window.axe.run(document.querySelector(root), { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'] }); return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, ex: v.nodes.slice(0, 3).map((x) => x.target.join(' ')) })); }, root);
  const theme = await p.evaluate((root) => {
    const hue = (c) => { const m = c.match(/rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?/); if (!m || m[4] === '0') return null; const [r, g, bl] = [m[1], m[2], m[3]].map(Number); const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl); if (mx - mn < 40) return null; let h; if (mx === r) h = ((g - bl) / (mx - mn)) % 6; else if (mx === g) h = (bl - r) / (mx - mn) + 2; else h = (r - g) / (mx - mn) + 4; return (h * 60 + 360) % 360; };
    const bad = []; const small = [];
    for (const el of document.querySelector(root).querySelectorAll('*')) { const cs = getComputedStyle(el); if (el.closest('[data-platform]')) continue;
      for (const prop of ['color', 'backgroundColor', 'borderTopColor']) { const h = hue(cs[prop]); if (h !== null && h > 170 && h < 320) bad.push(`${el.tagName.toLowerCase()}.${el.className}`.slice(0, 60) + ` ${prop}=${cs[prop]}`); }
      if (el.matches('button, a, input, select, textarea, [role=tab]') && el.offsetParent) { const r = el.getBoundingClientRect(); if (r.height < 44 && !(el.tagName === 'INPUT' && el.type === 'checkbox')) small.push(`${el.tagName.toLowerCase()} "${(el.innerText || el.getAttribute('aria-label') || '').slice(0, 25)}" ${Math.round(r.height)}px`); } }
    return { blueOrPurple: [...new Set(bad)].slice(0, 10), under44: [...new Set(small)].slice(0, 12) }; }, root);
  out[path] = { axe: ax, ...theme };
}
console.log(JSON.stringify(out, null, 1)); await b.close();
