'use client';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BrandMark } from '@/components/metabos/BrandMark';

/** Captions double as the optional narration script (browser speechSynthesis only, off by default). */
export const INTRO_CAPTIONS = [
  'MeTaBos. Your business operating system.',
  'AI copilots draft and propose. You approve every action through Jev.',
  'Start in Mission Control, or open Brain from the top of the side panel.',
];
const SEEN = 'mb-intro-seen';
const VOICE = 'mb-intro-voice';

export function OpeningIntro() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [voice, setVoice] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);
  const skipRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    try { sessionStorage.setItem(SEEN, '1'); } catch { /* storage blocked */ }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);
  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem(SEEN) === '1'; setVoice(localStorage.getItem(VOICE) === 'on'); } catch { /* storage blocked */ }
    setCanSpeak('speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined');
    // automated browsers skip it unless ?intro=1 asks for it
    const forced = new URLSearchParams(location.search).get('intro') === '1';
    if (forced || (!seen && !navigator.webdriver)) setOpen(true);
  }, []);
  useEffect(() => { if (open) skipRef.current?.focus(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);
  // advance captions; with narration on, wait for each line to finish speaking
  useEffect(() => {
    if (!open) return;
    const last = step >= INTRO_CAPTIONS.length - 1;
    if (voice && canSpeak) {
      const u = new SpeechSynthesisUtterance(INTRO_CAPTIONS[step]);
      u.onend = () => (last ? close() : setStep((s) => s + 1));
      window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
      return () => { u.onend = null; };
    }
    const t = window.setTimeout(() => (last ? close() : setStep((s) => s + 1)), 2200);
    return () => window.clearTimeout(t);
  }, [open, step, voice, canSpeak, close]);
  function toggleVoice() {
    const next = !voice; setVoice(next);
    try { localStorage.setItem(VOICE, next ? 'on' : 'off'); } catch { /* storage blocked */ }
    if (!next) window.speechSynthesis?.cancel();
  }
  if (!open) return null;
  return createPortal(
    <div className="mb-intro" role="dialog" aria-modal="true" aria-label="MeTaBos introduction" data-testid="opening-intro">
      <div className="mb-intro-lockup">
        <BrandMark size={72} className="mb-intro-mark" />
        <div className="mb-intro-word"><span>METABOS</span><span className="mb-intro-mode">OPERATOR MODE</span></div>
        <span className="mb-intro-accent" aria-hidden />
      </div>
      <p className="mb-intro-caption" aria-live="polite" data-testid="intro-caption">{INTRO_CAPTIONS[step]}</p>
      <div className="mb-intro-actions">
        {canSpeak && <button type="button" className="mb-button" aria-pressed={voice} onClick={toggleVoice}>{voice ? 'Mute narration' : 'Narrate (browser voice)'}</button>}
        <button ref={skipRef} type="button" className="mb-button mb-primary" onClick={close}>Skip intro</button>
      </div>
    </div>,
    document.body,
  );
}
