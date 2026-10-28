/**
 * Data, privacy and growth: a read-only "Ask your data" analyst, DPDP data-subject export and redaction,
 * and monthly sales goals against invoiced and collected actuals. All on the real SQLite store.
 * Clean-room. The NL to SQL idea follows the ADK data-science sample (Apache-2.0), and export/redact
 * follows DeskcommCRM (MIT). No code copied.
 */
import { createHash, randomUUID } from 'node:crypto';
import { BusinessError, type BusinessStore } from '../store';

const iso = () => new Date().toISOString();
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

// ---------- Ask your data (read-only) ----------
/** Tables an owner may query. Members, sessions, credentials, audit and keys are never readable here. */
export const QUERYABLE = ['mb_customers', 'mb_products', 'mb_orders', 'mb_invoices', 'mb_bookings', 'mb_module_records', 'mb_conversations', 'mb_messages', 'mb_flow_runs', 'mb_agent_usage'] as const;
type Intent = { id: string; label: string; match: RegExp; sql: (m: RegExpMatchArray) => { sql: string; params: unknown[] } };
const days = (m: RegExpMatchArray, i: number, d = 30) => Math.min(365, Math.max(1, Number(m[i]) || d));
const since = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
export const INTENTS: Intent[] = [
  { id: 'revenue', label: 'Revenue in the last N days', match: /\b(revenue|sales|invoiced|billed)\b(?:.*?\b(\d{1,3})\s*days?)?/i, sql: (m) => ({ sql: "SELECT COUNT(*) AS invoices, COALESCE(SUM(json_extract(payload,'$.total')),0) AS total_paise FROM mb_invoices WHERE createdAt >= ?", params: [since(days(m, 2))] }) },
  { id: 'pending', label: 'Unpaid invoices', match: /\b(unpaid|pending|outstanding|overdue|owe)\b/i, sql: () => ({ sql: "SELECT number, json_extract(payload,'$.customer.name') AS customer, json_extract(payload,'$.total') AS total_paise, createdAt FROM mb_invoices WHERE payment='pending' ORDER BY createdAt LIMIT 50", params: [] }) },
  { id: 'top-customers', label: 'Top customers by invoiced value', match: /\b(top|best|biggest)\b.*\bcustomers?\b/i, sql: () => ({ sql: "SELECT json_extract(payload,'$.customer.name') AS customer, COUNT(*) AS invoices, SUM(json_extract(payload,'$.total')) AS total_paise FROM mb_invoices GROUP BY json_extract(payload,'$.customer.id') ORDER BY total_paise DESC LIMIT 10", params: [] }) },
  { id: 'top-products', label: 'Top products by units invoiced', match: /\b(top|best)\b.*\b(products?|items?|sellers?)\b/i, sql: () => ({ sql: "SELECT json_extract(l.value,'$.name') AS product, SUM(json_extract(l.value,'$.quantity')) AS units, SUM(json_extract(l.value,'$.total')) AS total_paise FROM mb_invoices i, json_each(json_extract(i.payload,'$.lines')) l GROUP BY product ORDER BY units DESC LIMIT 10", params: [] }) },
  { id: 'low-stock', label: 'Low stock products', match: /\b(low|out of)\s*stock\b|\bstock\b/i, sql: () => ({ sql: 'SELECT name, sku, stock FROM mb_products WHERE stock <= 5 ORDER BY stock LIMIT 50', params: [] }) },
  { id: 'customers', label: 'How many customers', match: /\b(how many|count|number of)\b.*\bcustomers?\b/i, sql: () => ({ sql: 'SELECT COUNT(*) AS customers FROM mb_customers', params: [] }) },
];
export type Answer = { intent: string | null; label: string; sql: string; columns: string[]; rows: Record<string, unknown>[]; note: string };
function execReadOnly(s: BusinessStore, sql: string, params: unknown[]): Record<string, unknown>[] {
  const st = s.db.prepare(sql);
  if (!st.readonly || !st.reader) throw new BusinessError('Only read-only SELECT statements are allowed', 422);
  return st.all(...params) as Record<string, unknown>[];
}
export function ask(s: BusinessStore, question: string): Answer {
  const q = question.trim().slice(0, 300);
  for (const i of INTENTS) { const m = q.match(i.match); if (m) { const { sql, params } = i.sql(m); const rows = execReadOnly(s, sql, params); return { intent: i.id, label: i.label, sql, columns: rows[0] ? Object.keys(rows[0]) : [], rows, note: rows.length ? 'Matched a fixed question pattern; the SQL shown is exactly what ran.' : 'No records yet' }; } }
  return { intent: null, label: 'Not understood', sql: '', columns: [], rows: [], note: `No matching question. Try: ${INTENTS.map((i) => i.label.toLowerCase()).join('; ')}. Owners can also run a read-only SELECT.` };
}
/** Owner-written SQL: one SELECT over allowed tables, verified read-only by SQLite, capped at 200 rows. */
export function runSelect(s: BusinessStore, sql: string): Answer {
  const t = sql.trim().replace(/;\s*$/, '');
  if (t.length > 2000) throw new BusinessError('Query too long', 413);
  if (!/^(select|with)\b/i.test(t) || t.includes(';')) throw new BusinessError('One SELECT statement only', 422);
  if (/\b(pragma|attach|detach|vacuum|load_extension|sqlite_master|sqlite_schema|readfile|writefile)\b/i.test(t)) throw new BusinessError('That keyword is not allowed', 422);
  // Any identifier that names a real table must be on the allow list, wherever it appears (FROM, JOIN, comma joins, subqueries).
  const all = (s.db.prepare("SELECT lower(name) n FROM sqlite_master WHERE type IN ('table','view')").all() as { n: string }[]).map((r) => r.n);
  const words = new Set([...t.matchAll(/[A-Za-z_][\w]*/g)].map((m) => m[0].toLowerCase()));
  const bad = all.filter((n) => words.has(n) && !(QUERYABLE as readonly string[]).includes(n));
  if (bad.length) throw new BusinessError(`Table not allowed: ${bad.join(', ')}`, 403);
  const rows = execReadOnly(s, `SELECT * FROM (${t}) LIMIT 200`, []);
  return { intent: null, label: 'Owner SELECT', sql: t, columns: rows[0] ? Object.keys(rows[0]) : [], rows, note: rows.length ? `${rows.length} row(s), limited to 200` : 'No records yet' };
}

