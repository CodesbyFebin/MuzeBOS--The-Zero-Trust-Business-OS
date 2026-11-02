'use client';
/**
 * MUSE Sanctum: speak or type a command → the existing /api/ai model path drafts a plan → the plan becomes one dispatch
 * proposal → Jev decision with the exact payload hash → /api/dispatch (DRY_RUN respected) → receipts from the evidence chain.
 * If no model answers, we say so; we never show a canned reply as model output.
 */
import { useEffect, useRef, useState } from 'react';
import { MuseFurSimulator } from '@/components/metabos/muse/MuseFurSimulator';
import { DEFAULT_COAT, type CoatPresetId } from '@/lib/metabos/fur-sim/presets';
export type SanctumData = { dryRun: boolean; dispatches: { id: string; channel: string; status: string; payloadHash: string; createdAt: string; providerStatus: number | null }[]; evidence: { seq: number; action: string; target: string; detail: string; at: string; hash: string }[] };
type Plan = { text: string; source: string } | null;
type SR = { lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; onerror: () => void; start(): void; stop(): void };
const post = async (url: string, body: unknown, headers: Record<string, string> = {}) => { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`); return j; };
export function Sanctum({ data, onChange }: { data: SanctumData; onChange(): void }) {
  const [coat, setCoat] = useState<CoatPresetId>(DEFAULT_COAT); const [cmd, setCmd] = useState(''); const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<Plan>(null); const [note, setNote] = useState<string | null>(null); const [to, setTo] = useState(''); const [channel, setChannel] = useState<'whatsapp' | 'instagram'>('whatsapp');
  const [listening, setListening] = useState(false); const [voiceOk, setVoiceOk] = useState(false); const rec = useRef<SR | null>(null);
  useEffect(() => { const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }; setVoiceOk(!!(w.SpeechRecognition ?? w.webkitSpeechRecognition)); }, []);
  const listen = () => { const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }; const C = w.SpeechRecognition ?? w.webkitSpeechRecognition; if (!C) return;
    if (listening) { rec.current?.stop(); return; } const r = new C(); r.lang = 'en-IN'; r.interimResults = false; r.onresult = (e) => setCmd(Array.from(e.results).map((x) => x[0].transcript).join(' ')); r.onend = () => setListening(false); r.onerror = () => setListening(false); rec.current = r; r.start(); setListening(true); };
  const draft = async () => { setBusy(true); setNote(null); setPlan(null);
    try { const j = await post('/api/ai', { action: 'chat', tier: 'auto', webgpu: false, message: `You are MUSE, a business assistant. Write a short customer message (max 600 characters) that carries out this owner command. Reply with the message only.\n\nCommand: ${cmd}` });
      if (j.reply) setPlan({ text: String(j.reply).slice(0, 3500), source: `model ${j.model ?? j.decision?.chosen?.model ?? 'unknown'}` });
      else setNote(`Model not configured — no plan was generated. ${(j.decision?.reasons ?? []).slice(0, 2).join(' ')}`); }
    catch (e) { setNote(`Model call failed: ${e instanceof Error ? e.message : 'error'}. No plan was generated.`); } finally { setBusy(false); } };
  const useTyped = () => setPlan({ text: cmd.trim(), source: 'typed by you (no model)' });
  const propose = async () => { if (!plan) return; setBusy(true); setNote(null);
    try { await post('/api/dispatch', { action: 'propose', channel, payload: { to: to.trim(), body: `[MUSE plan] ${plan.text}`.slice(0, 1000) } }); setNote('Proposed. It waits for a Jev decision below.'); setPlan(null); onChange(); }
    catch (e) { setNote(`Not proposed: ${e instanceof Error ? e.message : 'error'}`); } finally { setBusy(false); } };
  const act = async (d: SanctumData['dispatches'][number], what: 'approve' | 'reject' | 'send') => { setBusy(true); setNote(null);
    try { if (what === 'send') await post('/api/dispatch', { action: 'dispatch', id: d.id, payloadHash: d.payloadHash }, { 'idempotency-key': crypto.randomUUID() });
      else await post('/api/dispatch', { action: 'decide', id: d.id, payloadHash: d.payloadHash, approve: what === 'approve' }); setNote(`${what === 'send' ? 'Sent' : what === 'approve' ? 'Approved' : 'Rejected'}.`); }
    catch (e) { setNote(`${what}: ${e instanceof Error ? e.message : 'error'}`); } finally { setBusy(false); onChange(); } };
  return <div data-testid="bos-sanctum" className="mb-bos-sanctum">
    <div className="mb-bos-sanctum-hero"><div className="mb-muse-stage"><MuseFurSimulator state={busy ? 'thinking' : listening ? 'listening' : 'idle'} coat={coat} onCoatChange={setCoat} size={240} /></div>
      <div><h2>MUSE Sanctum</h2><p className="mb-muted">Speak or type a command. MUSE drafts a plan, you approve it in Jev, then it goes out through /api/dispatch.</p>
        <p className="mb-bos-dry" data-testid="bos-dryrun">{data.dryRun ? 'DRY_RUN is on: approved Meta sends are recorded and not sent.' : 'DRY_RUN is off: approved sends call the provider.'}</p></div></div>
    <form className="mb-bos-cmd" onSubmit={(e) => { e.preventDefault(); if (cmd.trim().length >= 3) draft(); }}>
      <label htmlFor="bos-cmd">Command</label>
      <div className="mb-bos-row"><input id="bos-cmd" value={cmd} onChange={(e) => setCmd(e.target.value)} maxLength={600} placeholder="e.g. tell the customer their order is ready" />
        {voiceOk ? <button type="button" aria-pressed={listening} onClick={listen}>{listening ? 'Stop' : 'Speak'}</button> : <span className="mb-muted">Voice not supported in this browser — type instead.</span>}
        <button type="submit" disabled={busy || cmd.trim().length < 3}>Draft plan</button><button type="button" disabled={busy || cmd.trim().length < 3} onClick={useTyped}>Use my words</button></div>
    </form>
    {note && <p role="status" className="mb-bos-note">{note}</p>}
    {plan && <form className="mb-bos-plan" aria-label="Plan" onSubmit={(e) => { e.preventDefault(); propose(); }}><p><b>Plan</b> <em>({plan.source})</em></p><blockquote>{plan.text}</blockquote>
      <div className="mb-bos-row"><label htmlFor="bos-chan">Channel</label><select id="bos-chan" value={channel} onChange={(e) => setChannel(e.target.value as 'whatsapp')}><option value="whatsapp">WhatsApp</option><option value="instagram">Instagram DM</option></select>
        <label htmlFor="bos-to">Recipient</label><input id="bos-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder={channel === 'whatsapp' ? '+91…' : 'IGSID'} required />
        <button type="submit" disabled={busy}>Send to Jev</button></div></form>}
    <h3>Jev queue (Sanctum)</h3>
    {data.dispatches.length === 0 ? <p className="mb-muted">Nothing proposed from Sanctum yet.</p> : <ul className="mb-bos-jev">{data.dispatches.map((d) => <li key={d.id}><code>{d.channel}</code> <b>{d.status}</b> <code>{d.payloadHash.slice(0, 12)}</code>
      {d.status === 'pending' && <><button type="button" disabled={busy} onClick={() => act(d, 'approve')}>Approve (Jev)</button><button type="button" disabled={busy} onClick={() => act(d, 'reject')}>Reject</button></>}
      {d.status === 'approved' && <button type="button" disabled={busy} onClick={() => act(d, 'send')}>Dispatch</button>}</li>)}</ul>}
    <h3>Receipts (evidence chain)</h3>
    {data.evidence.length === 0 ? <p className="mb-muted">No receipts yet.</p> : <ol className="mb-bos-feed" data-testid="bos-receipts">{data.evidence.map((e) => <li key={e.seq}>#{e.seq} <code>{e.action}</code> {e.detail} <code>{e.hash}</code></li>)}</ol>}
  </div>;
}
