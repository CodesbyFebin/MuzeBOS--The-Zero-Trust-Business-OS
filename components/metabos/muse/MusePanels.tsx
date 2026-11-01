'use client';
/** MUSE side panels wired to real features: Memory → Brain memory, Ledger → evidence chain,
 *  Fleet → Claw swarms and agent drafts, Tools → feature registry. No invented telemetry: every number comes from an API or the registry. */
import { useEffect, useMemo, useState } from 'react';
import { ALL_FEATURES, STATUS_LABEL, statusCounts } from '@/lib/metabos/registry';

type Tab = 'memory' | 'ledger' | 'fleet' | 'tools';
type Load<T> = { data?: T; error?: string };
function useApi<T>(url: string, on: boolean): Load<T> {
  const [s, setS] = useState<Load<T>>({});
  useEffect(() => { if (!on) return; let dead = false; fetch(url).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`); if (!dead) setS({ data: j }); }).catch((e) => { if (!dead) setS({ error: String(e.message ?? e) }); }); return () => { dead = true; }; }, [url, on]);
  return s;
}
const Err = ({ e }: { e?: string }) => e ? <p className="mb-warn" role="status">Unavailable: {e}</p> : null;

export function MusePanels() {
  const [tab, setTab] = useState<Tab>('memory');
  const mem = useApi<{ memory: { id: string; layer: string; scope: string; text: string; status: string; createdAt: string }[] }>('/api/metabos/memory', tab === 'memory');
  const ev = useApi<{ total: number; valid: boolean; headHash: string; rows: { seq: number; action: string; target: string; createdAt: string }[] }>('/api/evidence', tab === 'ledger');
  const fl = useApi<{ totals: { total: number; jev: number; high: number }; swarmList: string[]; yao: { label: string }; claw: { label: string }; drafts: { id: string; agent: string; source: string; guard: string; jevStatus: string | null; createdAt: string }[] }>('/api/b3/swarms?tier=lead', tab === 'fleet');
  const [q, setQ] = useState('');
  const counts = useMemo(() => statusCounts(), []);
  const tools = useMemo(() => { const n = q.trim().toLowerCase(); return (n ? ALL_FEATURES.filter((f) => `${f.label} ${f.summary}`.toLowerCase().includes(n)) : ALL_FEATURES).slice(0, 30); }, [q]);
  const tabs: [Tab, string][] = [['memory', 'Memory'], ['ledger', 'Evidence ledger'], ['fleet', 'Fleet'], ['tools', 'Tool directory']];
  return <section className="mb-panel mb-muse-panels" aria-label="MUSE panels" data-testid="muse-panels">
    <div role="tablist" aria-label="MUSE panels" className="mb-muse-tabs">
      {tabs.map(([k, l]) => <button key={k} role="tab" type="button" id={`muse-tab-${k}`} aria-selected={tab === k} aria-controls={`muse-pane-${k}`} onClick={() => setTab(k)}>{l}</button>)}
    </div>
    <div role="tabpanel" id={`muse-pane-${tab}`} aria-labelledby={`muse-tab-${tab}`} className="mb-muse-pane" data-testid={`muse-pane-${tab}`}>
      {tab === 'memory' && <><Err e={mem.error} />{mem.data && <>
        <p className="mb-muted">{mem.data.memory.length ? `${mem.data.memory.length} Brain memories (${mem.data.memory.filter((m) => m.status === 'trusted').length} trusted).` : 'No records yet'}</p>
        <ul>{mem.data.memory.slice(0, 6).map((m) => <li key={m.id}><span className="mb-hub-chip">{m.layer} · {m.status}</span> {m.text}</li>)}</ul></>}
        <a href="/workspace/brain/memory">Open Brain memory</a></>}
      {tab === 'ledger' && <><Err e={ev.error} />{ev.data && <>
        <p className="mb-muted">{ev.data.total ? `${ev.data.total} evidence events · chain ${ev.data.valid ? 'verified' : 'BROKEN'} · head ${ev.data.headHash.slice(0, 12)}…` : 'No records yet'}</p>
        <ol>{ev.data.rows.slice(0, 8).map((r) => <li key={r.seq}><code>#{r.seq}</code> {r.action} <span className="mb-muted">{r.target}</span></li>)}</ol></>}
        <a href="/business?view=evidence">Open evidence chain</a></>}
      {tab === 'fleet' && <><Err e={fl.error} />{fl.data && <>
        <p className="mb-muted">{fl.data.totals.total} agent definitions in {fl.data.swarmList.length} swarms · {fl.data.totals.jev} need Jev. Definitions only; nothing runs until you start it.</p>
        <p className="mb-muted">Yao: {fl.data.yao.label} · Local swarm: {fl.data.claw.label}</p>
        {fl.data.drafts.length === 0 ? <p>No records yet</p> : <ul>{fl.data.drafts.slice(0, 6).map((d) => <li key={d.id}>{d.agent} <span className="mb-hub-chip">{d.source}</span> <span className="mb-hub-chip">Guard {d.guard}</span> <span className="mb-hub-chip">Jev {d.jevStatus ?? 'not sent'}</span></li>)}</ul>}</>}
        <a href="/workspace/builder/agent-hub">Open Agent Hub</a> · <a href="/workspace/builder/swarms">Claw swarms</a></>}
      {tab === 'tools' && <>
        <p className="mb-muted">{ALL_FEATURES.length} registry entries: {Object.entries(counts).filter(([, n]) => n).map(([k, n]) => `${n} ${STATUS_LABEL[k as keyof typeof STATUS_LABEL].toLowerCase()}`).join(', ')}.</p>
        <label>Search tools <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={60} /></label>
        <ul>{tools.map((f) => <li key={f.id}><a href={f.route}>{f.label}</a> <span className="mb-hub-chip">{STATUS_LABEL[f.status]}</span></li>)}</ul></>}
    </div>
  </section>;
}