// ---------- DPDP data-subject export / redact ----------
function ensurePrivacy(s: BusinessStore) { s.db.exec('CREATE TABLE IF NOT EXISTS mb_privacy_requests(id TEXT PRIMARY KEY, kind TEXT NOT NULL, customerId TEXT NOT NULL, addresses TEXT NOT NULL, summary TEXT NOT NULL, by TEXT NOT NULL, at TEXT NOT NULL)'); }
const hasTable = (s: BusinessStore, n: string) => Boolean(s.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(n));
function subject(s: BusinessStore, customerId: string, addresses: string[]) {
  const customer = s.db.prepare('SELECT * FROM mb_customers WHERE id=?').get(customerId) as { id: string; name: string; email: string } | undefined;
  if (!customer) throw new BusinessError('Customer not found', 404);
  const addrs = [...new Set([customer.email, ...addresses].map((a) => a.trim().toLowerCase().replace(/^\+/, '')).filter(Boolean))];
  const orders = s.orders().filter((o) => o.payload.customer.id === customerId);
  const invoices = s.invoices().filter((i) => i.payload.customer.id === customerId);
  const bookings = s.db.prepare('SELECT * FROM mb_bookings WHERE customerId=?').all(customerId);
  const conversations = hasTable(s, 'mb_conversations') && addrs.length ? s.db.prepare(`SELECT * FROM mb_conversations WHERE lower(ltrim(address,'+')) IN (${addrs.map(() => '?').join(',')})`).all(...addrs) as { id: string }[] : [];
  const messages = conversations.length ? s.db.prepare(`SELECT * FROM mb_messages WHERE conversationId IN (${conversations.map(() => '?').join(',')})`).all(...conversations.map((c) => c.id)) : [];
  const refs = s.db.prepare("SELECT id,module,status,data FROM mb_module_records WHERE data LIKE ?").all(`%${customerId}%`) as { data: string }[];
  return { customer, addrs, orders, invoices, bookings, conversations, messages, moduleRecords: refs.map((r) => ({ ...r, data: JSON.parse(r.data) })) };
}
export function exportSubject(s: BusinessStore, actor: string, customerId: string, addresses: string[] = []) {
  ensurePrivacy(s); const d = subject(s, customerId, addresses);
  const bundle = { generatedAt: iso(), law: 'DPDP Act 2023, right to access (s.11)', ...d, addrs: undefined, addresses: d.addrs };
  const summary = `${d.orders.length} orders, ${d.invoices.length} invoices, ${d.bookings.length} bookings, ${d.conversations.length} conversations, ${d.messages.length} messages, ${d.moduleRecords.length} module records`;
  s.db.prepare('INSERT INTO mb_privacy_requests VALUES(?,?,?,?,?,?,?)').run(randomUUID(), 'export', customerId, JSON.stringify(d.addrs), summary, actor, iso());
  s.appendEvidence('privacy.export', customerId, `${summary} exported by ${actor}`);
  return bundle;
}
/**
 * Erasure keeps the legally required financial records (invoice numbers, amounts, tax) but replaces personal
 * fields with a stable pseudonym, and blanks message text. Opt-outs are kept so we never message them again.
 */
