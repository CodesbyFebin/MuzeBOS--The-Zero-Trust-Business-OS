/** Batch 3: safe outputs, pipeline approval stop, GST MCP. */
import { afterEach, expect, it } from 'vitest';
import { BusinessStore } from '@/lib/metabos/store';
import { assertSafeOutput, allowed } from '@/lib/metabos/b3/safe-outputs';
import { listPipelines, startPipeline } from '@/lib/metabos/b3/pipeline';
import { handleRpc } from '@/lib/metabos/b3/gst-mcp';
import { queue } from '@/lib/metabos/ai/jev';
const ss: BusinessStore[] = []; const fresh = () => { const s = new BusinessStore(':memory:'); ss.push(s); return s; };
afterEach(() => ss.splice(0).forEach((s) => s.db.close()));
const ev = (s: BusinessStore, a: string) => s.db.prepare('SELECT COUNT(*) n FROM mb_audit WHERE action=?').get(a) as { n: number };
it('safe outputs refuse undeclared types with evidence', () => {
  const s = fresh(); expect(allowed('writer', 'social_post')).toBe(true); expect(allowed('inventory', 'social_post')).toBe(false);
  expect(() => assertSafeOutput(s, 'inventory', 'social_post', 'x')).toThrow(/refused/); expect(ev(s, 'ai.output.refused').n).toBe(1);
});
const safe = async () => ({ verdict: 'safe', categories: [], model: 'fixture', reason: '' }) as never;
const unsafe = async () => ({ verdict: 'unsafe', categories: ['S1'], model: 'fixture', reason: '' }) as never;
it('pipeline stops at Jev and becomes blocked after the deadline', async () => {
  const s = fresh(); const now = new Date('2026-10-28T08:00:00Z');
  const r = await startPipeline(s, { goal: 'Diwali offer post', research: 'Last year sweets sold out', draft: 'Diwali boxes are back', role: 'writer', approveWithinHours: 2 }, { now, guard: safe });
  expect(r.stage).toBe('awaiting_approval'); expect(queue(s)[0].status).toBe('awaiting_approval');
  expect(listPipelines(s, new Date('2026-10-28T09:00:00Z'))[0].stage).toBe('awaiting_approval');
  expect(listPipelines(s, new Date('2026-10-28T11:00:00Z'))[0].stage).toBe('blocked');
});
it('unsafe drafts never reach Jev', async () => {
  const s = fresh(); const r = await startPipeline(s, { goal: 'x y z', research: 'r', draft: 'd', role: 'writer' }, { guard: unsafe });
  expect(r.stage).toBe('rejected'); expect(queue(s)).toHaveLength(0);
});
it('GST MCP lists tools and computes intra/inter-state tax in paise', () => {
  expect((handleRpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) as any).result.tools).toHaveLength(3);
  const call = (a: unknown) => JSON.parse((handleRpc({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'gst.compute_invoice', arguments: a } }) as any).result.content[0].text);
  const line = [{ description: 'Cake', quantity: 2, unitPriceRupees: '250.00', gstRatePercent: 18 }];
  const intra = call({ supplierStateCode: '32', placeOfSupplyStateCode: '32', lines: line });
  expect(intra).toMatchObject({ interState: false, taxablePaise: '50000', cgstPaise: '4500', sgstPaise: '4500', igstPaise: '0', totalPaise: '59000' });
  expect(call({ supplierStateCode: '32', placeOfSupplyStateCode: '29', lines: line })).toMatchObject({ interState: true, igstPaise: '9000' });
  expect((handleRpc({ jsonrpc: '2.0', id: 3, method: 'nope' }) as any).error.code).toBe(-32601);
});
