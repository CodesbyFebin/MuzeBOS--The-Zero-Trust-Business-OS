'use client';
import React, { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { BrandMark } from './BrandMark';

type Reply = { heard: string; text: string; links: { label: string; href: string }[]; tool: string; via: string; stt?: { model: string; audioDurationMs: number } | null; error?: string };
type SR = { start(): void; stop(): void; abort(): void; continuous: boolean; interimResults: boolean; lang: string; onresult: ((e: any) => void) | null; onend: (() => void) | null; onerror: ((e: any) => void) | null };
const getSR = (): (new () => SR) | null => typeof window === 'undefined' ? null : ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null);
const WAKE = /\bhey[\s,]+meta[\s,]*bo?ss?\b/i; // STT heard "Hey meta, boss" in the live test

/** 16-bit mono PCM WAV from Float32 chunks (Muse Voice Transcribe accepts WAV only). */
export function encodeWav(chunks: Float32Array[], rate: number): Blob {
  const n = chunks.reduce((s, c) => s + c.length, 0); const buf = new ArrayBuffer(44 + n * 2); const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  let o = 44; for (const c of chunks) for (let i = 0; i < c.length; i++, o += 2) { const x = Math.max(-1, Math.min(1, c[i])); v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true); }
  return new Blob([buf], { type: 'audio/wav' });
}

/** MeTaBos voice assistant. Push-to-talk (button or Alt+M), optional "Hey MeTaBos" wake phrase (off by default,
 *  only while this tab is open), typed fallback. It reads and drafts; it never approves or sends. */
