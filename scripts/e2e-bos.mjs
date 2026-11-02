// Browser e2e + axe/hue/44px audit: MuZe Business Open Server. Fresh MUZEBOS_DB; creates a disposable owner.
// Usage: AXE=/path/axe.min.js node scripts/e2e-bos.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
const [base, out = '/tmp/shots-bos'] = process.argv.slice(2); mkdirSync(out, { recursive: true }); const axeSrc = process.env.AXE ? readFileSync(process.env.AXE, 'utf8') : null;
const b = await chromium.launch({ args: ['--no-sandbox'] }); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
const r = await p.request.post(`${base}/api/metabos/auth`, { headers: { origin: base }, data: { action: 'setup', setup: { workspace: 'E2E Shop', name: 'Owner', email: 'owner@example.com', password: 'e2e-only-Passw0rd!' } } }); console.log('setup', r.status());
const audits = {};
const audit = async (name) => { if (!axeSrc) return; await p.addScriptTag({ content: axeSrc });
  audits[name] = await p.evaluate(async () => { const root = document.querySelector('[data-testid=bos]');
    const ax = (await window.axe.run(root, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'] })).violations.map((v) => ({ id: v.id, n: v.nodes.length, ex: v.nodes.slice(0, 2).map((x) => x.target.join(' ')) }));
    const hue = (c) => { const m = c.match(/rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?/); if (!m || m[4] === '0') return null; const [r, g, bl] = [m[1], m[2], m[3]].map(Number); const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl); if (mx - mn < 40) return null; let h; if (mx === r) h = ((g - bl) / (mx - mn)) % 6; else if (mx === g) h = (bl - r) / (mx - mn) + 2; else h = (r - g) / (mx - mn) + 4; return (h * 60 + 360) % 360; };
    const bad = [], small = [];
    for (const el of root.querySelectorAll('*')) { const cs = getComputedStyle(el); for (const prop of ['color', 'backgroundColor', 'borderTopColor']) { const h = hue(cs[prop]); if (h !== null && h > 170 && h < 320) bad.push(`${el.tagName} ${prop}=${cs[prop]}`); }
      if (el.matches('button, a, input, select, textarea') && el.offsetParent) { const rc = el.getBoundingClientRect(); if (rc.height < 44) small.push(`${el.tagName} "${(el.innerText || el.getAttribute('aria-label') || '').slice(0, 25)}" ${Math.round(rc.height)}px`); } }
    return { axe: ax, blueOrPurple: [...new Set(bad)].slice(0, 8), under44: [...new Set(small)].slice(0, 8) }; }); };
const rail = (n) => p.locator('nav[aria-label="Server rail"]').getByRole('button', { name: n, exact: true }).click();
await p.goto(base + '/workspace/builder/business-open-server'); await p.getByTestId('bos').waitFor({ timeout: 30000 });
await p.getByTestId('bos-office').waitFor({ timeout: 15000 }); await p.getByText(/No agents/i).first().waitFor();
await p.screenshot({ path: `${out}/office-empty.png` }); await audit('office empty');
for (const bad of ['autonomous', 'VERIFIED', '500 agents']) assert.equal(await p.getByText(bad, { exact: false }).count(), 0, `no "${bad}"`);
await rail('MUSE Sanctum'); await p.getByTestId('bos-sanctum').waitFor(); await p.getByTestId('bos-dryrun').waitFor(); await p.waitForTimeout(1500);
await p.screenshot({ path: `${out}/sanctum-empty.png` }); await audit('sanctum empty');
await p.getByLabel('Command', { exact: true }).fill('Remind the customer their order is ready'); await p.getByRole('button', { name: 'Draft plan' }).click();
await p.getByText(/Model not configured|Plan/).first().waitFor({ timeout: 30000 }); console.log('model state', (await p.getByTestId('bos-sanctum').innerText()).match(/Model not configured[^\n]*/)?.[0] ?? 'model replied');
await p.screenshot({ path: `${out}/sanctum-plan.png` }); await audit('sanctum after plan');
await rail('HQ'); await p.getByTestId('bos-hq').waitFor(); await p.screenshot({ path: `${out}/hq.png` }); await audit('hq');
await rail('Operator console'); await p.getByTestId('bos-operator').waitFor(); assert.equal(await p.getByTestId('bos-cli-state').innerText(), 'Not connected');
for (const bt of ['Run', 'Pause', 'Stop']) assert.equal(await p.getByRole('button', { name: bt, exact: true }).isDisabled(), true); await p.getByText('Nothing waiting in Jev.').waitFor();
await p.screenshot({ path: `${out}/operator.png` }); await audit('operator');
await rail('Channels'); await p.getByTestId('bos-discord').waitFor(); await p.getByRole('button', { name: '# jev-approvals' }).click(); await p.getByText('No messages in #jev-approvals yet.').waitFor();
await p.getByRole('button', { name: '# audit-log' }).click(); await p.screenshot({ path: `${out}/discord.png` }); await audit('discord');
await rail('MCP directory'); await p.getByTestId('bos-mcp').waitFor(); await p.screenshot({ path: `${out}/mcp.png` }); await audit('mcp');
await rail('Trust stack R0–R6'); await p.getByTestId('bos-trust').waitFor(); await p.screenshot({ path: `${out}/trust.png` }); await audit('trust');
await rail('Verification'); await p.getByTestId('bos-verify').waitFor(); await p.screenshot({ path: `${out}/verify.png` }); await audit('verify');
await p.locator('[role=group][aria-label=Platform]').getByRole('button', { name: 'METAPEN Operator' }).click(); await p.getByTestId('bos-operator').waitFor();
await p.setViewportSize({ width: 390, height: 844 }); await p.screenshot({ path: `${out}/mobile-operator.png` }); await audit('mobile');
console.log(JSON.stringify(audits, null, 1)); console.log('page errors', errs.length, errs.slice(0, 3)); assert.equal(errs.length, 0);
console.log('E2E OK'); await b.close();
