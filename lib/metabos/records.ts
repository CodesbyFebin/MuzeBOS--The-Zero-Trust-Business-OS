/**
 * Ported from the v4 codebase (MIT, Codes By Febin) and re-implemented against BusinessStore:
 * UPI QR from the stored invoice, stock-ledger invariant, tax CSV, redacted evidence export, verified backup.
 */
import QRCode from 'qrcode';
import fs from 'node:fs';
import path from 'node:path';
import { BusinessError, BusinessStore, type Invoice } from './store';

/** The exact UPI request for a stored pending invoice. A QR is a payment REQUEST; it never marks payment. */
export function upiUri(inv: Invoice) {
  if (inv.payment !== 'pending') throw new BusinessError('Invoice is already reconciled; no payment request is issued', 409);
  const upi = inv.payload.merchant.upi;
  if (!upi) throw new BusinessError('Merchant UPI ID is not configured', 409);
  return `upi://pay?${new URLSearchParams({ pa: upi, pn: inv.payload.merchant.name, am: (inv.payload.total / 100).toFixed(2), cu: 'INR', tn: inv.number })}`;
}
export async function invoiceQrSvg(store: BusinessStore, invoiceId: string) {
  const inv = store.invoices().find((i) => i.id === invoiceId);
  if (!inv) throw new BusinessError('Invoice not found', 404);
  const uri = upiUri(inv);
  const svg = await QRCode.toString(uri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  return { uri, svg, payment: inv.payment, note: 'Payment request only. The invoice stays pending until a bank reference is entered.' };
}

/** stock = opening stock (from the product.created evidence) + order movements + total-affecting stock moves. */
export function stockLedger(store: BusinessStore) {
  const opening = new Map<string, number>();
  for (const e of store.evidence()) if (e.action === 'product.created') { const m = /opening stock (-?\d+)$/.exec(e.detail); if (m) opening.set(e.target, Number(m[1])); }
  const sum = (sql: string, id: string) => (store.db.prepare(sql).get(id) as { q: number }).q;
  return store.products().map((p) => {
    const orders = sum('SELECT COALESCE(SUM(quantity),0) q FROM mb_movements WHERE productId=?', p.id);
    const moves = sum('SELECT COALESCE(SUM(quantity),0) q FROM mb_stock_moves WHERE productId=? AND affectsTotal=1', p.id);
    const open = opening.get(p.id) ?? null;
    return { productId: p.id, sku: p.sku, opening: open, orderMovements: orders, stockMoves: moves, stock: p.stock, balanced: open !== null && open + orders + moves === p.stock };
  });
}

/** Neutralise spreadsheet formulas and quote every cell. */
export const csvCell = (v: unknown) => { const s = v == null ? '' : String(v); const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; return `"${safe.replace(/"/g, '""')}"`; };
const rupees = (m: number) => (m / 100).toFixed(2);
export function taxCsv(store: BusinessStore) {
  const rows = store.invoices().slice().reverse().map((i) => [i.number, i.createdAt.slice(0, 10), i.payload.customer.name, i.payload.merchant.taxId, rupees(i.payload.subtotal), rupees(i.payload.tax), rupees(i.payload.total), i.payment]);
  return [['invoice', 'date', 'customer', 'merchant_tax_id', 'taxable_inr', 'tax_inr', 'total_inr', 'payment'], ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

const PERSONAL = /^(auth|member|account|customer)\./;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
/** Redacted evidence. Redacted rows cannot be re-hashed from the file; chain status is the server's at export time. */
export function evidenceExport(store: BusinessStore) {
  const chainIntactAtExport = store.verifyAudit();
  const events = store.evidence().map((e) => PERSONAL.test(e.action)
    ? { seq: e.seq, action: e.action, createdAt: e.createdAt, hash: e.hash, previousHash: e.previousHash, target: `redacted:${e.action}`, detail: 'redacted', redacted: true }
    : { ...e, detail: e.detail.replace(EMAIL, '[email]'), redacted: EMAIL.test(e.detail) });
  return { exportedAt: new Date().toISOString(), chainIntactAtExport, count: events.length, note: 'Redacted rows cannot be re-hashed from this file alone.', events };
}

/** Online SQLite backup, then reopened and verified (audit chain + row counts). */
export async function backupAndVerify(store: BusinessStore, dir = process.env.MUZEBOS_BACKUP_DIR || path.join(process.cwd(), 'data', 'backups')) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const name = `metabos-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`; const file = path.join(dir, name);
  await store.db.backup(file);
  const copy = new BusinessStore(file);
  try {
    const verified = { auditChain: copy.verifyAudit(), invoices: copy.invoices().length === store.invoices().length, evidence: copy.evidence().length >= store.evidence().length - 0 };
    const ok = verified.auditChain && verified.invoices;
    store.appendEvidence(ok ? 'backup.verified' : 'backup.verify_failed', name, JSON.stringify(verified));
    return { name, bytes: fs.statSync(file).size, verified, ok };
  } finally { copy.close(); }
}