export function VoiceAssistant() {
  const [state, setState] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  const [replies, setReplies] = useState<Reply[]>([]); const [typed, setTyped] = useState(''); const [wake, setWake] = useState(false);
  const [speak, setSpeak] = useState(true); const [note, setNote] = useState('');
  const rec = useRef<{ ctx: AudioContext; stream: MediaStream; node: ScriptProcessorNode; chunks: Float32Array[] } | null>(null);
  const wakeRef = useRef<SR | null>(null);

  const say = useCallback((text: string) => {
    if (!speak || typeof window === 'undefined' || !('speechSynthesis' in window)) { setState('idle'); return; }
    const u = new SpeechSynthesisUtterance(text); u.onend = () => setState('idle'); u.onerror = () => setState('idle');
    window.speechSynthesis.cancel(); setState('speaking'); window.speechSynthesis.speak(u);
  }, [speak]);
  const send = useCallback(async (body: BodyInit, json: boolean) => {
    setState('thinking');
    try {
      const r = await fetch('/api/voice', { method: 'POST', body, headers: json ? { 'Content-Type': 'application/json' } : undefined });
      const j = await r.json();
      const reply: Reply = r.ok ? j : { heard: '', text: j.error ?? 'Voice assistant unavailable', links: [], tool: 'error', via: 'none', error: j.error };
      setReplies((x) => [reply, ...x].slice(0, 20)); say(reply.text);
    } catch { setReplies((x) => [{ heard: '', text: 'Voice assistant unavailable', links: [], tool: 'error', via: 'none' }, ...x]); setState('idle'); }
  }, [say]);
  const sendText = useCallback((text: string) => send(JSON.stringify({ text, tz: -new Date().getTimezoneOffset() }), true), [send]);

  const start = useCallback(async () => {
    if (rec.current || state === 'thinking') return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
      const ctx = new AudioContext(); const src = ctx.createMediaStreamSource(stream); const node = ctx.createScriptProcessor(4096, 1, 1); const chunks: Float32Array[] = [];
      node.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      src.connect(node); node.connect(ctx.destination); rec.current = { ctx, stream, node, chunks }; setState('listening'); setNote('');
    } catch {
      const S = getSR(); if (!S) { setNote('Microphone unavailable. Type your command instead.'); return; }
      const r = new S(); r.lang = 'en-IN'; r.interimResults = false; r.continuous = false; setState('listening'); setNote('Using browser speech recognition');
      r.onresult = (e) => sendText(e.results[0][0].transcript); r.onend = () => setState((s) => s === 'listening' ? 'idle' : s); r.start();
    }
  }, [state, sendText]);
  const stop = useCallback(() => {
    const c = rec.current; if (!c) return; rec.current = null;
    c.node.disconnect(); c.stream.getTracks().forEach((t) => t.stop()); const rate = c.ctx.sampleRate; void c.ctx.close();
    if (c.chunks.length < 3) { setState('idle'); setNote('Hold the button while you speak.'); return; }
    const f = new FormData(); f.append('audio', encodeWav(c.chunks, rate), 'command.wav'); f.append('tz', String(-new Date().getTimezoneOffset()));
    void send(f, false); // audio lives only in this request
  }, [send]);

  useEffect(() => { // Alt+M push-to-talk
    const down = (e: KeyboardEvent) => { if (e.altKey && e.key.toLowerCase() === 'm' && !e.repeat) { e.preventDefault(); void start(); } };
    const up = (e: KeyboardEvent) => { if (e.key.toLowerCase() === 'm' || e.key === 'Alt') stop(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [start, stop]);
  useEffect(() => { // wake phrase: browser recognition, only while this tab is visible, off by default
    if (!wake) return; const S = getSR(); if (!S) { setNote('Wake phrase needs browser speech recognition, which this browser lacks.'); setWake(false); return; }
    let alive = true; const r = new S(); r.continuous = true; r.interimResults = false; r.lang = 'en-IN'; wakeRef.current = r;
    r.onresult = (e) => { const t: string = e.results[e.results.length - 1][0].transcript; if (WAKE.test(t)) { const cmd = t.split(WAKE).pop()?.trim(); if (cmd) void sendText(cmd); else say('Yes?'); } };
    r.onend = () => { if (alive && document.visibilityState === 'visible') { try { r.start(); } catch { /* already started */ } } };
    const vis = () => { if (document.visibilityState !== 'visible') r.abort(); else { try { r.start(); } catch { /* running */ } } };
    document.addEventListener('visibilitychange', vis); try { r.start(); } catch { /* ignore */ }
    return () => { alive = false; document.removeEventListener('visibilitychange', vis); r.abort(); wakeRef.current = null; };
  }, [wake, sendText, say]);

  function submit(e: FormEvent) { e.preventDefault(); const t = typed.trim(); if (t) { setTyped(''); void sendText(t); } }
  const active = state === 'listening' || state === 'speaking';
  return <section className="mb-panel mb-voice" aria-labelledby="voice-h" data-testid="voice-assistant">
    <div className="mb-voice-head">
      <span className={`mb-voice-mark${active ? ' is-active' : ''}`} aria-hidden="true"><BrandMark size={28} /></span>
      <h2 id="voice-h">MeTaBos voice</h2>
      <span className="mb-voice-state" aria-live="polite" data-testid="voice-state">{state === 'idle' ? 'Ready' : state === 'listening' ? 'Listening…' : state === 'thinking' ? 'Working…' : 'Speaking…'}</span>
    </div>
    <p className="mb-voice-help">Hold the mic (or Alt+M) and speak. I can read status, explain an item, list tasks, and draft a task or message for your approval. I never approve or send.</p>
    <div className="mb-voice-row">
      <button type="button" className="mb-voice-mic" aria-pressed={state === 'listening'} aria-label="Hold to talk to MeTaBos" onPointerDown={() => void start()} onPointerUp={stop} onPointerLeave={stop} onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); void start(); } }} onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') stop(); }}>🎙 Hold to talk</button>
      <label className="mb-voice-opt"><input type="checkbox" checked={wake} onChange={(e) => setWake(e.target.checked)} /> “Hey MeTaBos” while this tab is open</label>
      <label className="mb-voice-opt"><input type="checkbox" checked={speak} onChange={(e) => { setSpeak(e.target.checked); if (!e.target.checked) window.speechSynthesis?.cancel(); }} /> Speak replies</label>
    </div>
    <form onSubmit={submit} className="mb-voice-row">
      <label htmlFor="voice-typed" className="sr-only">Type a command</label>
      <input id="voice-typed" data-testid="voice-typed" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Or type: status, list tasks, create a task to…" maxLength={1000} />
      <button type="submit" data-testid="voice-send">Send</button>
    </form>
    {note && <p className="mb-warn" role="status">{note}</p>}
    <ol className="mb-voice-log" aria-label="Voice transcript">
      {replies.length === 0 && <li className="mb-voice-empty">No records yet</li>}
      {replies.map((r, i) => <li key={i} className="mb-voice-card" data-testid="voice-card">
        {r.heard && <p className="mb-voice-heard"><strong>You:</strong> {r.heard}</p>}
        <p className={r.tool === 'error' ? 'mb-bad' : r.tool === 'refused' ? 'mb-warn' : undefined}><strong>MeTaBos:</strong> {r.text}</p>
        {r.links.length > 0 && <p className="mb-voice-links">{r.links.map((l) => <a key={l.href + l.label} href={l.href}>{l.label}</a>)}</p>}
        <p className="mb-voice-meta">{r.stt ? `Heard by ${r.stt.model}` : 'Typed or browser speech'} · intent by {r.via}{r.tool !== 'error' ? ` · ${r.tool}` : ''}</p>
      </li>)}
    </ol>
  </section>;
}
