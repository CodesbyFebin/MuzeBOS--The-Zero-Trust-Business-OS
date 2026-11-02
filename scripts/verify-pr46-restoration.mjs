/** Qualify the restored shell against a disposable MeTaBos server. No provider/model calls. */
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { signInOwner } from './browser-sign-in.mjs';

const base = process.env.TEST_BASE_URL;
if (!base) throw new Error('TEST_BASE_URL must point to a disposable local test workspace');
const shots = process.env.SHOTS_DIR;
if (shots) mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({
  ...(process.env.TEST_CHROMIUM_PATH ? { executablePath: process.env.TEST_CHROMIUM_PATH } : {}),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  // A normal first visit must open the workspace, not an automatic intro overlay.
  await desktop.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
  const page = await desktop.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/workspace/orders`, { waitUntil: 'networkidle' });
  await page.locator('.mb-secondary').waitFor();
  assert.equal(await page.locator('[data-workspace-entry]').count(), 18);
  assert.equal(await page.locator('.mb-pinned-nav [data-workspace-entry]').count(), 5);
  assert.equal(await page.locator('.mb-intro').count(), 0);
  for (const [selector, size, dimension] of [['.mb-rail', 56, 'width'], ['.mb-secondary', 248, 'width'], ['.mb-topbar', 52, 'height']]) {
    const box = await page.locator(selector).boundingBox();
    const actual = Math.round(box?.[dimension] ?? 0);
    // The sidebar's 1px divider is inside the allocated secondary-panel width.
    if (selector === '.mb-secondary') assert(Math.abs(actual - size) <= 1, `${selector} width ${actual}`);
    else assert.equal(actual, size, `${selector} ${dimension}`);
  }
  assert(await page.getByTestId('brain-pinned').isVisible());
  assert(!(await page.getByTestId('mobile-tabbar').isVisible()));
  await page.getByTestId('details-btn').click();
  await page.locator('#mb-detail-drawer.open').waitFor();
  assert((await page.locator('#mb-detail-drawer').innerText()).includes('Orders'));
  await page.keyboard.press('Escape');
  await page.getByTestId('notifications-btn').click();
  assert((await page.getByTestId('notifications-panel').innerText()).includes('Sign in'));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k');
  await page.getByRole('dialog', { name: 'Command palette' }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Collapse secondary panel' }).click();
  assert.equal(await page.locator('.mb-secondary').count(), 0);
  await page.getByRole('button', { name: 'Expand secondary panel' }).click();
  assert(await page.getByTestId('brain-pinned').isVisible());
  if (shots) await page.screenshot({ path: path.join(shots, 'restored-shell-desktop.png') });

  await signInOwner(page, base);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByTestId('hub-kpis-orders').waitFor();
  assert.equal(await page.getByTestId('hub-kpis-orders').count(), 1, 'newer page widgets are preserved');
  await page.getByTestId('profile-btn').click();
  assert((await page.getByRole('dialog', { name: 'Profile' }).innerText()).includes('Test Owner'));
  await page.keyboard.press('Escape');
  await page.getByTestId('notifications-btn').click();
  await page.getByTestId('notifications-panel').getByText('No records yet', { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await page.goto(`${base}/workspace/brain/voice`, { waitUntil: 'networkidle' });
  assert(await page.getByTestId('voice-assistant').isVisible(), 'newer voice page is preserved');

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const phone = await mobile.newPage();
  phone.on('pageerror', (error) => errors.push(error.message));
  await phone.goto(`${base}/workspace/orders`, { waitUntil: 'networkidle' });
  const tab = await phone.getByTestId('mobile-tabbar').boundingBox();
  assert.equal(Math.round(tab?.height ?? 0), 62);
  for (const target of await phone.locator('.mb-tab').all()) assert((await target.boundingBox()).height >= 44);
  await phone.getByRole('button', { name: 'More destinations' }).click();
  assert.equal(await phone.locator('html').getAttribute('data-mb-drawer'), 'open');
  await phone.locator('[data-workspace-entry="stock"]').click();
  await phone.waitForURL('**/workspace/stock');
  await phone.waitForFunction(() => !document.documentElement.hasAttribute('data-mb-drawer'));
  assert(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  if (shots) await phone.screenshot({ path: path.join(shots, 'restored-shell-mobile.png') });
  assert.deepEqual(errors, []);
  console.log('PASS: PR46 geometry, 18 destinations/5 pinned, Brain, search, details, live account/notification states, newer voice page, mobile tabs/drawer, no browser runtime errors.');
} finally { await browser.close(); }
