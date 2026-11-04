'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { encryptEvidence } from '@/lib/metabos/evidence-encryption';
type Row = { seq: number; action: string; target: string; detail: string; createdAt: string; hash: string; previousHash: string; actor: string; entity: string; result: string; linkValid: boolean };
type Data = { total: number; matched: number; valid: boolean; firstBrokenSeq: number | null; headHash: string | null; rows: Row[]; facets: { actors: string[]; entities: string[]; results: string[] }; explanation: { proves: string[]; limits: string[] } };
const EMPTY = { actor: '', entity: '', action: '', result: '', from: '', to: '', q: '' };
export function EvidenceExplorer() {
  const [f, setF] = useState(EMPTY); const [data, setData] = useState<Data | null>(null); const [error, setError] = useState('');
  const [exportPassword, setExportPassword] = useState(''), [exportBusy, setExportBusy] = useState(false), [exportRoot, setExportRoot] = useState('');
  async function privateExport() {
    setExportBusy(true); setError(''); setExportRoot('');
    try {
      const response = await fetch('/api/evidence?format=bundle', { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not export a valid full evidence chain');
      const bundle = await response.json();
      const encrypted = await encryptEvidence(JSON.stringify(bundle), exportPassword);
      const url = URL.createObjectURL(new Blob([JSON.stringify(encrypted)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'metabos-evidence.encrypted.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); setExportRoot(bundle.rootHash);
    } catch (e) { setError(e instanceof Error ? e.message : 'Encrypted export failed'); }
    finally { setExportBusy(false); setExportPassword(''); }
  }
  const query = useMemo(() => { const q = new URLSearchParams(); for (const [k, v] of Object.entries(f)) if (v) q.set(k, k === 'from' || k === 'to' ? new Date(v).toISOString() : v); return q.toString(); }, [f]);
  const load = useCallback(async () => { try { const r = await fetch(`/api/evidence?${query}`, { cache: 'no-store' }); const d = await r.json(); if (!r.ok) throw new Error(d.error); setData(d); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Evidence unavailable'); } }, [query]);
  const [ready, setReady] = useState(false);
  useEffect(() => { const u = new URLSearchParams(window.location.search); setF((x) => ({ ...x, actor: u.get('actor') ?? '', entity: u.get('entity') ?? '', result: u.get('result') ?? '', action: u.get('action') ?? '', q: u.get('q') ?? '' })); setReady(true); }, []);
  useEffect(() => { if (ready) void load(); }, [load, ready]);
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  return <section className="mb-console mb-evidence" aria-label="Evidence explorer">
    <span className="mb-eyebrow">EVIDENCE / EXPLORER</span><h1>Evidence explorer</h1>
    {error && <p role="alert" className="mb-alert">{error}</p>}
    {data && <p role="note" className={data.valid ? 'mb-muted' : 'mb-alert'} data-chain={data.valid ? 'valid' : 'broken'}>{data.valid ? `Hash chain verified across ${data.total} events.` : `Hash chain broken at event ${data.firstBrokenSeq}; that event and every later one cannot be trusted.`} {data.headHash && <>Head hash <code className="mb-hash">{data.headHash}</code></>}</p>}
    <form className="mb-range mb-evidence-filters" aria-label="Evidence filters" onSubmit={(e) => e.preventDefault()}>
      <label>Actor<select aria-label="Actor" value={f.actor} onChange={set('actor')}><option value="">All</option>{data?.facets.actors.map((a) => <option key={a}>{a}</option>)}</select></label>
      <label>Entity<select aria-label="Entity" value={f.entity} onChange={set('entity')}><option value="">All</option>{f.entity && !data?.facets.entities.includes(f.entity) && <option>{f.entity}</option>}{data?.facets.entities.map((a) => <option key={a}>{a}</option>)}</select></label>
      <label>Result<select aria-label="Result" value={f.result} onChange={set('result')}><option value="">All</option>{data?.facets.results.map((a) => <option key={a}>{a}</option>)}</select></label>
      <label>Action contains<input aria-label="Action contains" value={f.action} onChange={set('action')}/></label>
      <label>Target or detail<input aria-label="Target or detail" value={f.q} onChange={set('q')}/></label>
      <label>From<input aria-label="From time" type="datetime-local" value={f.from} onChange={set('from')}/></label>
      <label>To<input aria-label="To time" type="datetime-local" value={f.to} onChange={set('to')}/></label>
      <button type="button" className="mb-button" onClick={() => setF(EMPTY)}>Clear</button>
      <a className="mb-button" href={`/api/evidence?${query}${query ? '&' : ''}format=csv`} download>Export CSV</a>
      <a className="mb-button" href={`/api/evidence?${query}${query ? '&' : ''}format=json`} download>Export JSON</a>
    </form>
    <section className="mb-panel" aria-label="Private evidence exports"><h2>Private evidence exports</h2>
      <p className="mb-muted">Export the full chain, independent of these filters. Encryption runs in this browser; the password is not sent to the server. The live database remains readable by the server. This is an encrypted export, not a zero-knowledge proof.</p>
      <form className="mb-range" onSubmit={e => { e.preventDefault(); void privateExport(); }}>
        <label>Export password<input type="password" autoComplete="new-password" required minLength={16} maxLength={1024} value={exportPassword} disabled={exportBusy} onChange={e => setExportPassword(e.target.value)}/></label>
        <button className="mb-primary mb-button" disabled={exportBusy || !data?.valid}>{exportBusy ? 'Encrypting locally…' : 'Download encrypted full chain'}</button>
        <a className="mb-button" href="/api/evidence?format=bundle" download>Download unencrypted verification bundle</a>
      </form>
      <p className="mb-muted">Keep your password separately; there is no recovery. A bundle root retained elsewhere can detect later changes or truncation. A root supplied with an untrusted file does not establish authenticity.</p>
      {exportRoot && <p role="status">Encrypted download prepared. Keep this root separately: <code className="mb-hash">{exportRoot}</code></p>}
    </section>
    {data && <p className="mb-muted" aria-live="polite">{data.matched} of {data.total} events match{data.matched > data.rows.length ? `; showing newest ${data.rows.length}` : ''}.</p>}
    {data && (!data.rows.length ? <p className="mb-empty">No evidence events match these filters.</p> :
      <div className="mb-table-wrap"><table className="mb-table" aria-label="Evidence events"><thead><tr><th>#</th><th>Time</th><th>Actor</th><th>Action</th><th>Result</th><th>Target</th><th>Detail</th><th>Link</th></tr></thead>
        <tbody>{data.rows.map((r) => <tr key={r.seq} data-result={r.result}><td>{r.seq}</td><td>{new Date(r.createdAt).toLocaleString()}</td><td>{r.actor}</td><td><code>{r.action}</code></td><td><span className="mb-badge">{r.result}</span></td><td className="mb-wrap">{r.target}</td><td className="mb-wrap">{r.detail}</td><td>{r.linkValid ? 'verified' : 'broken'} <a href={`/api/evidence?format=proof&seq=${r.seq}`} download aria-label={`Download inclusion proof for event ${r.seq}`}>Proof</a></td></tr>)}</tbody></table></div>)}
    {data && <div className="mb-analytics-grid"><section className="mb-panel" aria-label="What the hash chain proves"><h2>What the hash chain proves</h2><ul>{data.explanation.proves.map((x) => <li key={x}>{x}</li>)}</ul></section>
      <section className="mb-panel" aria-label="Trust limits"><h2>Trust limits</h2><ul>{data.explanation.limits.map((x) => <li key={x}>{x}</li>)}</ul></section></div>}
  </section>;
}
