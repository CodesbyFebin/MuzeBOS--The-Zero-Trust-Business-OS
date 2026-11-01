// Browser e2e + axe/44px audit: AgentVerse OS V3 commit console. Real records only, created through the UI.
// Usage: AXE=/path/axe.min.js node scripts/e2e-agentverse.mjs <baseUrl> <outDir>  (fresh MUZEBOS_DB; creates a disposable owner)
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const [base, out = '/tmp/shots'] = process.argv.slice(2); const axeSrc = process.env.AXE ? readFileSync(process.env.AXE, 'utf8') : null;
const b = await chromium.launch({ args: ['--no-sandbox'] }); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
const r = await p.request.post(`${base}/api/metabos/auth`, { headers: { origin: base }, data: { action: 'setup', setup: { workspace: 'E2E Bakery', name: 'Owner', email: 'owner@example.com', password: 'e2e-only-Passw0rd!' } } });
console.log('setup', r.status());
const audits = {};
const audit = async (name) => { if (!axeSrc) return; await p.addScriptTag({ content: axeSrc });
  audits[name] = await p.evaluate(async () => { const root = document.querySelector('[data-testid=agentverse]');
    const ax = (await window.axe.run(root, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'] })).violations.map((v) => ({ id: v.id, n: v.nodes.length, ex: v.nodes.slice(0, 2).map((x) => x.target.join(' ')) }));
    const hue = (c) => { const m = c.match(/rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?/); if (!m || m[4] === '0') return null; const [r, g, bl] = [m[1], m[2], m[3]].map(Number); const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl); if (mx - mn < 40) return null; let h; if (mx === r) h = ((g - bl) / (mx - mn)) % 6; else if (mx === g) h = (bl - r) / (mx - mn) + 2; else h = (r - g) / (mx - mn) + 4; return (h * 60 + 360) % 360; };
    const bad = [], small = [];
    for (const el of root.querySelectorAll('*')) { const cs = getComputedStyle(el); for (const prop of ['color', 'backgroundColor', 'borderTopColor']) { const h = hue(cs[prop]); if (h !== null && h > 170 && h < 320) bad.push(`${el.tagName} ${prop}=${cs[prop]}`); }
      if (el.matches('button, a, input, select, textarea, [role=tab]') && el.offsetParent) { const rc = el.getBoundingClientRect(); if (rc.height < 44 && !(el.tagName === 'INPUT' && el.type === 'checkbox')) small.push(`${el.tagName} "${(el.innerText || el.getAttribute('aria-label') || '').slice(0, 25)}" ${Math.round(rc.height)}px`); } }
    return { axe: ax, blueOrPurple: [...new Set(bad)].slice(0, 8), under44: [...new Set(small)].slice(0, 8) }; }); };
const chan = (n) => p.locator('.mb-av-side').getByRole('button', { name: new RegExp(`^#\\s*${n}`) }).click();
await p.goto(base + '/workspace/builder/agentverse'); const root = p.getByTestId('agentverse'); await root.waitFor({ timeout: 30000 });
await p.getByText('No records yet').first().waitFor({ timeout: 15000 });
assert.equal(await p.locator('.mb-av-srv').count(), 2, 'only Home + create; nothing seeded');
for (const t of ['Ramesh', 'ewaste-leads']) assert.equal(await p.getByText(t).count(), 0);
await p.getByTestId('av-queues').waitFor(); for (const q of ['Kafka', 'Redis', 'Qdrant']) { const t = await p.getByTestId('av-queues').locator('li', { hasText: q }).innerText(); console.log('queue', t.replace(/\n/g, ' ')); assert.match(t, /not configured|Not configured|not connected/); }
await p.screenshot({ path: `${out}/agentverse-home-empty.png` }); await audit('home empty');
await chan('commit-log'); await p.screenshot({ path: `${out}/agentverse-empty.png` }); await audit('empty commit-log');
// owner creates a workspace
await p.getByRole('button', { name: 'Create workspace' }).first().click(); await p.getByLabel('Workspace name').fill('Ewaste Kochi'); await p.locator('form[aria-label="Create workspace"] button[type=submit]').click();
await p.getByRole('button', { name: 'Workspace Ewaste Kochi' }).waitFor(); await p.getByRole('button', { name: 'Workspace Ewaste Kochi' }).click();
// 5-step ads wizard → draft + Jev item
await chan('campaigns'); await p.getByLabel('Objective').selectOption('leads'); await p.getByRole('button', { name: 'Next' }).click();
await p.getByLabel('Audience').fill('Kochi 10km, recycling'); await p.getByRole('button', { name: 'Next' }).click();
await p.getByRole('button', { name: 'Next' }).click();
await p.getByLabel('Campaign name').fill('E2E pickup drive'); await p.getByLabel('Creative text').fill('Pickup tomorrow, DM us'); await p.getByRole('button', { name: 'Next' }).click();
await p.getByLabel('Daily budget (₹)').fill('500'); await p.screenshot({ path: `${out}/agentverse-wizard.png` }); await audit('campaigns wizard');
await p.getByRole('button', { name: 'Save draft for Jev' }).click(); await p.getByText('Nothing was created on Meta').waitFor();
await chan('roas-dashboard'); await p.getByText('Usage unavailable').first().waitFor(); await audit('roas');
// commit console
await chan('commit-log'); const c = p.locator('.mb-av-commit').first(); await c.waitFor();
const tagText = await c.locator('.mb-av-tag').innerText(); console.log('first commit tag', tagText); assert.notEqual(tagText, 'SHIPPED');
await p.getByRole('tab', { name: 'Diffs' }).click(); await p.getByText(/co-authored-by/).first().waitFor();
await p.screenshot({ path: `${out}/agentverse-commit-log.png` }); await audit('commit-log diffs');
await p.getByRole('button', { name: 'Revert (Jev)' }).click(); await p.getByText(/queued as a new Jev item/).waitFor();
await p.getByRole('tab', { name: 'Logs' }).click(); await p.screenshot({ path: `${out}/agentverse-logs.png` });
await chan('home-overview'); await p.getByText('Agent drafted').first().waitFor(); await p.screenshot({ path: `${out}/agentverse-home.png` }); await audit('home with records');
await chan('pending-approvals'); const pend = await p.locator('.mb-av-commit').count(); console.log('pending commits', pend); assert.ok(pend >= 2);
// inbox not connected, onboarding, cmd+k
await chan('unified-inbox'); await p.getByText(/Not connected/).first().waitFor(); await audit('inbox');
await chan('onboarding'); await p.getByTestId('av-onboarding').waitFor(); await p.screenshot({ path: `${out}/agentverse-onboarding.png` }); await audit('onboarding');
await p.keyboard.press('Control+k'); await p.getByRole('dialog', { name: 'Search' }).waitFor(); await p.keyboard.type('pickup'); await p.locator('.mb-av-kbox li button').first().waitFor();
await p.screenshot({ path: `${out}/agentverse-cmdk.png` }); await audit('cmd+k'); await p.keyboard.press('Escape');
await p.getByRole('button', { name: 'personal' }).click(); assert.equal(await p.locator('.mb-av-side').getByRole('button', { name: /campaigns/ }).count(), 0);
await p.setViewportSize({ width: 390, height: 844 }); await p.getByRole('button', { name: 'business' }).click(); await chan('commit-log'); await p.screenshot({ path: `${out}/agentverse-mobile.png`, fullPage: true }); await audit('mobile');
console.log(JSON.stringify(audits, null, 1)); console.log('page errors', errs.length, errs.slice(0, 3)); assert.equal(errs.length, 0);
console.log('E2E OK'); await b.close();
