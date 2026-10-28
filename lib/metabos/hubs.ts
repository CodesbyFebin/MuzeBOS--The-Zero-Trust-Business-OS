import type { BusinessStore } from '@/lib/metabos/store';
import { WorkflowEngine, AGENT_ROLES } from '@/lib/metabos/workflows';
import { listExpenses } from '@/lib/metabos/biz/expenses';
import { pipelineSummary } from '@/lib/metabos/biz/pipeline';
import { listMemory } from '@/lib/metabos/biz/memory';
import { listGoals } from '@/lib/metabos/goals';
import { listMissions } from '@/lib/metabos/ai/lead';

/** Hub overviews: every number is counted from stored records; `source` names the table or function it came from. */
export const HUBS = ['money', 'brain', 'growth', 'activity', 'agents'] as const;
export type Hub = (typeof HUBS)[number];
export type Fact = { label: string; value: number | string | null; unit?: 'paise' | 'count' | 'percent'; source: string };
export type HubView = { hub: Hub; facts: Fact[]; rows: Record<string, unknown>[]; empty: boolean };

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const tally = <T,>(xs: T[], key: (x: T) => string) => xs.reduce<Record<string, number>>((m, x) => ((m[key(x)] = (m[key(x)] ?? 0) + 1), m), {});

export function hubView(s: BusinessStore, hub: Hub, now = Date.now()): HubView {
  if (hub === 'money') {
    const inv = s.invoices(); const pending = inv.filter((i) => i.payment === 'pending'); const paid = inv.filter((i) => i.payment === 'manually_reconciled');
    const exp = listExpenses(s); const waiting = exp.filter((e) => e.status === 'submitted');
    return { hub, empty: !inv.length && !exp.length, rows: pending.slice(0, 10).map((i) => ({ number: i.number, customer: i.payload.customer.name, total: i.payload.total, createdAt: i.createdAt })), facts: [
      { label: 'Unpaid invoices', value: pending.length, unit: 'count', source: 'mb_invoices.payment=pending' },
      { label: 'Unpaid amount', value: sum(pending.map((i) => i.payload.total)), unit: 'paise', source: 'mb_invoices.payload.total' },
      { label: 'Reconciled amount', value: sum(paid.map((i) => i.payload.total)), unit: 'paise', source: 'mb_invoices.payment=manually_reconciled' },
      { label: 'Expense claims waiting', value: waiting.length, unit: 'count', source: 'mb_expenses.status=submitted' },
    ] };
  }
  if (hub === 'growth') {
    const p = pipelineSummary(s); const inv = s.invoices(); const since = now - 30 * 86_400_000; const recent = inv.filter((i) => Date.parse(i.createdAt) >= since);
    const byCustomer = tally(inv, (i) => i.payload.customer.id); const repeat = Object.values(byCustomer).filter((n) => n > 1).length;
    return { hub, empty: !inv.length && !p.open && !p.won && !p.lost, rows: Object.entries(p.byStage).map(([stage, v]) => ({ stage, ...v })), facts: [
      { label: 'Open deals', value: p.open, unit: 'count', source: 'pipelineSummary' },
      { label: 'Weighted pipeline', value: p.weightedAmount, unit: 'paise', source: 'pipelineSummary' },
      { label: 'Win rate', value: p.winRate, unit: 'percent', source: 'pipelineSummary (won / won+lost)' },
      { label: 'Invoices, last 30 days', value: recent.length, unit: 'count', source: 'mb_invoices.createdAt' },
      { label: 'Repeat customers', value: repeat, unit: 'count', source: 'mb_invoices grouped by customer' },
    ] };
  }
  if (hub === 'brain') {
    const mem = listMemory(s); const goals = listGoals(s); const missions = listMissions(s, 200);
    return { hub, empty: !mem.length && !goals.length && !missions.length, rows: Object.entries(tally(mem, (m) => `${m.layer}/${m.status}`)).map(([k, n]) => ({ memory: k, count: n })), facts: [
      { label: 'Trusted memory notes', value: mem.filter((m) => m.status === 'trusted').length, unit: 'count', source: 'mb_memory.status=trusted' },
      { label: 'Draft notes awaiting a person', value: mem.filter((m) => m.status === 'draft').length, unit: 'count', source: 'mb_memory.status=draft' },
      { label: 'Goals', value: goals.length, unit: 'count', source: 'mb_goals' },
      { label: 'Average goal progress', value: goals.length ? Math.round(sum(goals.map((g) => g.progress)) / goals.length) : null, unit: 'percent', source: 'mb_goals progress' },
      { label: 'Missions', value: missions.length, unit: 'count', source: 'mb_missions (latest 200)' },
    ] };
  }
  if (hub === 'activity') {
    const runs = new WorkflowEngine(s).runs(200); const waiting = runs.filter((r) => r.status === 'awaiting_approval'); const ev = s.evidence();
    return { hub, empty: !ev.length && !runs.length, rows: ev.slice(-25).reverse().map((e) => ({ seq: e.seq, action: e.action, target: e.target, detail: e.detail, createdAt: e.createdAt })), facts: [
      { label: 'Runs waiting for Jev approval', value: waiting.length, unit: 'count', source: 'mb_workflow_runs.status=awaiting_approval' },
      { label: 'Approvals past deadline', value: waiting.filter((r) => Date.parse(r.deadlineAt) < now).length, unit: 'count', source: 'mb_workflow_runs.deadlineAt' },
      { label: 'Evidence events', value: ev.length, unit: 'count', source: 'mb_audit' },
      { label: 'Hash chain', value: s.verifyAudit() ? 'verified' : 'BROKEN', source: 'BusinessStore.verifyAudit' },
    ] };
  }
  const missions = listMissions(s, 200); const tasks = missions.flatMap((m) => m.tasks); const runs = new WorkflowEngine(s).runs(200);
  return { hub, empty: !tasks.length && !runs.length, rows: AGENT_ROLES.map((role) => { const t = tasks.filter((x) => x.role === role); return { agent: role, tasks: t.length, ...tally(t, (x) => x.status), writesRequested: t.filter((x) => x.wantsWrite).length }; }), facts: [
    { label: 'Agent tasks', value: tasks.length, unit: 'count', source: 'mb_mission_tasks' },
    { label: 'Tasks that asked to write', value: tasks.filter((t) => t.wantsWrite).length, unit: 'count', source: 'mb_mission_tasks.wantsWrite' },
    { label: 'Workflow runs', value: runs.length, unit: 'count', source: 'mb_workflow_runs (latest 200)' },
    { label: 'Failed or timed-out runs', value: runs.filter((r) => r.status === 'failed' || r.status === 'timed_out').length, unit: 'count', source: 'mb_workflow_runs.status' },
  ] };
}
