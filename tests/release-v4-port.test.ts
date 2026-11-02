/** v4 port: UPI QR, stock ledger invariant, tax CSV, redacted evidence export, verified backup. */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BusinessStore } from '@/lib/metabos/store';
import { invoiceQrSvg, stockLedger, taxCsv, evidenceExport, backupAndVerify, csvCell } from '@/lib/metabos/records';
const dirs: string[] = []; const stores: BusinessStore[] = [];
const tmp = () => { const d = mkdtempSync(path.join(tmpdir(), 'mb-v4-')); dirs.push(d); return d; };
const open = () => { const s = new BusinessStore(path.join(tmp(), 'b.sqlite')); stores.push(s); return s; };
afterEach(() => { stores.splice(0).forEach((s) => s.db.open && s.close()); dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })); });
const seed = (s: BusinessStore, name = 'Kaveri Traders', qty = 2) => {
  const c = s.customer({ name, email: 'kaveri@example.com' }); const p = s.product({ name: 'Rice 5kg', sku: `RICE${s.products().length}`, price: 45000, taxBps: 500, stock: 10 });
  const o = s.draft({ customerId: c.id, lines: [{ productId: p.id, quantity: qty }] }); s.approve(o.id, o.hash); return { inv: s.issue(o.id, o.hash), p };
};
const setUpi = (s: BusinessStore) => s.configure({ name: 'Meta Store', address: '', taxId: '', upi: 'metabos@okbank' });

describe('v4 port', () => {
  it('QR encodes the stored invoice amount, needs a UPI ID, and is refused once reconciled', async () => {
    const s = open(); const { inv: noUpi } = seed(s);
    await expect(invoiceQrSvg(s, noUpi.id)).rejects.toMatchObject({ status: 409 });
    setUpi(s); const { inv } = seed(s, 'Second'); const a = await invoiceQrSvg(s, inv.id);
    expect(a.uri).toContain('am=945.00'); expect(a.uri).toContain('pa=metabos%40okbank'); expect(a.svg).toMatch(/^<svg/); expect(a.payment).toBe('pending');
    const { inv: inv2 } = seed(s, 'Other', 3); expect((await invoiceQrSvg(s, inv2.id)).uri).toContain('am=1417.50'); const b = await invoiceQrSvg(s, inv2.id); expect(b.svg).not.toBe(a.svg);
    s.reconcile(inv.id, 'UTR123456789'); await expect(invoiceQrSvg(s, inv.id)).rejects.toMatchObject({ status: 409 });
  });
  it('stock ledger: opening + movements equals current stock', () => {
    const s = open(); const { p } = seed(s); const [row] = stockLedger(s).filter((r) => r.productId === p.id);
    expect(row).toMatchObject({ opening: 10, orderMovements: -2, stock: 8, balanced: true });
    s.db.prepare('UPDATE mb_products SET stock=99 WHERE id=?').run(p.id);
    expect(stockLedger(s).find((r) => r.productId === p.id)!.balanced).toBe(false);
  });
  it('tax CSV neutralises formulas', () => {
    const s = open(); seed(s, '=HYPERLINK("http://x")'); const csv = taxCsv(s);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`); expect(csv.split('\r\n')[0]).toContain('tax_inr'); expect(csv).toContain('"45.00"');
    expect(csvCell('+1')).toBe(`"'+1"`); expect(csvCell('-2')).toBe(`"'-2"`); expect(csvCell('@x')).toBe(`"'@x"`);
  });
  it('evidence export redacts personal rows and emails and reports chain status, which detects tampering', () => {
    const s = open(); seed(s); s.appendEvidence('member.invited', 'owner@example.com', 'invited owner@example.com');
    const ex = evidenceExport(s); expect(ex.chainIntactAtExport).toBe(true);
    expect(JSON.stringify(ex.events)).not.toContain('@example.com');
    expect(ex.events.find((e) => e.action === 'member.invited')!.target).toBe('redacted:member.invited');
    s.db.prepare("UPDATE mb_audit SET detail='tampered' WHERE seq=1").run();
    expect(evidenceExport(s).chainIntactAtExport).toBe(false);
  });
  it('backup is reopened and verified; the copy keeps an intact chain', async () => {
    const s = open(); seed(s); const dir = tmp(); const r = await backupAndVerify(s, dir);
    expect(r.ok).toBe(true); expect(r.verified.auditChain).toBe(true); expect(readdirSync(dir)).toContain(r.name);
    const copy = new BusinessStore(path.join(dir, r.name)); stores.push(copy); expect(copy.invoices()).toHaveLength(1); expect(copy.verifyAudit()).toBe(true);
    expect(s.evidence().at(-1)!.action).toBe('backup.verified');
  });
});
