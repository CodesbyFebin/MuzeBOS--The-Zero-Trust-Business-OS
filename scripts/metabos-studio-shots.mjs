/** AI Studio port check + screenshots against a disposable workspace. Needs TEST_BASE_URL. */
import { chromium } from 'playwright';
import { signInOwner } from './browser-sign-in.mjs';
const base = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:4100';
const dir = process.env.SHOTS_DIR ?? '/workspace/shots';
const fail = (m) => { console.error('FAIL', m); process.exitCode = 1; };
const pages = [['cockpit', '/', 'executive-cockpit'], ['registry', '/workspace/brain/employees', 'swarm-registry'], ['stream', '/workflows?view=governed', 'workflow-stream'], ['memory', '/workspace/brain/memory', 'memory-fabric'], ['console', '/workspace/brain/runtime', 'ai-console']];
const browser = await chromium.launch();
try {
  for (const [vp, size] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    const ctx = await browser.newContext({ viewport: size, ...(vp === 'mobile' ? { isMobile: true, hasTouch: true } : {}) });
    const p = await ctx.newPage(); await signInOwner(p, base);
    for (const [name, url, id] of pages) {
      await p.goto(base + url, { waitUntil: 'networkidle' });
      const el = p.locator(`[data-testid="${id}"]`);
      if (!(await el.count())) { fail(`${id} missing on ${url}`); continue; }
      await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(400);
      const t = await el.innerText();
      if (/Loading…/.test(t)) fail(`${id} still loading`);
      if (/Sign in to|cannot read/.test(t)) fail(`${id} refused for owner: ${t.slice(0, 80)}`);
      if (vp === 'desktop' && name === 'cockpit') { await p.click('text=Audit chain'); await p.waitForTimeout(500); if (!(await p.locator('[data-testid="chain-result"], [data-testid="executive-cockpit"] [data-testid="empty"]').count())) fail('audit tab empty'); }
      if (vp === 'desktop' && name === 'console') {
        await p.fill('#mb-console-input', 'Draft a thank-you note to a supplier'); await p.click('text=Propose draft');
        await p.waitForSelector('text=Filed for Jev review', { timeout: 8000 }).catch(() => fail('console draft not filed'));
        if (!(await el.innerText()).includes('awaiting')) console.log('note: console task state', (await el.innerText()).slice(0, 300));
      }
      await el.screenshot({ path: `${dir}/aistudio-${name}-${vp}.png` });
    }
    await ctx.close();
  }
  console.log(process.exitCode ? 'studio shots: FAILED' : 'studio shots: ok');
} finally { await browser.close(); }
