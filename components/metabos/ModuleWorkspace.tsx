'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { FeatureDefinition } from '@/lib/metabos/registry';
import { moduleById, formatMoney, type FieldDef, type ModuleRecord, type ModuleView } from '@/lib/metabos/modules';
import { StatusBadge } from '@/components/metabos/StatusBadge';
import { ProviderPanel } from '@/components/metabos/ProviderPanel';

type Draft = Record<string, unknown>;
const STALE_MS = 5 * 60_000;
const label = (s: string) => s.replace(/_/g, ' ');
function emptyDraft(fields: FieldDef[]): Draft { return Object.fromEntries(fields.filter((f) => !f.system).map((f) => [f.name, f.kind === 'bool' ? false : f.kind === 'lines' ? [{ productId: '', quantity: 1 }] : ''])); }
function toPayload(fields: FieldDef[], d: Draft): Draft {
  const out: Draft = {};
  for (const f of fields) {
    if (f.system) continue;
    const v = d[f.name];
    if (['int', 'money', 'bps'].includes(f.kind)) { if (v !== '' && v !== undefined) out[f.name] = Number(v); }
    else if (f.kind === 'lines') out[f.name] = (v as { productId: string; quantity: number }[]).filter((l) => l.productId).map((l) => ({ productId: l.productId, quantity: Number(l.quantity) }));
    else if (f.kind === 'bool') out[f.name] = Boolean(v);
    else if (v !== '' && v !== undefined) out[f.name] = v;
  }
  return out;
}

