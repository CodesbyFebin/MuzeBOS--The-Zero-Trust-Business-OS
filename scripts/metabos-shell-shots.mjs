/** Shell design check + screenshots (desktop 1440x900, mobile 390x844). Needs TEST_BASE_URL. SHOTS_DIR defaults to /workspace/shots. */
import { chromium } from 'playwright';
const base = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:4100';
const dir = process.env.SHOTS_DIR ?? '/workspace/shots';
const fail = (m) => { console.error('FAIL', m); process.exitCode = 1; };
const browser = await chromium.launch();
try {
  const d = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await d.goto(base + '/workspace/orders', { waitUntil: 'networkidle' });
  const rail = await d.locator('.mb-rail').boundingBox(); if (Math.round(rail.width) !== 56) fail(`rail width ${rail.width}`);
  const top = await d.locator('.mb-topbar').boundingBox(); if (top.height > 60) fail(`topbar height ${top.height}`);
  if (await d.locator('[data-workspace-entry]').count() !== 18) fail('rail entries != 18');
  if (!(await d.locator('[data-testid="brain-pinned"]').isVisible())) fail('brain pin missing');
  if (await d.locator('[data-testid="mobile-tabbar"]').isVisible()) fail('tabbar visible on desktop');
  await d.screenshot({ path: `${dir}/shell-desktop.png` });
  await d.click('[data-testid="details-btn"]'); await d.waitForTimeout(300);
  if (!(await d.locator('#mb-detail-drawer.open').isVisible())) fail('detail drawer did not open');
  await d.screenshot({ path: `${dir}/shell-desktop-drawer.png` });
  await d.keyboard.press('Escape'); await d.waitForTimeout(300);
  await d.click('[data-testid="notifications-btn"]');
  const nt = await d.locator('[data-testid="notifications-panel"]').innerText(); if (/\d+%|1K/.test(nt)) fail('mock-looking figures in notifications');
  await d.keyboard.press('Escape');
  await d.locator('main, body').first().click({ position: { x: 700, y: 600 } }).catch(() => {});
  await d.keyboard.press('Control+k');
  try { await d.getByRole('dialog', { name: 'Command palette' }).waitFor({ timeout: 3000 }); } catch { fail('Ctrl+K did not open search'); }
  await d.keyboard.press('Escape');
  const m = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await m.goto(base + '/', { waitUntil: 'networkidle' });
  const tab = await m.locator('[data-testid="mobile-tabbar"]').boundingBox(); if (!tab || Math.round(tab.height) < 62) fail(`tabbar ${tab?.height}`);
  for (const b of await m.locator('.mb-tab').all()) { const bb = await b.boundingBox(); if (bb.height < 44) fail('tab touch target < 44'); }
  await m.screenshot({ path: `${dir}/shell-mobile.png` });
  await m.click('button[aria-label="More destinations"]'); await m.waitForTimeout(400);
  await m.screenshot({ path: `${dir}/shell-mobile-drawer.png` });
  console.log(process.exitCode ? 'shell shots: FAILED' : 'shell shots: ok', `rail=${rail.width} topbar=${top.height} tab=${tab?.height}`);
} finally { await browser.close(); }
