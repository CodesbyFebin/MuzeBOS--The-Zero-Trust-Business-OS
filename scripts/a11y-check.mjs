// Accessibility CI check: runs lib/metabos/b3/a11y-checks.ts in Playwright on key pages. Usage: node scripts/a11y-check.mjs <baseUrl>
import { chromium } from 'playwright';
import { buildSync } from 'esbuild';
const base = process.argv[2];
const code = buildSync({ entryPoints: ['lib/metabos/b3/a11y-checks.ts'], bundle: true, format: 'iife', globalName: 'A11y', write: false }).outputFiles[0].text;
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await p.request.post(`${base}/api/metabos/auth`, { headers: { origin: base }, data: { action: 'setup', setup: { workspace: 'A11y Check', name: 'Owner', email: 'a11y@example.com', password: 'a11y-only-Passw0rd!' } } });
const pages = ['/', '/workspace/orders', '/workspace/money', '/workspace/talk', '/workspace/brain/voice', '/workspace/growth/social', '/workspace/operations/pipelines', '/workspace/settings/language', '/workspace/system/accessibility'];
const out = {};
for (const path of pages) { await p.goto(base + path, { waitUntil: 'networkidle' }); await p.addScriptTag({ content: code }); out[path] = await p.evaluate(() => A11y.auditDocument(document)); }
await b.close();
const summary = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { issues: v.length, byRule: v.reduce((a, i) => (a[i.rule] = (a[i.rule] ?? 0) + 1, a), {}) }]));
console.log(JSON.stringify(summary, null, 1));
process.exitCode = Object.values(out).some((v) => v.some((i) => i.rule !== 'target-size')) ? 1 : 0;
