/** Opening intro, brand lockup, side panel and widgets check + screenshots. Needs TEST_BASE_URL. */
import { chromium } from 'playwright';
import { signInOwner } from './browser-sign-in.mjs';
const base = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:4100';
const dir = process.env.SHOTS_DIR ?? '/workspace/shots';
const fail = (m) => { console.error('FAIL', m); process.exitCode = 1; };
const browser = await chromium.launch();
try {
  for (const [vp, size, motion] of [['desktop', { width: 1440, height: 900 }, 'no-preference'], ['mobile', { width: 390, height: 844 }, 'reduce']]) {
    const ctx = await browser.newContext({ viewport: size, reducedMotion: motion, ...(vp === 'mobile' ? { isMobile: true, hasTouch: true } : {}) });
    const p = await ctx.newPage(); const errors = []; p.on('pageerror', (e) => errors.push(e.message));
    await signInOwner(p, base);
    await p.goto(base + '/?intro=1', { waitUntil: 'networkidle' });
    const intro = p.locator('[data-testid="opening-intro"]');
    if (!(await intro.isVisible())) fail(`${vp}: intro not shown`);
    await p.waitForTimeout(1900);
    if (!(await p.locator('[data-testid="intro-caption"]').innerText()).trim()) fail('no caption');
    if (await p.evaluate(() => document.activeElement?.textContent) !== 'Skip intro') fail('skip not focused');
    await p.screenshot({ path: `${dir}/intro-${vp}.png` });
    await p.keyboard.press('Escape');
    if (await intro.count()) fail('Escape did not close intro');
    await p.goto(base + '/', { waitUntil: 'networkidle' });
    if (await intro.count()) fail('intro shown twice in a session');
    if (!(await p.locator('[data-testid="w-voice"]').count())) fail('widgets missing');
    if (/Loading…/.test(await p.locator('.mb-widgets').innerText())) fail('widgets still loading');
    await p.locator('.mb-widgets').scrollIntoViewIfNeeded();
    await p.locator('.mb-widgets').screenshot({ path: `${dir}/widgets-${vp}.png` });
    if (vp === 'desktop') {
      await p.goto(base + '/workspace/brain/memory', { waitUntil: 'networkidle' });
      if (!(await p.locator('.l-side-lockup:visible img[src*="metabos-mark.svg"]').count())) fail('rail logo is not the M mark svg');
      if (await p.locator('[data-workspace-entry]').count() !== 18) fail('rail != 18');
      await p.screenshot({ path: `${dir}/sidepanel-desktop.png`, clip: { x: 0, y: 0, width: 420, height: 900 } });
    }
    if (errors.length) fail(`${vp} page errors: ${errors.join('; ')}`);
    await ctx.close();
  }
  console.log(process.exitCode ? 'intro shots: FAILED' : 'intro shots: ok');
} finally { await browser.close(); }
