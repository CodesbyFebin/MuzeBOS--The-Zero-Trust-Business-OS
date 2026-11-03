// Browser e2e for the community server (feat/community-server): empty state, servers/channels/threads via prompts, SSE update without reload, agent badge, Meta proposal gated by two reviewers, axe/hue/44px, single home companion.
// Usage: AXE=/path/axe.min.js node scripts/e2e-community.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
const [base, out = '/tmp/shots-community'] = process.argv.slice(2); mkdirSync(out, { recursive: true }); const axeSrc = process.env.AXE ? readFileSync(process.env.AXE, 'utf8') : null;
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
const answers = []; p.on('dialog', (d) => d.accept(answers.shift() ?? ''));
const api = async (action, input) => { const r = await p.request.post(`${base}/api/community`, { headers: { origin: base }, data: { action, input } }); const j = await r.json(); assert.ok(r.ok(), `${action} ${r.status()} ${JSON.stringify(j)}`); return j; };
const C = p.getByTestId('community-server');
// Home: exactly one fur companion.
await p.goto(base + '/'); await p.getByTestId('muse-voice').waitFor({ timeout: 30000 }); await p.waitForTimeout(1500);
assert.equal(await p.getByTestId('muse-voice').count(), 1, 'one muse-voice'); assert.equal(await p.getByTestId('voice-assistant').count(), 0, 'no second companion'); console.log('home: one companion (muse-voice=1, voice-assistant=0)');
await p.goto(base + '/workspace/builder/business-open-server?view=discord'); await p.getByTestId('cs-empty').waitFor({ timeout: 30000 }); console.log('community: empty state "No servers yet"');
assert.equal(await p.getByText('autonomous', { exact: false }).count(), 0);
await p.screenshot({ path: `${out}/community-empty.png`, fullPage: true }); await audit('empty', '[data-testid=community-server]');
answers.push('E2E Shop'); await C.getByRole('button', { name: 'Create server' }).click(); await C.getByRole('heading', { name: 'E2E Shop', exact: true }).waitFor();
answers.push('general'); await C.getByRole('button', { name: 'Create text channel' }).click(); await C.getByRole('heading', { name: '# general', exact: true }).waitFor();
answers.push('ideas'); await C.getByRole('button', { name: 'Create forum' }).click(); await C.getByRole('heading', { name: '# ideas', exact: true }).waitFor(); console.log('community: server, #general and forum #ideas created via UI');
answers.push('Spring menu', 'Add mango lassi'); await C.getByRole('button', { name: 'New thread' }).click(); await C.getByRole('heading', { name: /Spring menu/ }).waitFor(); await C.getByText('Add mango lassi').waitFor(); console.log('community: forum thread created');
await C.getByRole('button', { name: 'Back to #ideas' }).click(); await C.getByRole('button', { name: /Spring menu · 1 message/ }).waitFor();
await C.getByRole('button', { name: '# general' }).click(); await C.getByText('Welcome to #general').waitFor();
await p.getByLabel('Message #general').fill('Order 42 is packed'); await p.keyboard.press('Enter'); await C.getByText('Order 42 is packed').waitFor(); console.log('community: message posted by keyboard');
// SSE: post through the API from outside the page; it must appear without reload.
const snap = await (await p.request.get(`${base}/api/community`)).json(); const gen = snap.channels.find((c) => c.name === 'general');
await C.getByText('Live updates on.').waitFor({ timeout: 15000 });
await api('agentPost', { channelId: gen.id, body: 'Stock for mango is low (3 left).', agent: 'Ledger' });
await C.getByText('Stock for mango is low (3 left).').waitFor({ timeout: 10000 });
const agentMsg = C.getByTestId('cs-msg').filter({ hasText: 'Stock for mango' }); assert.match(await agentMsg.innerText(), /Ledger\s+Agent/i); console.log('community: agent post arrived over SSE without reload, with Agent badge');
// Meta send proposal.
const mine = C.getByTestId('cs-msg').filter({ hasText: 'Order 42 is packed' }); await mine.getByRole('button', { name: 'Send to Meta…' }).click();
await mine.getByLabel('To').fill('+919999999999'); await mine.getByRole('button', { name: 'Propose to Jev' }).click();
await C.getByTestId('cs-note').getByText(/Two different reviewers/).waitFor(); await C.getByText(/whatsapp send proposed by/).waitFor();
const d = (await (await p.request.get(`${base}/api/dispatch`)).json()); const list = d.dispatches ?? d.items ?? d; const pend = (Array.isArray(list) ? list : []).find((x) => String(x.payload?.body ?? x.body ?? JSON.stringify(x)).includes('[community:#general]'));
assert.ok(pend, 'dispatch exists'); assert.equal(pend.status, 'pending'); console.log('community: Meta proposal → dispatch', pend.id.slice(0, 8), pend.status);
const one = await p.request.post(`${base}/api/bos`, { headers: { origin: base }, data: { action: 'museReview', input: { dispatchId: pend.id, payloadHash: pend.payloadHash, approve: true } } }); const oj = await one.json(); console.log('review 1', one.status(), oj.dispatch?.status ?? oj.error);
const two = await p.request.post(`${base}/api/bos`, { headers: { origin: base }, data: { action: 'museReview', input: { dispatchId: pend.id, payloadHash: pend.payloadHash, approve: true } } }); const tj = await two.json(); console.log('review 2 (same reviewer)', two.status(), tj.error ?? tj.dispatch?.status);
assert.notEqual(tj.dispatch?.status, 'approved', 'same reviewer twice must not approve');
const ev = await (await p.request.get(`${base}/api/evidence`)).json(); const acts = JSON.stringify(ev); for (const a of ['community.server.create', 'community.channel.create', 'community.thread.create', 'community.message.post', 'community.agent.post', 'community.meta.proposed']) assert.ok(acts.includes(a), a); console.log('community: evidence rows present for each action');
await p.waitForTimeout(500); await p.screenshot({ path: `${out}/community-data.png`, fullPage: true }); await audit('data', '[data-testid=community-server]');
await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(400); await p.screenshot({ path: `${out}/community-mobile.png`, fullPage: true });
assert.deepEqual(errs, []); console.log('E2E COMMUNITY OK'); await b.close();
