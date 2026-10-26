import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { annotate } from './evidence';
import type { BusinessStore } from './store';
/**
 * Slice 9c: infra pages show measurements taken now from this process, the SQLite DB and the
 * filesystem. Nothing is simulated; anything not measurable is stated as a limit.
 */
export type Metric = { label: string; value: string };
export type InfraTable = { title: string; columns: string[]; rows: (string | number)[][] };
export type InfraReport = { id: string; metrics: Metric[]; tables: InfraTable[]; limits: string[]; measuredAt: string };
type Ctx = { store: BusinessStore; dbFile: string; root: string };
const kb = (b: number) => b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${(b / 1024).toFixed(1)} KB`;
const q = <T,>(c: Ctx, sql: string, ...a: unknown[]) => c.store.db.prepare(sql).all(...a) as T[];
const one = (c: Ctx, sql: string, ...a: unknown[]) => Number(Object.values(c.store.db.prepare(sql).get(...a) as object)[0] ?? 0);
function walk(dir: string, filter: (f: string) => boolean = () => true, out: { file: string; size: number }[] = [], depth = 0) {
  if (depth > 8 || !fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && !e.name.startsWith('.git')) walk(p, filter, out, depth + 1); }
    else if (filter(p)) out.push({ file: p, size: fs.statSync(p).size });
  }
  return out;
}
const rel = (c: Ctx, p: string) => path.relative(c.root, p);
const srcFiles = (c: Ctx) => [...walk(path.join(c.root, 'components'), (f) => /\.tsx?$/.test(f)), ...walk(path.join(c.root, 'app'), (f) => /\.tsx?$/.test(f))];
const noSrc = 'Source files are read from the working directory; a deployment without sources shows zero.';
const counts = (c: Ctx, table: string, col: string) => q<{ k: string; n: number }>(c, `SELECT ${col} AS k, COUNT(*) AS n FROM ${table} GROUP BY ${col} ORDER BY n DESC`).map((r) => [r.k, r.n]);
const dbSize = (c: Ctx) => c.dbFile === ':memory:' || !fs.existsSync(c.dbFile) ? 0 : fs.statSync(c.dbFile).size + (fs.existsSync(`${c.dbFile}-wal`) ? fs.statSync(`${c.dbFile}-wal`).size : 0);
const pragma = (c: Ctx, p: string) => String(Object.values((c.store.db.pragma(p) as object[])[0] ?? {})[0] ?? '');

const PAGES: Record<string, (c: Ctx) => Omit<InfraReport, 'id' | 'measuredAt'>> = {
  'operations.access-log': (c) => ({ metrics: [{ label: 'Evidence entries', value: String(one(c, 'SELECT COUNT(*) FROM mb_audit')) }, { label: 'Last 24h', value: String(one(c, "SELECT COUNT(*) FROM mb_audit WHERE createdAt >= ?", new Date(Date.now() - 86_400_000).toISOString())) }],
    tables: [{ title: 'Latest 50 actions', columns: ['When', 'Action', 'Target'], rows: q<{ createdAt: string; action: string; target: string }>(c, 'SELECT createdAt, action, target FROM mb_audit ORDER BY seq DESC LIMIT 50').map((r) => [r.createdAt, r.action, r.target]) }],
    limits: ['Shows writes recorded in the evidence log. Page views and reads are not logged.'] }),
  'builder.component-dependency-tree': (c) => {
    const files = srcFiles(c).filter((f) => f.file.includes(`${path.sep}components${path.sep}muzebos`));
    const rows = files.map((f) => { const s = fs.readFileSync(f.file, 'utf8'); return [rel(c, f.file), (s.match(/^import .* from '@\/components\/[^']+'/gm) ?? []).length, (s.match(/^import /gm) ?? []).length]; }).sort((a, b) => Number(b[1]) - Number(a[1]));
    return { metrics: [{ label: 'MuzeBOS components', value: String(files.length) }], tables: [{ title: 'Imports per component', columns: ['File', 'Component imports', 'All imports'], rows }], limits: [noSrc, 'Counts static import lines; dynamic imports are not followed.'] };
  },
  'builder.hydration-optimizer': (c) => {
    const files = srcFiles(c); const client = files.filter((f) => /^['"]use client['"]/.test(fs.readFileSync(f.file, 'utf8')));
    return { metrics: [{ label: 'Source files', value: String(files.length) }, { label: "'use client' files", value: String(client.length) }, { label: 'Client source size', value: kb(client.reduce((a, f) => a + f.size, 0)) }],
      tables: [{ title: 'Largest client components', columns: ['File', 'Size'], rows: client.sort((a, b) => b.size - a.size).slice(0, 20).map((f) => [rel(c, f.file), kb(f.size)]) }], limits: [noSrc, 'Measures source size, not hydration time in a browser.'] };
  },
  'builder.ssr-state-hydrator': (c) => {
    const pages = walk(path.join(c.root, 'app'), (f) => /(page|route)\.tsx?$/.test(f));
    const dyn = pages.filter((f) => /force-dynamic/.test(fs.readFileSync(f.file, 'utf8')));
    return { metrics: [{ label: 'Pages and routes', value: String(pages.length) }, { label: 'force-dynamic (rendered per request)', value: String(dyn.length) }], tables: [{ title: 'Per-request rendered', columns: ['File'], rows: dyn.slice(0, 100).map((f) => [rel(c, f.file)]) }], limits: [noSrc] };
  },
  'builder.font-and-icon-optimizer': (c) => {
    const media = walk(path.join(c.root, '.next', 'static', 'media'));
    const lucide = srcFiles(c).filter((f) => fs.readFileSync(f.file, 'utf8').includes("from 'lucide-react'")).length;
    return { metrics: [{ label: 'Built font/media files', value: String(media.length) }, { label: 'Built media size', value: kb(media.reduce((a, f) => a + f.size, 0)) }, { label: 'Files importing lucide-react', value: String(lucide) }],
      tables: [{ title: 'Built media', columns: ['File', 'Size'], rows: media.sort((a, b) => b.size - a.size).slice(0, 30).map((f) => [path.basename(f.file), kb(f.size)]) }], limits: ['Reads .next/static/media from the last build; nothing is re-optimised.'] };
  },
  'builder.static-build-pipeline': (c) => {
    const id = path.join(c.root, '.next', 'BUILD_ID'); const has = fs.existsSync(id);
    const chunks = walk(path.join(c.root, '.next', 'static'));
    return { metrics: [{ label: 'Build id', value: has ? fs.readFileSync(id, 'utf8').trim() : 'no build found' }, { label: 'Built at', value: has ? fs.statSync(id).mtime.toISOString() : '—' }, { label: 'Static files', value: String(chunks.length) }, { label: 'Static size', value: kb(chunks.reduce((a, f) => a + f.size, 0)) }],
      tables: [{ title: 'Largest static files', columns: ['File', 'Size'], rows: chunks.sort((a, b) => b.size - a.size).slice(0, 20).map((f) => [rel(c, f.file), kb(f.size)]) }], limits: ['Reports the last build on disk. Builds are not triggered from here.'] };
  },
  'system.static-asset-pipeline': (c) => {
    const pub = walk(path.join(c.root, 'public'));
    return { metrics: [{ label: 'Public files', value: String(pub.length) }, { label: 'Public size', value: kb(pub.reduce((a, f) => a + f.size, 0)) }], tables: [{ title: 'Largest public assets', columns: ['File', 'Size'], rows: pub.sort((a, b) => b.size - a.size).slice(0, 20).map((f) => [rel(c, f.file), kb(f.size)]) }], limits: ['Assets are served as-is; no transform pipeline runs.'] };
  },
  'brain.run-summary-and-evidence': (c) => {
    const chain = annotate(q(c, 'SELECT * FROM mb_audit ORDER BY seq'));
    return { metrics: [{ label: 'Workflow runs', value: String(one(c, 'SELECT COUNT(*) FROM mb_workflow_runs')) }, { label: 'Evidence chain', value: chain.valid ? 'valid' : `broken at #${chain.firstBrokenSeq}` }, { label: 'Head hash', value: chain.headHash?.slice(0, 16) ?? '—' }], tables: [{ title: 'Runs by status', columns: ['Status', 'Runs'], rows: counts(c, 'mb_workflow_runs', 'status') }], limits: ['Hash chain is verified now over every evidence row.'] };
  },
  'foundation.data-residency-controls': (c) => ({ metrics: [{ label: 'Database file', value: c.dbFile }, { label: 'Database size', value: kb(dbSize(c)) }, { label: 'Host', value: os.hostname() }, { label: 'Process time zone', value: Intl.DateTimeFormat().resolvedOptions().timeZone }, { label: 'Cloud region env', value: process.env.VERCEL_REGION ?? process.env.FLY_REGION ?? process.env.AWS_REGION ?? 'not set' }], tables: [],
    limits: ['All business data lives in this one SQLite file on this host. There is no replication or region pinning.'] }),
  'foundation.encryption-configuration': (c) => ({ metrics: [{ label: 'Database at rest', value: 'not encrypted (plain SQLite)' }, { label: 'Evidence integrity', value: 'sha256 hash chain' }, { label: 'OpenSSL', value: process.versions.openssl }, { label: 'TLS min version (Node default)', value: (process.env.NODE_OPTIONS ?? '').includes('tls-min') ? 'custom' : 'TLSv1.2' }, { label: 'Provider secrets stored', value: `0 (only env refs: ${one(c, "SELECT COUNT(*) FROM sqlite_master WHERE name='mb_provider_config'") ? one(c, "SELECT COUNT(*) FROM mb_provider_config WHERE field <> '__lastTest'") : 0})` }], tables: [],
    limits: ['Use disk encryption on the host. TLS is terminated by whatever proxy fronts this server.'] }),
  'system.workflows-broker': (c) => ({ metrics: [{ label: 'Runs', value: String(one(c, 'SELECT COUNT(*) FROM mb_workflow_runs')) }, { label: 'Events', value: String(one(c, 'SELECT COUNT(*) FROM mb_workflow_events')) }], tables: [{ title: 'Runs by workflow', columns: ['Workflow', 'Runs'], rows: counts(c, 'mb_workflow_runs', 'workflowId') }], limits: ['In-process durable runner backed by SQLite; no external broker.'] }),
  'system.database-migration-ledger': (c) => ({ metrics: [{ label: 'Applied migrations', value: String(one(c, 'SELECT COUNT(*) FROM mb_migrations')) }, { label: 'Latest version', value: String(one(c, 'SELECT MAX(version) FROM mb_migrations')) }, { label: 'Tables', value: String(one(c, "SELECT COUNT(*) FROM sqlite_master WHERE type='table'")) }],
    tables: [{ title: 'Ledger', columns: ['Version', 'Applied at'], rows: q<{ version: number; applied_at: string }>(c, 'SELECT * FROM mb_migrations ORDER BY version').map((r) => [r.version, r.applied_at]) }], limits: ['Migrations run on startup; no rollback.'] }),
  'system.api-gateway-and-rate-limiter': (c) => {
    const routes = walk(path.join(c.root, 'app', 'api'), (f) => /route\.tsx?$/.test(f));
    return { metrics: [{ label: 'API routes', value: String(routes.length) }, { label: 'Idempotent commands stored', value: String(one(c, 'SELECT COUNT(*) FROM mb_commands')) }, { label: 'Rate limiter', value: 'none in this process' }], tables: [{ title: 'Routes', columns: ['Route'], rows: routes.map((f) => [path.dirname(rel(c, f.file)).replace(/^app/, '')]) }],
      limits: ['Writes require same-origin, operator session (or loopback) and an Idempotency-Key. There is no request rate limiter; put one in the fronting proxy.', noSrc] };
  },
  'system.task-queue-orchestrator': (c) => ({ metrics: [{ label: 'Running', value: String(one(c, "SELECT COUNT(*) FROM mb_workflow_runs WHERE status='running'")) }, { label: 'Awaiting approval', value: String(one(c, "SELECT COUNT(*) FROM mb_workflow_runs WHERE status='awaiting_approval'")) }, { label: 'Pending steps', value: String(one(c, "SELECT COUNT(*) FROM mb_workflow_steps WHERE status='pending'")) }, { label: 'Open reminders', value: String(one(c, "SELECT COUNT(*) FROM mb_reminders WHERE status='open'")) }], tables: [], limits: ['The queue is the workflow tables; there is no separate worker pool.'] }),
  'system.telemetry-and-logs': () => { const m = process.memoryUsage(), cpu = process.cpuUsage();
    return { metrics: [{ label: 'Uptime', value: `${Math.round(process.uptime())} s` }, { label: 'RSS', value: kb(m.rss) }, { label: 'Heap used', value: kb(m.heapUsed) }, { label: 'CPU user', value: `${Math.round(cpu.user / 1000)} ms` }, { label: 'CPU system', value: `${Math.round(cpu.system / 1000)} ms` }, { label: 'Load average (1m)', value: os.loadavg()[0].toFixed(2) }], tables: [], limits: ['Point-in-time values for this Node process; no history is kept.'] }; },
  'system.container-console': () => { let cg = 'not readable'; try { cg = fs.readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim(); } catch { /* not in a cgroup v2 container */ }
    return { metrics: [{ label: 'Platform', value: `${os.platform()} ${os.release()}` }, { label: 'Node', value: process.version }, { label: 'PID', value: String(process.pid) }, { label: 'CPUs', value: String(os.cpus().length) }, { label: 'Memory free / total', value: `${kb(os.freemem())} / ${kb(os.totalmem())}` }, { label: 'cgroup memory.max', value: cg }], tables: [], limits: ['Read-only. There is no shell or exec from the browser.'] }; },
  'system.connection-pool-optimizer': (c) => ({ metrics: [{ label: 'Connections', value: '1 (better-sqlite3, synchronous)' }, { label: 'journal_mode', value: pragma(c, 'journal_mode') }, { label: 'busy_timeout', value: `${pragma(c, 'busy_timeout')} ms` }, { label: 'page_size', value: pragma(c, 'page_size') }, { label: 'page_count', value: pragma(c, 'page_count') }, { label: 'freelist_count', value: pragma(c, 'freelist_count') }, { label: 'cache_size', value: pragma(c, 'cache_size') }], tables: [], limits: ['SQLite uses one in-process connection; there is no pool to tune.'] }),
  'system.zero-trust-network-access': (c) => ({ metrics: [{ label: 'Operator password configured', value: process.env.MUZEBOS_PASSWORD_HASH || fs.existsSync(path.join(c.root, 'data', 'auth.json')) ? 'yes' : 'see Settings' }, { label: 'Pinned origin', value: process.env.MUZEBOS_ORIGIN ?? 'request host' }, { label: 'Webhook deliveries stored', value: String(one(c, 'SELECT COUNT(*) FROM mb_webhook_deliveries')) }], tables: [{ title: 'Enforced policy', columns: ['Rule'], rows: [['Remote access requires an operator session; without a password only loopback is allowed'], ['Writes require same-origin Origin and reject cross-site fetches'], ['Writes require an Idempotency-Key UUID'], ['Webhooks require a valid signature']] }], limits: ['Policy is enforced per request in code; there is no network-layer ZTNA.'] }),
  'system.dead-letter-remediation': (c) => ({ metrics: [{ label: 'Failed runs', value: String(one(c, "SELECT COUNT(*) FROM mb_workflow_runs WHERE status IN ('failed','timed_out')")) }, { label: 'Failed steps', value: String(one(c, "SELECT COUNT(*) FROM mb_workflow_steps WHERE status='failed'")) }],
    tables: [{ title: 'Failed runs', columns: ['Run', 'Workflow', 'Status', 'Error', 'Updated'], rows: q<{ id: string; workflowId: string; status: string; error: string | null; updatedAt: string }>(c, "SELECT id, workflowId, status, error, updatedAt FROM mb_workflow_runs WHERE status IN ('failed','timed_out') ORDER BY updatedAt DESC LIMIT 50").map((r) => [r.id, r.workflowId, r.status, r.error ?? '', r.updatedAt]) }], limits: ['Retry or compensate from the workflow run page.'] }),
  'system.crash-dump-parser': (c) => { const dumps = walk(c.root, (f) => /(^|\/)(core(\.\d+)?|report\..*\.json)$/.test(f) && !f.includes('.next'), [], 6);
    return { metrics: [{ label: 'Node diagnostic reports / core files', value: String(dumps.length) }, { label: 'Failed workflow step errors', value: String(one(c, "SELECT COUNT(*) FROM mb_workflow_steps WHERE error IS NOT NULL")) }], tables: [{ title: 'Recent step errors', columns: ['Run', 'Step', 'Error'], rows: q<{ runId: string; stepId: string; error: string }>(c, 'SELECT runId, stepId, error FROM mb_workflow_steps WHERE error IS NOT NULL ORDER BY updatedAt DESC LIMIT 30').map((r) => [r.runId, r.stepId, r.error]) }], limits: ['Lists diagnostic files found in the working directory; they are not parsed.'] }; },
};
export const INFRA_IDS = Object.keys(PAGES);
export function infraReport(store: BusinessStore, id: string, opts: { dbFile?: string; root?: string } = {}): InfraReport | null {
  const fn = PAGES[id]; if (!fn) return null;
  return { id, ...fn({ store, dbFile: opts.dbFile ?? (store.db.name || ':memory:'), root: opts.root ?? process.cwd() }), measuredAt: new Date().toISOString() };
}