export function redactSubject(s: BusinessStore, actor: string, customerId: string, confirm: string, addresses: string[] = []) {
  ensurePrivacy(s); const d = subject(s, customerId, addresses);
  if (confirm !== d.customer.name) throw new BusinessError('Type the customer name exactly to confirm redaction', 422);
  if (d.orders.some((o) => o.status === 'awaiting_review')) throw new BusinessError('Resolve the orders awaiting review first; their approval hash covers the customer details', 409);
  const alias = `Redacted ${createHash('sha256').update(customerId).digest('hex').slice(0, 8)}`;
  const scrub = (p: any) => ({ ...p, customer: { ...p.customer, name: alias, email: '' } });
  s.transact(() => {
    s.db.prepare('UPDATE mb_customers SET name=?, email=? WHERE id=?').run(alias, '', customerId);
    for (const o of d.orders) s.db.prepare('UPDATE mb_orders SET payload=? WHERE id=?').run(JSON.stringify(scrub(o.payload)), o.id);
    for (const i of d.invoices) s.db.prepare('UPDATE mb_invoices SET payload=? WHERE id=?').run(JSON.stringify(scrub(i.payload)), i.id);
    for (const c of d.conversations) { s.db.prepare("UPDATE mb_conversations SET name=NULL, address=? WHERE id=?").run(`redacted:${c.id.slice(0, 8)}`, c.id); s.db.prepare("UPDATE mb_messages SET body='[redacted]' WHERE conversationId=?").run(c.id); }
  });
  const summary = `${d.orders.length} orders, ${d.invoices.length} invoices and ${d.conversations.length} conversations pseudonymised as ${alias}`;
  s.db.prepare('INSERT INTO mb_privacy_requests VALUES(?,?,?,?,?,?,?)').run(randomUUID(), 'redact', customerId, '[]', summary, actor, iso());
  s.appendEvidence('privacy.redact', customerId, `${summary} by ${actor}`);
  return { alias, summary };
}
export function privacyLog(s: BusinessStore) { ensurePrivacy(s); return s.db.prepare('SELECT id,kind,customerId,summary,by,at FROM mb_privacy_requests ORDER BY at DESC LIMIT 100').all(); }

// ---------- Sales goals vs actuals ----------
function ensureGoals(s: BusinessStore) { s.db.exec('CREATE TABLE IF NOT EXISTS mb_sales_goals(period TEXT PRIMARY KEY, targetMinor INTEGER NOT NULL CHECK(targetMinor>=0), by TEXT NOT NULL, at TEXT NOT NULL)'); }
export function setSalesGoal(s: BusinessStore, actor: string, period: string, targetMinor: number) {
  ensureGoals(s);
  if (!MONTH.test(period)) throw new BusinessError('Period must be YYYY-MM', 422);
  if (!Number.isSafeInteger(targetMinor) || targetMinor < 0) throw new BusinessError('Target must be whole paise', 422);
  s.db.prepare('INSERT INTO mb_sales_goals VALUES(?,?,?,?) ON CONFLICT(period) DO UPDATE SET targetMinor=excluded.targetMinor, by=excluded.by, at=excluded.at').run(period, targetMinor, actor, iso());
  s.appendEvidence('sales.goal-set', period, `Target ${targetMinor} paise by ${actor}`);
}
export function salesGoals(s: BusinessStore, now = new Date()) {
  ensureGoals(s);
  const goals = s.db.prepare('SELECT * FROM mb_sales_goals ORDER BY period DESC LIMIT 24').all() as { period: string; targetMinor: number }[];
  const inv = s.invoices(); const cur = now.toISOString().slice(0, 7);
  const periods = [...new Set([cur, ...goals.map((g) => g.period)])].sort().reverse();
  return periods.map((period) => {
    const mine = inv.filter((i) => i.createdAt.slice(0, 7) === period);
    const invoiced = mine.reduce((t, i) => t + i.payload.total, 0); const collected = mine.filter((i) => i.payment === 'manually_reconciled').reduce((t, i) => t + i.payload.total, 0);
    const g = goals.find((x) => x.period === period);
    return { period, targetMinor: g?.targetMinor ?? null, invoicedMinor: invoiced, collectedMinor: collected, invoices: mine.length, pctOfTarget: g && g.targetMinor > 0 ? Math.round((invoiced / g.targetMinor) * 1000) / 10 : null };
  });
}
