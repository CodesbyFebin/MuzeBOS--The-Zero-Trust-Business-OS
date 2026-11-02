'use client';
import { useEffect, useState } from 'react';
import { postTo, type Me } from './bizClient';
const post = postTo('/api/metabos/auth');
type State = { me: Me; workspace: { name: string } | null; setupNeeded: boolean };
export function AccountPanel() {
  const [d, setD] = useState<State | null>(null); const [error, setError] = useState<string | null>(null); const [note, setNote] = useState<string | null>(null);
  const [f, setF] = useState({ workspace: '', name: '', email: '', password: '' });
  const load = async () => { const r = await fetch('/api/metabos/auth'); const j = await r.json(); if (!r.ok) setError(j.error); else setD(j); };
  useEffect(() => {
    const link = new URLSearchParams(location.search).get('link');
    if (link) post({ action: 'redeem', link }).then(() => { history.replaceState(null, '', location.pathname); setNote('Signed in with your link. Set a password below if you want one.'); return load(); }).catch((e) => { setError((e as Error).message); void load(); });
    else void load();
  }, []);
  const run = (fn: () => Promise<unknown>) => async () => { setError(null); setNote(null); try { await fn(); await load(); } catch (e) { setError((e as Error).message); } };
  const field = (k: keyof typeof f, label: string, type = 'text') => <label>{label}<input aria-label={label} type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>;
  return <div className="mb-console mb-category">
    <span className="mb-eyebrow">ACCOUNT</span><h1>{d?.me ? 'Your account' : d?.setupNeeded ? 'Set up your workspace' : 'Sign in'}</h1>
    {error && <p className="mb-alert" role="alert">{error}</p>}{note && <p className="mb-panel" role="status">{note}</p>}
    {d && (d.me ? <section className="mb-panel">
        <p>Signed in as <strong>{d.me.name}</strong>, {d.me.role} in {d.me.department}{d.workspace ? <> at <strong>{d.workspace.name}</strong></> : null}.</p>
        {field('password', 'New password', 'password')}<button onClick={run(async () => { await post({ action: 'setPassword', password: f.password }); setNote('Password saved.'); })}>Save password</button>
        <button onClick={run(() => post({ action: 'signOut' }))}>Sign out</button> <a href="/workspace/account/people">People and roles</a>
      </section>
      : d.setupNeeded ? <section className="mb-panel"><p className="mb-muted">Nobody has an account yet. The first person becomes the owner.</p>
        {field('workspace', 'Company name')}{field('name', 'Your name')}{field('email', 'Email', 'email')}{field('password', 'Password (10+ characters)', 'password')}
        <button onClick={run(() => post({ action: 'setup', setup: f }))}>Create workspace</button></section>
      : <section className="mb-panel">{field('email', 'Email', 'email')}{field('password', 'Password', 'password')}
        <button onClick={run(() => post({ action: 'signIn', credentials: { email: f.email, password: f.password } }))}>Sign in</button>
        <button onClick={run(async () => { const j = await post({ action: 'requestLink', email: f.email }); setNote(j.sent); })}>Email me a sign-in link</button>
        <p className="mb-muted">Links go to this workspace&apos;s local outbox (no email service is connected). The owner can see them on the People page.</p></section>)}
  </div>;
}
