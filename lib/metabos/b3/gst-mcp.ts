/** GST tools for agents over MCP JSON-RPC (batch 3 #4). Compute-only and read-only: no writes, no sends.
 *  Tool math is the pre-existing Open-Founder gst.ts (labelled in ./gst.ts); this JSON-RPC wrapper was built during the event. */
import { z } from 'zod';
import { computeGst, gstr1B2cSummary, isValidGstin, paiseToRupeeString, rupeesToPaise } from './gst';
const Line = z.object({ description: z.string().max(200), hsnSac: z.string().max(10).optional(), quantity: z.number().int().positive().max(1_000_000), unitPriceRupees: z.string().max(20), gstRatePercent: z.number() }).strict();
const Compute = z.object({ supplierStateCode: z.string().regex(/^\d{2}$/), placeOfSupplyStateCode: z.string().regex(/^\d{2}$/), lines: z.array(Line).min(1).max(200) }).strict();
export const MCP_TOOLS = [
  { name: 'gst.compute_invoice', description: 'CGST/SGST (intra-state) or IGST (inter-state) for invoice lines. Amounts in rupee strings; results in integer paise and rupee strings.', inputSchema: { type: 'object', required: ['supplierStateCode', 'placeOfSupplyStateCode', 'lines'] } },
  { name: 'gst.validate_gstin', description: 'Check a GSTIN against the 15-character format. Format only; not a GSTN lookup.', inputSchema: { type: 'object', required: ['gstin'] } },
  { name: 'gst.gstr1_b2c_summary', description: 'Simplified GSTR-1 B2C summary by rate for computed invoices. Illustrative; verify against the current GSTN schema before filing.', inputSchema: { type: 'object', required: ['invoices'] } },
] as const;
const totals = (a: z.infer<typeof Compute>) => computeGst(a.lines.map((l) => ({ description: l.description, hsnSac: l.hsnSac, quantity: l.quantity, unitPricePaise: rupeesToPaise(l.unitPriceRupees), gstRateBp: Math.round(l.gstRatePercent * 100) })), a.supplierStateCode, a.placeOfSupplyStateCode);
export function callTool(name: string, args: unknown): unknown {
  if (name === 'gst.compute_invoice') { const r = totals(Compute.parse(args)); const f = paiseToRupeeString; return { interState: r.interState, taxablePaise: r.taxablePaise.toString(), cgstPaise: r.cgstPaise.toString(), sgstPaise: r.sgstPaise.toString(), igstPaise: r.igstPaise.toString(), totalPaise: r.totalPaise.toString(), total: f(r.totalPaise) }; }
  if (name === 'gst.validate_gstin') { const { gstin } = z.object({ gstin: z.string().max(20) }).strict().parse(args); return { gstin, validFormat: isValidGstin(gstin) }; }
  if (name === 'gst.gstr1_b2c_summary') { const { invoices } = z.object({ invoices: z.array(Compute).min(1).max(500) }).strict().parse(args); return gstr1B2cSummary(invoices.map(totals)); }
  throw new Error(`Unknown tool ${name}`);
}
type Rpc = { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: { name?: string; arguments?: unknown } };
export function handleRpc(m: Rpc) {
  const ok = (result: unknown) => ({ jsonrpc: '2.0', id: m.id ?? null, result });
  const fail = (code: number, message: string) => ({ jsonrpc: '2.0', id: m.id ?? null, error: { code, message } });
  if (m.method === 'initialize') return ok({ protocolVersion: '2025-06-18', serverInfo: { name: 'metabos-gst', version: '0.1.0' }, capabilities: { tools: {} } });
  if (m.method === 'tools/list') return ok({ tools: MCP_TOOLS });
  if (m.method === 'tools/call') { try { return ok({ content: [{ type: 'text', text: JSON.stringify(callTool(String(m.params?.name), m.params?.arguments ?? {})) }] }); } catch (e) { return ok({ isError: true, content: [{ type: 'text', text: e instanceof z.ZodError ? 'Invalid arguments' : String((e as Error).message) }] }); } }
  return fail(-32601, 'Method not found');
}
