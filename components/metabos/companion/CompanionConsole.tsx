'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { readCompanionMessage } from '@/lib/metabos/companion/bridge';
import { COMPANION_DESTINATIONS } from '@/lib/metabos/companion/destinations';
import type { companionSnapshot } from '@/lib/metabos/companion/core';
import { emitRoam } from '@/lib/metabos/muse/roam';
type Snapshot = ReturnType<typeof companionSnapshot>;
export function CompanionConsole({ onClose }: { onClose: () => void }) {
  const router = useRouter(); const frame = useRef<HTMLIFrameElement>(null); const channel = useRef('');
  const [data, setData] = useState<Snapshot | null>(null), [error, setError] = useState(''), [note, setNote] = useState('');
  const [prompt, setPrompt] = useState(''), [paid, setPaid] = useState(false), [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { const r = await fetch('/api/companion', { cache: 'no-store' }); const j = await r.json(); if (!r.ok) throw new Error(j.error); setData(j); setError(''); return j as Snapshot; } catch (e) { setError(e instanceof Error ? e.message : 'Workspace unavailable'); return null; } }, []);
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 15000); return () => clearInterval(timer); }, [load]);
  const reply = useCallback((text: string) => frame.current?.contentWindow?.postMessage({ protocol: 'muze-argon/v1', type: 'reply', channel: channel.current, text }, '*'), []);
  const navigate = useCallback((key: keyof typeof COMPANION_DESTINATIONS) => {
    const target = COMPANION_DESTINATIONS[key]; reply(`Opening ${target.label}.`); router.push(target.href);
    setNote(`Guide: ${target.label}. Use “Guide this page” after it opens.`);
  }, [router, reply]);
  useEffect(() => {
    const listen = (e: MessageEvent) => {
      if (!frame.current?.contentWindow || e.source !== frame.current.contentWindow || e.origin !== 'null') return;
      const intent = readCompanionMessage(e.data, channel.current); if (!intent) return;
      if (intent.type === 'navigate') navigate(intent.target);
      if (intent.type === 'draft') { setPrompt(intent.text.slice(0, 8000)); setNote('Task prepared for your review. Choose Create approval draft to save it.'); }
      if (intent.type === 'status') void load().then(s => reply(s ? `${s.workspace.evidenceRows} evidence rows. ${s.workspace.pendingSends} pending sends. ${s.brain.workers.filter(w => w.online && w.transport === 'server').length} server workers seen in the last 90 seconds. Model drafts need approval.` : 'Sign in to read your workspace status.'));
    };
    window.addEventListener('message', listen); return () => window.removeEventListener('message', listen);
  }, [load, navigate, reply]);
  const propose = async () => { if (busy) return; setBusy(true); setError(''); try {
    const r = await fetch('/api/companion', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify({ title: prompt.trim().slice(0, 160), prompt: prompt.trim(), paidConsent: paid }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error); setPrompt(''); setNote(`Draft ${j.task.id.slice(0, 8)} saved: ${j.task.state}. Review it in Inference; it has not executed.`); await load();
  } catch (e) { setError(e instanceof Error ? e.message : 'Could not create draft'); } finally { setBusy(false); } };
  const guide = () => { document.querySelectorAll('[data-muze-current-guide]').forEach(el => el.removeAttribute('data-muze-current-guide')); const target = document.querySelector('[data-guide][aria-current="page"]') ?? document.querySelector('main [data-guide]') ?? document.querySelector('main h1, main h2'); if (target) { target.setAttribute('data-muze-current-guide', 'true'); emitRoam({ kind: 'guide', selector: '[data-muze-current-guide="true"]' }); setNote(target.getAttribute('data-guide') || target.textContent?.slice(0, 250) || 'Current page'); } };
  const online = data?.brain.workers.filter(w => w.online && w.transport === 'server').length ?? 0;
  return <aside className="mb-companion-console" aria-label="MuZe brain and companion controls" data-testid="companion-console">
    <header><div><strong>MuZe</strong><span>Dashboard companion · durable business brain</span></div><button type="button" onClick={onClose} aria-label="Close MuZe brain">Close</button></header>
    <iframe ref={frame} title="MuZe local companion controls" src="/companion/argon.html" sandbox="allow-scripts" referrerPolicy="no-referrer" onLoad={() => { channel.current = crypto.randomUUID(); frame.current?.contentWindow?.postMessage({ protocol: 'muze-argon/v1', type: 'init', channel: channel.current }, '*'); }} />
    <p className="mb-companion-help">Gear: local music, coat, language and text chat. Try “open board”, “workspace status”, or “task: analyse overdue invoices”.</p>
    {error && <p role="alert">{error}</p>}{note && <p role="status">{note}</p>}
    <nav aria-label="MuZe destinations">{Object.entries(COMPANION_DESTINATIONS).map(([k, d]) => <button key={k} type="button" onClick={() => navigate(k as keyof typeof COMPANION_DESTINATIONS)}>{d.label}</button>)}<button type="button" onClick={guide}>Guide this page</button></nav>
    <section aria-label="Live workspace"><h2>Workspace pulse</h2>{data ? <><dl><div><dt>Evidence rows</dt><dd>{data.workspace.evidenceRows}</dd></div><div><dt>Pending sends</dt><dd>{data.workspace.pendingSends}</dd></div><div><dt>Server workers online</dt><dd>{online}</dd></div></dl><p>{online ? 'Worker heartbeat seen within 90 seconds.' : 'No recent server worker heartbeat. Continuous execution is not confirmed.'}</p></> : <p>Sign in to see real workspace numbers.</p>}</section>
    <section aria-label="Propose brain task"><h2>Give MuZe a task</h2><label>Task<textarea value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={8000} rows={3} /></label><label><input type="checkbox" checked={paid} onChange={e => setPaid(e.target.checked)} /> Allow a paid model route for this draft; approval is still required.</label><button type="button" disabled={busy || prompt.trim().length < 3} onClick={() => void propose()}>{busy ? 'Saving…' : 'Create approval draft'}</button><a href="/workspace/brain/inference">Review drafts and workers</a></section>
    <p className="mb-companion-help">The server worker can continue while this tab is closed when its host is running. Sends retain Jev review. Microphone access is disabled in the isolated companion frame; use the dashboard’s voice controls.</p>
  </aside>;
}
