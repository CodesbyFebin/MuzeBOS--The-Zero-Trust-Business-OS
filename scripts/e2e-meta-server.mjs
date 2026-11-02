// Browser e2e: MeTa Server shell (servers, page channels, commit log, ad draft → Jev, swarm embed, mobile toggles).
// Usage: node scripts/e2e-meta-server.mjs <baseUrl> <outDir>  (fresh MUZEBOS_DB; creates a disposable owner)
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const [base, out = '/tmp/shots'] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--no-sandbox'] }); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
const r = await p.request.post(`${base}/api/metabos/auth`, { headers: { origin: base }, data: { action: 'setup', setup: { workspace: 'E2E Bakery', name: 'Owner', email: 'owner@example.com', password: 'e2e-only-Passw0rd!' } } });
console.log('setup', r.status());
await p.goto(base + '/workspace/builder/meta-server'); const root = p.getByTestId('meta-server'); await root.waitFor({ timeout: 30000 });
await p.getByText('No records yet').first().waitFor({ timeout: 15000 });
const icons = await p.locator('#mb-srv-rail button').count(); console.log('server icons', icons); assert.equal(icons, 20);
await p.screenshot({ path: `${out}/meta-server-hq.png` });
// page channel → real route
await p.getByRole('button', { name: 'Sales & CRM' }).click(); const ch = p.locator('.mb-srv-side [data-route]').first(); const route = await ch.getAttribute('data-route'); await ch.click();
assert.equal(await p.getByRole('link', { name: 'Open page' }).getAttribute('href'), route);
await p.getByRole('button', { name: 'Preview here' }).click(); await p.locator('.mb-srv-frame').waitFor();
await p.waitForTimeout(2500); await p.screenshot({ path: `${out}/meta-server-channel.png` });
// ads manager → draft + Jev, shows as commit
await p.getByRole('button', { name: 'Marketing & Ads' }).click(); await p.getByRole('button', { name: 'ads-manager' }).click();
assert.match(await p.locator('.mb-hub-chat-head').innerText(), /Not connected/);
await p.getByLabel('Campaign name').fill('Diwali gift boxes'); await p.getByLabel('Objective').selectOption('sales'); await p.getByLabel('Daily budget (₹)').fill('500');
await p.getByLabel('Audience').fill('Kochi, 25-45, sweets'); await p.getByLabel('Creative text').fill('Pre-order Diwali boxes by Friday.');
await p.getByRole('button', { name: 'Save draft for Jev' }).click(); await p.getByText(/Nothing was created on Meta/).waitFor({ timeout: 15000 });
await p.getByRole('button', { name: 'commits' }).click(); const c = p.locator('.mb-srv-commit').filter({ hasText: 'Ad draft: Diwali gift boxes' }); await c.waitFor({ timeout: 15000 });
const ct = await c.innerText(); assert.match(ct, /pending/); assert.match(ct, /dailyBudgetMinor: 50000 INR/); assert.match(ct, /server\.ad\.draft\.pending_jev/);
await p.screenshot({ path: `${out}/meta-server-commits.png` });
await p.getByRole('button', { name: 'meta-connections' }).click(); await p.getByText('Meta Ads Manager').waitFor(); await p.screenshot({ path: `${out}/meta-server-connections.png` });
// Meta Suite: per-product channels, personal/business mode, drafts to Jev
await p.getByRole('button', { name: 'Meta Suite' }).click(); for (const n of ['Facebook', 'Instagram', 'Messenger', 'WhatsApp', 'Threads', 'Meta AI']) await p.locator('.mb-srv-side').getByRole('button', { name: n, exact: true }).waitFor();
await p.locator('.mb-srv-side').getByRole('button', { name: 'Threads', exact: true }).click(); assert.match(await p.locator('.mb-hub-chat-head').innerText(), /Not connected/);
await p.getByRole('button', { name: 'Personal' }).click(); await p.getByLabel('Threads personal draft').fill('Baking tonight.'); await p.getByRole('button', { name: 'Save draft for Jev' }).click();
await p.getByText(/Nothing was sent/).waitFor({ timeout: 15000 }); await p.screenshot({ path: `${out}/meta-suite-personal.png` });
await p.getByRole('button', { name: 'Marketing & Ads' }).click(); assert.equal(await p.getByRole('button', { name: 'ads-manager' }).count(), 0);
await p.getByRole('button', { name: 'Business' }).click(); await p.getByRole('button', { name: 'ads-manager' }).waitFor();
await p.getByRole('button', { name: 'Meta Suite' }).click(); await p.screenshot({ path: `${out}/meta-suite-business.png` });
// swarm server embeds the Agent Hub
await p.locator('#mb-srv-rail button.is-swarm').first().click(); await p.getByTestId('agent-hub').waitFor({ timeout: 15000 }); await p.waitForTimeout(800);
await p.screenshot({ path: `${out}/meta-server-swarm.png` });
// mobile: rail and channels collapse behind toggles
const m = await ctx.newPage(); await m.setViewportSize({ width: 390, height: 844 }); await m.goto(base + '/workspace/builder/meta-server'); await m.getByTestId('meta-server').waitFor();
assert.equal(await m.locator('#mb-srv-rail').isVisible(), false); await m.screenshot({ path: `${out}/meta-server-mobile.png` });
await m.getByRole('button', { name: 'Servers' }).click(); assert.equal(await m.locator('#mb-srv-rail').isVisible(), true); await m.screenshot({ path: `${out}/meta-server-mobile-rail.png` });
await m.getByRole('button', { name: 'Channels' }).click(); assert.equal(await m.locator('#mb-srv-side').isVisible(), true); await m.screenshot({ path: `${out}/meta-server-mobile-channels.png` });
console.log('errors', errs.length ? errs : 'none'); await b.close(); if (errs.length) process.exit(1); console.log('E2E OK');
