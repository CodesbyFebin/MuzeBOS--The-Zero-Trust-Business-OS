/** MuZe home read model: real counts from this server's SQLite. Nothing here is estimated or sampled. */
import type { BusinessStore } from './store';
import { office, sanctumReceipts, trustStack } from './bos/core';
import { discord, operator } from './bos/operator';
import { queue } from './ai/jev';
import { listDispatches } from './dispatch/service';
import { listIssues } from './board/issues';
import { listFrames } from './canvas/store';
import { getRuntime, rakazoConfig } from './runtime/rakazo';
import { metaStatus } from './meta/status';
import { metaDryRun } from './meta/graph';
import { loadCatalog, connectionLabel } from './muse-catalog';
type Env = Record<string, string | undefined>;
const tally = <T extends string>(xs: T[]) => xs.reduce((m, x) => ({ ...m, [x]: (m[x] ?? 0) + 1 }), {} as Record<string, number>);
export function home(s: BusinessStore, env: Env) {
  const q = queue(s); const ds = listDispatches(s); const ev = s.evidence(); const op = operator(s, env); const dc = discord(s); const meta = metaStatus(s);
  const mcp = loadCatalog().entries.filter((e) => e.kind === 'mcp');
  return {
    jev: { waiting: q.filter((r) => r.status === 'awaiting_approval').length, total: q.length, top: op.jev.slice(0, 3).map((r) => ({ id: r.id, title: r.title })) },
    dispatch: { byStatus: tally(ds.map((d) => d.status)), total: ds.length, dryRun: metaDryRun(env) },
    receipts: sanctumReceipts(s, env).dispatches.length,
    office: { desks: office(s).desks.map((d) => ({ agent: d.agent, state: d.state })), runtime: getRuntime(s), rakazoConfigured: !!rakazoConfig(env) },
    canvas: { frames: listFrames(s).slice(-4).reverse().map((f) => ({ id: f.id, title: f.title, status: f.status, rev: f.rev })), total: listFrames(s).length },
    issues: tally(listIssues(s).map((i) => i.status)),
    operator: { swarms: op.swarms.length, channels: dc.groups.flatMap((g) => g.channels.map((c) => ({ name: c.name, messages: c.messages.length }))) },
    mcp: { total: mcp.length, builtIn: mcp.filter((e) => connectionLabel(e, env).startsWith('Built in')).map((e) => e.name) },
    trust: trustStack(s, env).map((t) => ({ id: t.id, name: t.name, state: t.state })),
    meta: { byStatus: tally(meta.products.map((p) => p.status)), total: meta.products.length, note: meta.note },
    evidence: { rows: ev.length, chainValid: s.verifyAudit(), recent: ev.slice(-5).reverse().map((e) => ({ seq: e.seq, action: e.action, at: e.createdAt })) },
  };
}
export type Home = ReturnType<typeof home>;
