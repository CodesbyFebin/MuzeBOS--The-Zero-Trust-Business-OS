'use client';
import { useCallback, useEffect, useState } from 'react';
import { postTo, useMe, SignedInAs } from '@/components/metabos/bizClient';

type Call = { id: string; model: string; taskClass: string; effort: string | null; api: string; state: string; estimatePico: number; costPico: number; promptTokens: number | null; cachedTokens: number | null; completionTokens: number | null; reasoningTokens: number | null; priceVerified: number; note: string | null; createdAt: string };
type Price = { model: string; cachedMicroUsdPerM: number; inputMicroUsdPerM: number; outputMicroUsdPerM: number; verified: boolean; source: string; checkedAt: string };
type View = { capMinor: number; capUsd: string; spentPico: number; reservedPico: number; spentUsd: string; calls: Call[]; prices: Price[]; cache: { entries: number; hits: number }; mode: 'contributor' | 'standard'; modes: Record<string, { primary: string; fallback: string | null; label: string }>; disclosure: string; highEffort: boolean; canEdit: boolean };
const PER_CENT = 10_000_000_000;
const usd = (pico: number) => `USD ${(pico / PER_CENT / 100).toFixed(pico < 100 * PER_CENT ? 6 : 2)}`;
const perM = (micro: number) => `$${(micro / 1e6).toFixed(3)}`;
const post = postTo('/api/ai/budget');
const STATUS: Record<string, string> = { settled: 'mb-ok', reserved: 'mb-warn', failed: 'mb-bad', refused: 'mb-bad' };

/** Meta Model API spend vs the owner's hard cap, the model setting and per-call token use. Numbers come from recorded calls only. */
export function MetaBudget() {
  const me = useMe();
  const [v, setV] = useState<View | null>(null); const [err, setErr] = useState(''); const [note, setNote] = useState(''); const [cap, setCap] = useState('');
  const load = useCallback(async () => { const r = await fetch('/api/ai/budget', { cache: 'no-store' }); const j = await r.json().catch(() => ({})); if (!r.ok) { setErr(j.error ?? 'Usage unavailable'); return; } setV(j); setCap((j.capMinor / 100).toFixed(2)); }, []);
  useEffect(() => { void load(); }, [load]);
  const act = async (body: object, ok: string) => { try { const j = await post(body); setV(j); setNote(ok); setErr(''); } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } };
  if (err && !v) return <section className="mb-panel" aria-label="Meta spend"><SignedInAs me={me} /><p className="mb-alert" role="alert">{err}</p></section>;
  if (!v) return <section className="mb-panel"><p className="mb-muted">Loading…</p></section>;
  const pct = v.capMinor ? Math.min(100, (v.spentPico / (v.capMinor * PER_CENT)) * 100) : 100;
  return <section className="mb-panel mb-talk" aria-label="Meta Model API spend and settings" data-testid="meta-budget">
    {err && <p className="mb-alert" role="alert">{err}</p>}{note && <p className="mb-muted" role="status">{note}</p>}
    <h2>Meta Model API spend</h2>
    <p data-testid="meta-spent"><strong>{usd(v.spentPico)}</strong> spent of <strong>USD {v.capUsd}</strong> hard cap{v.reservedPico > 0 ? ` (${usd(v.reservedPico)} reserved for calls in flight)` : ''}.</p>
    <progress max={100} value={pct} aria-label={`Spent ${pct.toFixed(1)}% of the cap`} />
    <p className="mb-muted">Before each call the worst-case cost (every input character as a token, plus the full output limit, which includes reasoning) is reserved. A call that would pass the cap is refused and never sent. After the call the real cost is recorded from the usage fields.</p>
    {v.canEdit && <form className="mb-actions" onSubmit={(e) => { e.preventDefault(); void act({ action: 'cap', capMinor: Math.round(Number(cap) * 100) }, 'Cap saved'); }}>
      <label className="mb-field">Hard cap (USD)<input inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} required /></label>
      <button className="mb-primary" type="submit">Save cap</button>
    </form>}
    <h3>Model setting</h3>
    <p>Using <strong>{v.modes[v.mode].primary}</strong>{v.modes[v.mode].fallback ? `, fallback ${v.modes[v.mode].fallback}` : ''}. {v.modes[v.mode].label}.</p>
    <p data-testid="meta-training-note">{v.disclosure}</p>
    {v.canEdit ? <div className="mb-actions">
      <button className="mb-primary" type="button" disabled={v.mode === 'contributor'} onClick={() => void act({ action: 'mode', mode: 'contributor' }, 'Switched to contributor models')}>Use contributor models</button>
      <button className="mb-primary" type="button" disabled={v.mode === 'standard'} onClick={() => void act({ action: 'mode', mode: 'standard' }, 'Switched to standard models')}>Use standard models</button>
      <label className="mb-field"><input type="checkbox" checked={v.highEffort} onChange={(e) => void act({ action: 'highEffort', enabled: e.target.checked }, e.target.checked ? 'High effort allowed for deep tasks' : 'High effort off')} /> Allow high reasoning effort for deep tasks</label>
    </div> : <p className="mb-muted">Only the owner can change the cap or the model setting.</p>}
    <h3>Prices per 1M tokens</h3>
    <table className="mb-table"><thead><tr><th>Model</th><th>Input</th><th>Cached input</th><th>Output</th><th>Source</th></tr></thead><tbody>
      {v.prices.map((p) => <tr key={p.model}><td>{p.model}</td><td>{perM(p.inputMicroUsdPerM)}</td><td>{perM(p.cachedMicroUsdPerM)}</td><td>{perM(p.outputMicroUsdPerM)}</td><td>{p.verified ? <span className="mb-ok">verified</span> : <span className="mb-warn">unverified price (conservative estimate)</span>} checked {p.checkedAt.slice(0, 10)}</td></tr>)}
    </tbody></table>
    <h3>Recent calls</h3>
    <p className="mb-muted">Response cache: {v.cache.entries} entries, {v.cache.hits} hits.</p>
    {v.calls.length === 0 ? <p className="mb-muted">No records yet</p> : <table className="mb-table" data-testid="meta-calls"><thead><tr><th>When</th><th>Model</th><th>Task / effort</th><th>Input (cached)</th><th>Output (reasoning)</th><th>Cost</th><th>State</th></tr></thead><tbody>
      {v.calls.map((c) => <tr key={c.id}><td>{new Date(c.createdAt).toLocaleString()}</td><td>{c.model}</td><td>{c.taskClass} / {c.effort ?? '—'}</td>
        <td>{c.promptTokens === null ? 'Usage unavailable' : `${c.promptTokens} (${c.cachedTokens ?? 0} cached)`}</td>
        <td>{c.completionTokens === null ? 'Usage unavailable' : `${c.completionTokens} (${c.reasoningTokens ?? 0} reasoning)`}</td>
        <td>{c.state === 'settled' && c.promptTokens !== null ? usd(c.costPico) : `est. ${usd(c.estimatePico)}`}{!c.priceVerified && <span className="mb-warn"> unverified price</span>}</td>
        <td><span className={STATUS[c.state] ?? ''}>{c.state}</span>{c.note ? ` ${c.note.slice(0, 120)}` : ''}</td></tr>)}
    </tbody></table>}
  </section>;
}
