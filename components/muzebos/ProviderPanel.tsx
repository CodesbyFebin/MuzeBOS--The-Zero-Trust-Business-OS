'use client';
import { useCallback, useEffect, useState } from 'react';
import type { ProviderConfig, TestResult } from '@/lib/muzebos/providers';
/** Credential references (never values) and a real Test connection for a provider page. */
export function ProviderPanel({ moduleId }: { moduleId: string }) {
  const [cfg, setCfg] = useState<ProviderConfig | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [result, setResult] = useState<TestResult | null>(null);
  const load = useCallback(async () => {
    try { const r = await fetch(`/api/providers/${moduleId}`, { cache: 'no-store' }); const j = await r.json(); if (!r.ok) throw new Error(j.error); setCfg(j); setRefs(Object.fromEntries(j.secrets.map((s: { key: string; ref: string }) => [s.key, s.ref]))); setError(''); }
    catch (e) { setError(e instanceof Error && e.message ? e.message : 'Could not load provider configuration'); }
  }, [moduleId]);
  useEffect(() => { void load(); }, [load]);
  const post = async (body: unknown) => {
    setBusy(true); setError('');
    try { const r = await fetch(`/api/providers/${moduleId}`, { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok) throw new Error(j.error); if (j.config) setCfg(j.config); if (j.result) setResult(j.result); }
    catch (e) { setError(e instanceof Error && e.message ? e.message : 'Request failed'); } finally { setBusy(false); }
  };
  if (!cfg) return <section className="mb-panel" aria-busy={!error}><h2>Provider connection</h2>{error ? <p role="alert" className="mb-error">{error} <button type="button" onClick={() => void load()}>Retry</button></p> : <p className="mb-muted">Loading…</p>}</section>;
  const shown = result ?? cfg.lastTest;
  return <section className="mb-panel" data-testid="provider-panel"><h2>Provider connection: {cfg.name}</h2>
    <p data-testid="provider-state"><span className={`mb-status ${cfg.configured ? 'mb-status-existing' : 'mb-status-needs-credentials'}`}>{cfg.configured ? 'Credentials present' : 'Not configured'}</span> Nothing is sent from this page: approved items stay queued, provider not connected.</p>
    {cfg.note && <p className="mb-muted">{cfg.note}</p>}
    <p className="mb-muted">Store the name of an environment variable (for example MUZEBOS_…). The value is read on the server at test time and is never stored or shown.</p>
    <ul className="mb-help-list">{cfg.secrets.map((s) => <li key={s.key}><label>{s.label} <input aria-label={`${s.label} env reference`} value={refs[s.key] ?? ''} onChange={(e) => setRefs({ ...refs, [s.key]: e.target.value.toUpperCase() })} /></label> <span className="mb-badge">{s.isSet ? 'set' : 'not set'}</span> <button type="button" disabled={busy || refs[s.key] === s.ref} onClick={() => void post({ action: 'setRef', field: s.key, ref: refs[s.key] })}>Save reference</button></li>)}</ul>
    <button type="button" disabled={busy} onClick={() => void post({ action: 'test' })}>Test connection</button>
    {shown && <p role="status" data-testid="provider-test">Last test ({new Date(shown.at).toLocaleString()}): <strong>{shown.status === 'not-configured' ? 'Not configured' : shown.status}</strong> — {shown.message}</p>}
    {error && <p role="alert" className="mb-error">{error}</p>}
  </section>;
}