function FieldInput({ f, value, onChange, refs }: { f: FieldDef; value: unknown; onChange: (v: unknown) => void; refs: ModuleView['refs'] }) {
  const id = `mf-${f.name}`;
  if (f.kind === 'bool') return <label className="mb-check" htmlFor={id}><input id={id} type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} /> {f.label}</label>;
  if (f.kind === 'lines') {
    const lines = value as { productId: string; quantity: number }[];
    return <fieldset className="mb-lines"><legend>{f.label}</legend>{lines.map((l, i) => <div key={i} className="mb-actions">
      <select aria-label={`${f.label} product ${i + 1}`} value={l.productId} onChange={(e) => onChange(lines.map((x, j) => j === i ? { ...x, productId: e.target.value } : x))}><option value="">Select product</option>{(refs.product ?? []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
      <input aria-label={`${f.label} quantity ${i + 1}`} type="number" min={1} value={l.quantity} onChange={(e) => onChange(lines.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) } : x))} />
      {lines.length > 1 && <button type="button" onClick={() => onChange(lines.filter((_, j) => j !== i))}>Remove</button>}
    </div>)}<button type="button" onClick={() => onChange([...lines, { productId: '', quantity: 1 }])}>Add component</button></fieldset>;
  }
  const common = { id, value: String(value ?? ''), required: f.required, onChange: (e: { target: { value: string } }) => onChange(e.target.value) };
  let input;
  if (f.kind === 'enum') input = <select {...common}><option value="">Select</option>{f.options?.map((o) => <option key={o} value={o}>{label(o)}</option>)}</select>;
  else if (f.kind === 'ref') input = <select {...common}><option value="">Select</option>{(refs[f.ref!] ?? []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>;
  else if (f.kind === 'longtext') input = <textarea {...common} rows={3} />;
  else input = <input {...common} type={['int', 'money', 'bps'].includes(f.kind) ? 'number' : f.kind === 'date' ? 'date' : f.kind === 'email' ? 'email' : f.kind === 'url' ? 'url' : 'text'} min={f.min} max={f.max} />;
  return <label htmlFor={id} className="mb-field"><span>{f.label}{f.required ? ' *' : ''}</span>{input}{f.help && <small className="mb-muted">{f.help}</small>}</label>;
}

function display(f: FieldDef | undefined, v: unknown, refs: ModuleView['refs']): string {
  if (v === undefined || v === null || v === '') return '-';
  if (!f) return String(v);
  if (f.kind === 'ref') return refs[f.ref!]?.find((o) => o.id === v)?.label ?? `${String(v).slice(0, 8)} (inactive)`;
  if (f.kind === 'money') return formatMoney(Number(v));
  if (f.kind === 'bool') return v ? 'yes' : 'no';
  if (f.kind === 'lines') return `${(v as unknown[]).length} line(s)`;
  if (f.kind === 'enum') return label(String(v));
  return String(v);
}

/** Generic workspace for a declarative module: list, filter, create, edit and state transitions, with loading, empty, error and stale states. */
export function ModuleWorkspace({ feature }: { feature: FeatureDefinition }) {
  const def = moduleById(feature.id)!;
  const [data, setData] = useState<ModuleView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('all');
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(def.fields));
  const [editing, setEditing] = useState<ModuleRecord | null>(null);
  const [inputs, setInputs] = useState<Record<string, Draft>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const r = await fetch(`/api/modules/${def.id}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setData(j); setStale(false); setActionError(null);
    } catch (e) { setLoadError(e instanceof Error ? e.message : 'Unable to load'); }
  }, [def.id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!data) return; const t = setTimeout(() => setStale(true), STALE_MS); return () => clearTimeout(t); }, [data]);

  async function send(body: unknown, ok: string) {
    setBusy(true); setActionError(null); setNotice(null);
    try {
      const r = await fetch(`/api/modules/${def.id}`, { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) { if (r.status === 409 && String(j.error).startsWith('Stale')) setStale(true); throw new Error(j.error ?? `HTTP ${r.status}`); }
      setNotice(ok); await load(); return true;
    } catch (e) { setActionError(e instanceof Error ? e.message : 'Request failed'); return false; } finally { setBusy(false); }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = toPayload(def.fields, draft);
    const done = editing ? await send({ action: 'update', id: editing.id, version: editing.version, data: payload }, `${def.noun} updated`) : await send({ action: 'create', data: payload }, `${def.noun} created`);
    if (done) { setDraft(emptyDraft(def.fields)); setEditing(null); }
  }
  const rows = useMemo(() => (data?.records ?? []).filter((r) => filter === 'all' || r.status === filter), [data, filter]);
  const cols = def.columns ?? def.fields.filter((f) => !f.system).slice(0, 3).map((f) => f.name);
  const formFields = def.fields.filter((f) => !f.system);

  return <div className="mb-console mb-category mb-module" data-feature={feature.id} data-status={feature.status}>
    <header className="mb-heading"><div><span className="mb-eyebrow">{feature.menuId.toUpperCase()}{feature.pillar ? ` / PILLAR ${feature.pillar}` : ''}</span><h1>{def.title}</h1><p>{def.summary}</p></div><StatusBadge status={feature.status} /></header>
    {stale && <div className="mb-alert" role="status">This view may be out of date. <button type="button" onClick={() => void load()}>Reload</button></div>}
    {actionError && <div className="mb-alert mb-alert-error" role="alert">{actionError}</div>}
    {notice && <div className="mb-alert" role="status">{notice}</div>}
    {loadError ? <section className="mb-panel"><div className="mb-alert mb-alert-error" role="alert">Could not load {def.title}: {loadError}</div><button type="button" onClick={() => void load()}>Retry</button></section>
      : !data ? <section className="mb-panel" aria-busy="true"><p className="mb-muted">Loading {def.title}...</p></section>
      : <>
        {data.stats.length > 0 && <section className="mb-panel mb-stats" aria-label="Summary">{data.stats.map((s) => <div key={s.label}><span className="mb-muted">{s.label}</span><strong>{s.value}</strong></div>)}</section>}
        <section className="mb-panel" aria-label={editing ? `Edit ${def.noun}` : `New ${def.noun}`}>
          <div className="mb-panel-head"><h2>{editing ? `Edit ${def.noun}` : `New ${def.noun}`}</h2></div>
          <form onSubmit={submit} className="mb-form">
            {formFields.map((f) => <FieldInput key={f.name} f={f} value={draft[f.name]} refs={data.refs} onChange={(v) => setDraft((d) => ({ ...d, [f.name]: v }))} />)}
            <div className="mb-actions"><button className="mb-primary" type="submit" disabled={busy}>{editing ? 'Save changes' : `Create ${def.noun}`}</button>{editing && <button type="button" onClick={() => { setEditing(null); setDraft(emptyDraft(def.fields)); }}>Cancel edit</button>}</div>
          </form>
        </section>
        <section className="mb-panel" aria-label="Records">
          <div className="mb-panel-head"><h2>Records</h2>
            <select aria-label="Filter by state" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All states</option>{def.states.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></div>
          {rows.length === 0 ? <p className="mb-empty">{data.records.length === 0 ? `No ${def.noun} records yet. Create the first one above.` : 'No records in this state.'}</p>
            : <div className="mb-table-wrap"><table className="mb-table"><thead><tr>{cols.map((c) => <th key={c}>{def.fields.find((f) => f.name === c)?.label ?? c}</th>)}<th>State</th><th>Details</th><th>Actions</th></tr></thead>
              <tbody>{rows.map((r) => <tr key={r.id} data-record={r.id}>
                {cols.map((c) => <td key={c}>{display(def.fields.find((f) => f.name === c), r.data[c], data.refs)}</td>)}
                <td><span className="mb-badge">{label(r.status)}</span></td>
                <td>{Object.entries(r.computed ?? {}).map(([k, v]) => <div key={k}><span className="mb-muted">{k}:</span> {v}</div>)}</td>
                <td><div className="mb-actions">
                  {def.editableIn.includes(r.status) && <button type="button" disabled={busy} onClick={() => { setEditing(r); setDraft({ ...emptyDraft(def.fields), ...Object.fromEntries(Object.entries(r.data).map(([k, v]) => [k, typeof v === 'number' ? String(v) : v])) }); }}>Edit</button>}
                  {Object.entries(def.transitions).filter(([, t]) => t.from.includes(r.status)).map(([name, t]) => <span key={name} className="mb-actions">
                    {t.inputs?.map((f) => <input key={f.name} aria-label={`${t.label}: ${f.label}`} placeholder={f.label} type={['int', 'money', 'bps'].includes(f.kind) ? 'number' : 'text'} value={String(inputs[`${r.id}:${name}`]?.[f.name] ?? '')} onChange={(e) => setInputs((m) => ({ ...m, [`${r.id}:${name}`]: { ...m[`${r.id}:${name}`], [f.name]: e.target.value } }))} />)}
                    <button type="button" className={t.danger ? 'mb-danger' : undefined} disabled={busy} onClick={() => void send({ action: 'transition', id: r.id, version: r.version, transition: name, input: t.inputs ? toPayload(t.inputs, inputs[`${r.id}:${name}`] ?? {}) : {} }, `${t.label}: done`)}>{t.label}</button></span>)}
                </div></td></tr>)}</tbody></table></div>}
        </section>
      </>}
    {def.provider && <ProviderPanel moduleId={def.id} />}
    <section className="mb-panel"><h2>Limits</h2><ul className="mb-help-list">{def.limits.map((l) => <li key={l}>{l}</li>)}</ul><p className="mb-muted">Every change is written to the hash-chained evidence log.</p></section>
    <Link className="mb-link" href={`/workspace/${feature.menuId}`}><ArrowLeft size={13} /> Back</Link>
  </div>;
}
