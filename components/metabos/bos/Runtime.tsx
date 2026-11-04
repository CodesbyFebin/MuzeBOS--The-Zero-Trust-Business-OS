'use client';
/** Agent runtime: local (default) or Rakazo. Shows only what the server could read; "Rakazo not configured" otherwise. */
import { useCallback, useEffect, useState } from 'react';
type Bot = { id: string; name: string; description: string };
type R = { mode: 'local' | 'rakazo'; rakazo: { configured: boolean; missing?: string[]; health?: { ok: boolean; code: number | null; ms: number }; bots: Bot[]; botsError?: string | null } };
export function Runtime() {
  const [d, setD] = useState<R | null>(null); const [msg, setMsg] = useState<string | null>(null); const [name, setName] = useState('');
  const load = useCallback(async () => { const r = await fetch('/api/runtime', { cache: 'no-store' }); const j = await r.json(); if (r.ok) setD(j); else setMsg(`Could not load: ${j.error ?? r.status}`); }, []);
  useEffect(() => { load(); }, [load]);
  const put = async (b: unknown) => { const r = await fetch('/api/runtime', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); const j = await r.json(); setMsg(r.ok ? 'Done.' : j.error); load(); };
  if (!d) return <div data-testid="bos-runtime"><h2>Agent runtime</h2><p className="mb-muted">{msg ?? 'Loading…'}</p></div>;
  const rk = d.rakazo;
  return <div data-testid="bos-runtime"><h2>Agent runtime</h2>
    <p>Current runtime: <strong data-testid="runtime-mode">{d.mode === 'local' ? 'Local (MuZe)' : 'Rakazo'}</strong></p>
    <div className="mb-canvas-tools" role="group" aria-label="Choose runtime"><button type="button" aria-pressed={d.mode === 'local'} onClick={() => put({ action: 'mode', mode: 'local' })}>Use local</button><button type="button" aria-pressed={d.mode === 'rakazo'} disabled={!rk.configured} onClick={() => put({ action: 'mode', mode: 'rakazo' })}>Use Rakazo</button></div>
    {msg && <p role="status">{msg}</p>}
    {!rk.configured ? <p data-testid="rakazo-not-configured">Rakazo not configured. Add {rk.missing?.join(' and ')} on the server. RAKAZO_API_KEY is a Rakazo sign-in session token (Rakazo has no long-lived API keys).</p>
      : <><p data-testid="rakazo-health">Rakazo /ready: {rk.health?.ok ? `OK (${rk.health.ms} ms)` : rk.health?.code ? `HTTP ${rk.health.code}` : 'no response'}</p>
        {rk.botsError ? <p>Bots could not be listed: {rk.botsError}</p> : rk.bots.length === 0 ? <p className="mb-muted">No Rakazo bots yet.</p>
          : <ul className="mb-issues">{rk.bots.map((b) => <li key={b.id}>{b.name} (Rakazo) <span className="mb-muted">{b.description}</span></li>)}</ul>}
        <form className="mb-issues-form" onSubmit={(e) => { e.preventDefault(); put({ action: 'create', name }); setName(''); }}><label>New Rakazo bot<input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required /></label><button type="submit">Create</button></form></>}
    <p className="mb-muted">Rakazo bots cannot send. They call MuZe&apos;s propose_send tool, which becomes a dispatch that two different reviewers must approve before it runs (test mode stays on).</p>
  </div>;
}
