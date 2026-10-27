'use client';
import { useEffect, useState } from 'react';
import { postTo, SignedInAs, type Me } from './bizClient';
const post = postTo('/api/muzebos/auth');
type Person = { id: string; name: string; role: string; department: string; email: string | null; canSignIn: boolean; permissions: string[]; openClaims: number };
type Mail = { id: string; recipient: string; subject: string; body: string; createdAt: string };
const DEPTS = ['inventory', 'customers', 'finance', 'operations', 'writer'];
export function PeopleDirectory() {
  const [d, setD] = useState<{ me: Me; people: Person[]; outbox: Mail[]; roles: Record<string, string[]> } | null>(null); const [error, setError] = useState<string | null>(null);
  const [m, setM] = useState({ name: '', email: '', role: 'manager', department: 'finance' });
  const load = async () => { const r = await fetch('/api/muzebos/auth'); const j = await r.json(); if (!r.ok) setError(j.error); else setD(j); };
  useEffect(() => { void load(); }, []);
  const run = (fn: () => Promise<unknown>) => async () => { setError(null); try { await fn(); await load(); } catch (e) { setError((e as Error).message); } };
  return <div className="mb-console mb-category">
    <span className="mb-eyebrow">PEOPLE</span><h1>People and roles</h1>
    <p className="mb-muted">Who is in this workspace, what their role allows, and what they have open. Roles are enforced on the server.</p>
    {error && <p className="mb-alert" role="alert">{error}</p>}
    {d && <><SignedInAs me={d.me} />
      {d.me && <table className="mb-table"><thead><tr><th>Name</th><th>Role</th><th>Department</th><th>Sign-in</th><th>Open claims</th><th>Allowed</th></tr></thead>
        <tbody>{d.people.map((p) => <tr key={p.id}><td>{p.name}</td><td>{p.role}</td><td>{p.department}</td><td>{p.canSignIn ? p.email : 'No account'}</td><td>{p.openClaims}</td><td className="mb-muted">{p.permissions.join(', ')}</td></tr>)}</tbody></table>}
      {d.me?.role === 'owner' && <section className="mb-panel" aria-label="Invite"><h2>Invite a teammate</h2>
        <input aria-label="Name" value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} />
        <input aria-label="Email" type="email" value={m.email} onChange={(e) => setM({ ...m, email: e.target.value })} />
        <select aria-label="Role" value={m.role} onChange={(e) => setM({ ...m, role: e.target.value })}>{Object.keys(d.roles).map((r) => <option key={r}>{r}</option>)}</select>
        <select aria-label="Department" value={m.department} onChange={(e) => setM({ ...m, department: e.target.value })}>{DEPTS.map((r) => <option key={r}>{r}</option>)}</select>
        <button onClick={run(() => post({ action: 'invite', member: m }))}>Invite</button>
        <h3>Local outbox</h3><p className="mb-muted">No email service is connected, so sign-in links are kept here. Share a link with that person yourself.</p>
        {d.outbox.length ? <ul>{d.outbox.map((x) => <li key={x.id}><strong>{x.recipient}</strong>: {x.subject} · <code>{x.body}</code></li>)}</ul> : <p className="mb-empty">Empty.</p>}
      </section>}</>}
  </div>;
}
