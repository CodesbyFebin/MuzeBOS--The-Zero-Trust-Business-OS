/** Slice 8 E2E for declarative module pages. Usage: MODULE_BATCH=a node scripts/muzebos-modules-browser.mjs. Use a disposable MUZEBOS_DB. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:4100';
const batch = process.env.MODULE_BATCH || 'a';
const shots = process.env.TEST_SCREENSHOT_DIR;
const BATCHES = {
  a: ['orders/pos-terminal', 'orders/returns-and-refunds', 'orders/gift-cards-and-credits', 'orders/b2b-quote-cpq', 'orders/pre-order-and-waitlist', 'stock/low-stock-alert', 'stock/warehouse-and-location-matrix', 'stock/barcode-and-qr-generator', 'stock/supplier-purchase-orders', 'stock/variant-matrix', 'stock/bundles-and-kits', 'stock/batch-and-expiry', 'stock/serial-number-registry', 'stock/reorder-point-calculator', 'stock/inter-warehouse-transfer', 'stock/shrinkage-and-damage-ledger'],
  b: ['orders/tax-jurisdiction-matrix', 'money/pricing-and-discounts', 'money/multi-currency-converter', 'money/dispute-and-chargeback-logger', 'money/credit-notes', 'money/proforma-to-invoice'],
  c: ['operations/staff-management', 'operations/projects', 'operations/attendance-and-leave', 'operations/time-tracker', 'operations/meeting-notes', 'operations/sop-library', 'operations/vendors-and-purchases', 'operations/incident-log', 'operations/onboarding-checklist', 'operations/asset-assignment', 'operations/performance-review', 'operations/backup-drills', 'operations/compliance-checklist', 'foundation/documents-vault', 'foundation/terms-and-privacy-versions', 'foundation/trademark-and-ip-tracker', 'foundation/license-and-permit-registry', 'foundation/dpia-review', 'foundation/corporate-resolution-log', 'foundation/grievance-and-whistleblower-portal', 'foundation/data-deletion-requests', 'foundation/backup-and-snapshot-ledger'],
  e: ['talk/template-manager', 'talk/canned-replies', 'growth/content-calendar', 'growth/coupon-engine', 'growth/utm-tracker', 'growth/growth-experiments'],
  f: ['orders/subscription-scheduler', 'orders/customer-self-service-portal', 'orders/interaction-scoring', 'orders/poi-location-directory', 'orders/wholesale-contract-ledger', 'orders/attribution-mapper', 'orders/risk-pre-screen', 'money/gst-billing-engine', 'money/tcs-and-tax-collected', 'talk/chat-bot-builder', 'talk/auto-responder', 'talk/bot-to-human-handover', 'talk/csat-survey', 'talk/spam-filter', 'talk/sentiment-monitor', 'talk/reviews-collector', 'stock/bom-configurator', 'stock/consignment-manager', 'stock/pod-asset-matcher', 'stock/rma-stock-isolator', 'growth/online-store-builder', 'growth/website-builder', 'growth/seo-and-content', 'growth/referrals-and-loyalty', 'growth/audience-builder', 'growth/landing-page-builder', 'growth/influencer-tracker', 'growth/trend-spotter', 'growth/a-b-variant-dispatcher', 'operations/file-approvals', 'operations/automation-library', 'builder/media-and-assets-gallery', 'builder/content-block-studio', 'builder/form-and-intake-constructor', 'builder/asset-transform-pipeline', 'builder/deep-linking-registry', 'builder/localization-matrix', 'builder/accessibility-verifier', 'builder/ugc-moderation-desk', 'builder/design-token-exporter', 'builder/app-builder-and-pwa-wrapper', 'builder/design-system-tokens', 'builder/ugc-store-gallery', 'brain/evaluation-harness', 'brain/system-cards-publisher', 'brain/recommendations', 'brain/forecasting', 'brain/anomaly-detector', 'foundation/business-card-studio', 'foundation/aml-transaction-monitor', 'foundation/customs-and-tariff-hsn-engine'],
};
const extra = await import(`./muzebos-modules-flows-${batch}.mjs`).catch(() => null);
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const results = [];
for (const vp of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true }]) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const post = (url, body) => page.request.post(base + url, { data: body, headers: { 'idempotency-key': randomUUID(), origin: base } });
  for (const route of BATCHES[batch]) {
    await page.goto(`${base}/workspace/${route}`, { waitUntil: 'networkidle' });
    const root = page.locator('.mb-module[data-status="available"]'); await root.waitFor();
    await root.locator('[aria-label="Records"]').waitFor();
    await root.getByRole('heading', { name: 'Limits' }).waitFor();
    if (vp.name === 'desktop' && (await root.locator('table').count()) === 0) await root.getByText('records yet', { exact: false }).waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `${route} overflows horizontally by ${overflow}px on ${vp.name}`);
  }
  // Server-side validation surfaces as an error alert; unauthenticated cross-origin writes are refused.
  const bad = await page.request.post(`${base}/api/modules/stock.warehouse-and-location-matrix`, { data: { action: 'create', data: {} }, headers: { 'idempotency-key': randomUUID(), origin: 'http://evil.example' } });
  assert.equal(bad.status(), 403);
  const noKey = await page.request.post(`${base}/api/modules/stock.warehouse-and-location-matrix`, { data: { action: 'create', data: {} }, headers: { origin: base } });
  assert.equal(noKey.status(), 428);
  if (extra) await extra.run({ page, post, base, vp, assert });
  if (shots) await page.screenshot({ path: `${shots}/slice8${batch}-${vp.name}.png`, fullPage: true });
  assert.deepEqual(errors, [], `page errors on ${vp.name}`);
  results.push(`${vp.name}: ${BATCHES[batch].length} pages ok`);
  await page.close();
}
await browser.close();
console.log(`slice8 batch ${batch} browser PASS\n${results.join('\n')}`);
