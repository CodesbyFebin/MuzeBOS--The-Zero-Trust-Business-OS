// pre-existing: Open-Founder@packages/core/src/gst.ts + money.ts, CodesbyFebin, pre-kickoff (MIT, (c) 2026 Febin Francis). Copied unchanged apart from merging the two files.
export type Paise = bigint;
export function rupeesToPaise(input: string | number): Paise {
  const s = String(input).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error(`Invalid rupee amount: ${s}`);
  const [r, p = ""] = s.split(".");
  return BigInt(r) * 100n + BigInt((p + "00").slice(0, 2));
}
export function paiseToRupeeString(p: Paise): string {
  const neg = p < 0n; const a = neg ? -p : p;
  return `${neg ? "-" : ""}${a / 100n}.${(a % 100n).toString().padStart(2, "0")}`;
}
/** Multiply by basis points (1% = 100 bp) with half-up rounding. */
export function applyBasisPoints(amount: Paise, bp: number): Paise {
  const n = amount * BigInt(bp);
  return (n + 5000n) / 10000n;
}
export const GST_RATES_BP = [0, 25, 300, 500, 1200, 1800, 2800] as const;
export interface GstLineInput { description: string; hsnSac?: string; quantity: number; unitPricePaise: Paise; gstRateBp: number; }
export interface GstLine extends GstLineInput { taxablePaise: Paise; cgstPaise: Paise; sgstPaise: Paise; igstPaise: Paise; totalPaise: Paise; }
export interface GstInvoiceTotals { lines: GstLine[]; taxablePaise: Paise; cgstPaise: Paise; sgstPaise: Paise; igstPaise: Paise; totalPaise: Paise; interState: boolean; }
export const GSTIN_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export function isValidGstin(g: string): boolean { return GSTIN_REGEX.test(g.toUpperCase()); }
/** Intra-state supply => CGST+SGST (half each); inter-state => IGST. */
export function computeGst(lines: GstLineInput[], supplierStateCode: string, placeOfSupplyStateCode: string): GstInvoiceTotals {
  const interState = supplierStateCode !== placeOfSupplyStateCode;
  const out: GstLine[] = lines.map((l) => {
    if (!Number.isInteger(l.quantity) || l.quantity <= 0) throw new Error("quantity must be positive integer");
    if (!(GST_RATES_BP as readonly number[]).includes(l.gstRateBp)) throw new Error(`unsupported GST rate ${l.gstRateBp}bp`);
    const taxable = l.unitPricePaise * BigInt(l.quantity);
    const tax = applyBasisPoints(taxable, l.gstRateBp);
    const cgst = interState ? 0n : tax / 2n;
    const sgst = interState ? 0n : tax - cgst;
    const igst = interState ? tax : 0n;
    return { ...l, taxablePaise: taxable, cgstPaise: cgst, sgstPaise: sgst, igstPaise: igst, totalPaise: taxable + tax };
  });
  const sum = (k: keyof Pick<GstLine, "taxablePaise" | "cgstPaise" | "sgstPaise" | "igstPaise" | "totalPaise">) => out.reduce((a, l) => a + l[k], 0n);
  return { lines: out, taxablePaise: sum("taxablePaise"), cgstPaise: sum("cgstPaise"), sgstPaise: sum("sgstPaise"), igstPaise: sum("igstPaise"), totalPaise: sum("totalPaise"), interState };
}
/** Simplified GSTR-1 B2C summary (illustrative; verify against current GSTN schema before filing). */
export function gstr1B2cSummary(invoices: GstInvoiceTotals[]) {
  const byRate = new Map<number, { taxable: Paise; tax: Paise }>();
  for (const inv of invoices) for (const l of inv.lines) {
    const e = byRate.get(l.gstRateBp) ?? { taxable: 0n, tax: 0n };
    e.taxable += l.taxablePaise; e.tax += l.cgstPaise + l.sgstPaise + l.igstPaise; byRate.set(l.gstRateBp, e);
  }
  return [...byRate.entries()].map(([bp, v]) => ({ ratePercent: bp / 100, taxablePaise: v.taxable.toString(), taxPaise: v.tax.toString() }));
}
