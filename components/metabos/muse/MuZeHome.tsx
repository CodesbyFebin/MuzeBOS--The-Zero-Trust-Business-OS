'use client';
/**
 * MuZe on the home page: voice/typed assistant, the roaming guide, and the same two-reviewer send path as Sanctum.
 * Drafting a send here proposes a real dispatch (/api/dispatch propose, marker "muse"), then needs reviewer A and a
 * different reviewer B via /api/bos museReview before /api/dispatch dispatch (DRY_RUN unless configured). No fake rows.
 */
import { useState } from 'react';
import { MuZeVoice, type MuZeDraft } from './MuZeVoice';
type D = { id: string; payloadHash: string; status: string; channel: string };
const post = async (url: string, body: unknown, headers: Record<string, string> = {}) => { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`); return j; };
export function MuZeHome() {
  const [draft, setDraft] = useState<MuZeDraft | null>(null); const [own, setOwn] = useState(''); const [to, setTo] = useState(''); const [channel, setChannel] = useState<'whatsapp' | 'instagram'>('whatsapp');
  const [d, setD] = useState<D | null>(null); const [note, setNote] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const text = draft?.text ?? own.trim();
  const propose = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); setNote(null);
    try { const j = await post('/api/dispatch', { action: 'propose', channel: draft?.channel ?? channel, payload: { to: to.trim(), body: text.slice(0, 1000) }, marker: 'muse' }); setD(j.dispatch); setDraft(null); setOwn(''); setNote('Proposed. Reviewer A signs, then a different reviewer B.'); }
    catch (x) { setNote(x instanceof Error ? x.message : String(x)); } finally { setBusy(false); } };
  const act = async (what: 'approve' | 'reject' | 'send') => { if (!d) return; setBusy(true);
    try { if (what === 'send') { const j = await post('/api/dispatch', { action: 'dispatch', id: d.id, payloadHash: d.payloadHash }, { 'idempotency-key': crypto.randomUUID() }); setD(j.dispatch ?? { ...d, status: 'sent' }); setNote(j.dryRun ? 'Dispatched in DRY_RUN: nothing left this server.' : `Dispatch status: ${j.dispatch?.status ?? 'unknown'}.`); }
      else { const j = await post('/api/bos', { action: 'museReview', input: { dispatchId: d.id, payloadHash: d.payloadHash, approve: what === 'approve' } }); if (j.dispatch) setD(j.dispatch); setNote(what === 'reject' ? 'Rejected.' : j.dispatch?.status === 'approved' ? 'Second reviewer signed. Approved; ready to dispatch.' : 'Reviewer A signed. A different reviewer must sign next.'); } }
    catch (x) { setNote(x instanceof Error ? x.message : String(x)); } finally { setBusy(false); } };
  return <section className="mb-muse-home" aria-label="MuZe assistant" data-testid="muze-home"><h2>MuZe</h2>
    <MuZeVoice size={200} onDraft={setDraft} />
    {!d && <form className="mb-muse-voice-form" onSubmit={propose} aria-label="Send through two-reviewer approval" data-testid="muze-home-send">
      {draft ? <p><strong>MuZe draft</strong> ({draft.source}): {draft.text}</p>
        : <label>Or write the message yourself <textarea value={own} onChange={(e) => setOwn(e.target.value)} maxLength={600} rows={2} /></label>}
      {!draft && <label>Channel <select value={channel} onChange={(e) => setChannel(e.target.value as 'whatsapp' | 'instagram')}><option value="whatsapp">WhatsApp</option><option value="instagram">Instagram</option></select></label>}
      <label>Recipient <input value={to} onChange={(e) => setTo(e.target.value)} maxLength={120} placeholder="+91… or @handle" /></label>
      <button type="submit" disabled={busy || text.length < 3 || to.trim().length < 3}>Send to Jev</button>
    </form>}
    {d && <div className="mb-muse-voice-form" data-testid="muze-home-queue"><p>Dispatch <code>{d.id.slice(0, 8)}</code> · {d.channel} · <strong>{d.status}</strong></p>
      {d.status === 'pending' && <><button type="button" disabled={busy} onClick={() => void act('approve')}>Sign as reviewer</button><button type="button" disabled={busy} onClick={() => void act('reject')}>Reject</button></>}
      {d.status === 'approved' && <button type="button" disabled={busy} onClick={() => void act('send')}>Dispatch</button>}
      {d.status !== 'pending' && d.status !== 'approved' && <button type="button" onClick={() => { setD(null); setNote(null); }}>New message</button>}
    </div>}
    {note && <p role="status" className="mb-muted" data-testid="muze-home-note">{note}</p>}
  </section>;
}
