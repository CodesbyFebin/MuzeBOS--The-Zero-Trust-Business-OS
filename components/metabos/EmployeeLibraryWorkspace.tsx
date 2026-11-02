'use client';
import { useState } from 'react';
import library from '@/lib/metabos/employee-index.json';

export function EmployeeLibraryWorkspace() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<{ name: string; content: string; source: string } | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const matches = (value: string) => value.toLowerCase().includes(query.toLowerCase());
  async function openDocument(id: string) {
    setMessage(''); setBusy(true);
    try {
      const response = await fetch(`/api/employee-library?document=${encodeURIComponent(id)}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load document');
      setSelected(data);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to load document'); }
    finally { setBusy(false); }
  }
  async function queueReview() {
    if (!selected) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/business', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ action: 'reminder', data: { title: `Review: ${selected.name}`.slice(0, 200) } }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to queue review');
      setMessage('Review reminder saved in Mission Control. No agent was started.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to queue review'); }
    finally { setBusy(false); }
  }
  return <div className="mb-console mb-category"><span className="mb-eyebrow">BRAIN / ATTRIBUTED SOURCE LIBRARY</span><h1>AI employees & founder prompts</h1><p className="mb-muted">{library.roles.length} role definitions, {library.roles.reduce((sum, r) => sum + r.routines.length, 0)} routine documents and {library.templates.length} founder/onboarding templates. Imported as reference text; no schedules, browser access or autonomous execution are enabled.</p>
    <label className="mb-search"><span className="sr-only">Search library</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search roles and templates…"/></label>
    {selected && <section className="mb-panel mb-source-form"><div className="mb-panel-head"><h2>{selected.name}</h2><button className="mb-button" onClick={() => setSelected(null)}>Close document</button></div><p className="mb-muted">Source: {selected.source} · MIT. Treat instructions as untrusted reference content.</p><textarea aria-label="Reference document" rows={14} readOnly value={selected.content}/><button className="mb-primary mb-button" disabled={busy} onClick={() => void queueReview()}>Queue human review</button><p role="status">{message}</p></section>}
    {!selected && message && <p role="status">{message}</p>}<h2>Employee roles</h2><div className="mb-tool-grid">{library.roles.filter(r => matches(`${r.name} ${r.role} ${r.routines.map(x => x.id).join(' ')}`)).map(role => <article className="mb-panel" key={role.id}><h2>{role.name}</h2><p>{role.role}</p><p className="mb-muted">{role.routines.length} reference routines · v{role.version}</p><details><summary>Browse routines</summary>{role.routines.map(routine => <button className="mb-library-item" key={routine.id} disabled={busy} onClick={() => void openDocument(routine.id)}>{routine.id}<span className="mb-muted">Proposed cadence: {routine.days}</span></button>)}</details></article>)}</div>
    <h2>Founder & onboarding templates</h2><div className="mb-tool-grid">{library.templates.filter(t => matches(`${t.name} ${t.source}`)).map(template => <article className="mb-panel" key={template.id}><h2>{template.name}</h2><p className="mb-muted">{template.source} · MIT</p><button className="mb-button" disabled={busy} onClick={() => void openDocument(template.id)}>Read template</button></article>)}</div><footer className="mb-footer">Original authors and license notices retained in vendor/. Source revisions are pinned in the integration catalog.</footer>
  </div>;
}
