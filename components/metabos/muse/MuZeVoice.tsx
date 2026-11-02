'use client';
/**
 * MUSE voice assistant: transcript bubble, speak/type bar, quick prompts, TTS toggle and boops on the repo's three.js fur engine.
 * UI ported from the owner's pre-existing "Miri" standalone HTML (renamed MUSE; see THIRD_PARTY.md). Every reply is either real
 * model text from /api/ai or a plain status. Sends never leave from here: they become a MUSE dispatch proposal that needs two
 * different reviewers (/api/bos museReview) before /api/dispatch will send it, with MUZEBOS_META_DRY_RUN respected.
 */
import { useEffect, useRef, useState } from 'react';
import { MuseFurSimulator, type MuseFurHandle } from './MuseFurSimulator';
import { DEFAULT_COAT, type CoatPresetId } from '@/lib/metabos/fur-sim/presets';
import type { BosView, MuseRoute } from '@/lib/metabos/muse/voice';
type SR = { lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; onerror: () => void; start(): void; stop(): void };
const post = async (url: string, body: unknown) => { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`); return j; };
const CHIPS = ['Boop MuZe', 'Flip my coat', 'Open trust stack', 'Tell the customer their order is ready', 'What is waiting for approval?'];
export type MuZeDraft = { text: string; channel: 'whatsapp' | 'instagram'; source: string };
export function MuZeVoice({ onView, onDraft, size = 240 }: { onView?(v: BosView): void; onDraft?(d: MuZeDraft): void; size?: number }) {
  const fur = useRef<MuseFurHandle>(null); const rec = useRef<SR | null>(null);
  const [coat, setCoat] = useState<CoatPresetId>(DEFAULT_COAT); const [cmd, setCmd] = useState(''); const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null); const [heard, setHeard] = useState<string | null>(null); const [tts, setTts] = useState(true);
  const [listening, setListening] = useState(false); const [voiceOk, setVoiceOk] = useState(false); const [speaking, setSpeaking] = useState(false);
  useEffect(() => { const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }; setVoiceOk(!!(w.SpeechRecognition ?? w.webkitSpeechRecognition)); }, []);
  const say = (text: string, speak: boolean) => { setSaid(text); fur.current?.triggerBoop(); if (!speak || !tts || !('speechSynthesis' in window)) return;
    try { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.pitch = 1.2; u.rate = 1.05; u.onend = () => { setSpeaking(false); fur.current?.setSpeaking(false); }; setSpeaking(true); fur.current?.setSpeaking(true); window.speechSynthesis.speak(u); } catch { /* TTS unavailable */ } };
  const ask = async (prompt: string) => { const j = await post('/api/ai', { action: 'chat', tier: 'auto', webgpu: false, message: prompt });
    return j.reply ? { text: String(j.reply).slice(0, 3500), source: `model ${j.model ?? j.decision?.chosen?.model ?? 'unknown'}` } : null; };
  const run = async (raw: string, via: 'voice' | 'typed' | 'chip') => { const text = raw.trim(); if (!text) return; setHeard(text); setBusy(true);
    try { const { route } = (await post('/api/muse', { command: text, via })) as { route: MuseRoute };
      if (route.kind === 'local') { const c = route.command; if (c.kind === 'boop') fur.current?.triggerBoop(); else if (c.kind === 'coat') { if (c.preset === 'next') fur.current?.flipCoat(); else fur.current?.setCoatPreset(c.preset); } else fur.current?.setEnvironment(c.env); setSaid(null); }
      else if (route.kind === 'view') { onView ? onView(route.view) : (window.location.href = `/workspace/builder/business-open-server?view=${route.view}`); setSaid(`Opened ${route.view}.`); }
      else if (route.kind === 'send') { const r = await ask(`You are MuZe, a business assistant. Write a short customer message (max 600 characters) that carries out this owner command. Reply with the message only.\n\nCommand: ${route.text}`);
        if (!r) say('Model not configured. No message was drafted, so nothing goes to Jev.', false);
        else { say(r.text, false); if (onDraft) onDraft({ text: r.text, channel: route.channel, source: r.source }); else setSaid(`${r.text}\n\nOpen MuZe Sanctum to send this through two-reviewer Jev approval.`); } }
      else if (route.kind === 'ask') { const r = await ask(`You are MuZe, the MuZe business assistant. Answer briefly.\n\n${route.text}`); say(r ? r.text : 'Model not configured. No reply was generated.', !!r); }
    } catch (e) { say(`Could not run that: ${e instanceof Error ? e.message : 'error'}.`, false); } finally { setBusy(false); } };
  const listen = () => { const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }; const C = w.SpeechRecognition ?? w.webkitSpeechRecognition; if (!C) return;
    if (listening) { rec.current?.stop(); return; } const r = new C(); r.lang = 'en-IN'; r.interimResults = false;
    r.onresult = (e) => run(Array.from(e.results).map((x) => x[0].transcript).join(' '), 'voice'); r.onend = () => setListening(false); r.onerror = () => setListening(false); rec.current = r; r.start(); setListening(true); };
  return <div className="mb-muse-voice" data-testid="muse-voice">
    <div className="mb-muse-voice-stage"><MuseFurSimulator ref={fur} state={busy ? 'thinking' : listening ? 'listening' : speaking ? 'speaking' : 'idle'} coat={coat} onCoatChange={setCoat} size={size} /></div>
    <div className="mb-muse-voice-bubble" aria-live="polite" data-testid="muse-bubble">
      <p className="mb-muse-voice-state">{listening ? 'MuZe is listening' : busy ? 'MuZe is working' : speaking ? 'MuZe is speaking' : 'MuZe is ready'}
        <button type="button" aria-pressed={tts} onClick={() => { setTts(!tts); if (tts && 'speechSynthesis' in window) window.speechSynthesis.cancel(); }}>Voice reply: {tts ? 'on' : 'off'}</button></p>
      {heard && <p className="mb-muted">You: “{heard}”</p>}
      <p data-testid="muse-said">{said ?? 'Pet my coat, click to boop, or speak or type a command.'}</p>
    </div>
    <form className="mb-muse-voice-bar" onSubmit={(e) => { e.preventDefault(); run(cmd, 'typed'); setCmd(''); }}>
      <label htmlFor="muse-voice-in" className="sr-only">Ask MuZe</label>
      <input id="muse-voice-in" value={cmd} onChange={(e) => setCmd(e.target.value)} maxLength={600} placeholder="Ask MuZe (e.g. 'open trust stack', 'flip my coat')" />
      {voiceOk ? <button type="button" aria-pressed={listening} onClick={listen}>{listening ? 'Stop' : 'Speak'}</button> : <span className="mb-muted">Voice not supported here — type instead.</span>}
      <button type="submit" disabled={busy || !cmd.trim()}>Ask</button>
    </form>
    <div className="mb-muse-voice-chips" role="group" aria-label="Quick prompts">{CHIPS.map((c) => <button key={c} type="button" disabled={busy} onClick={() => run(c, 'chip')}>{c}</button>)}</div>
  </div>;
}
