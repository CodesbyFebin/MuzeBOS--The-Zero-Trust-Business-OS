/**
 * Muse Voice Transcribe (verified 28 Oct 2026 at dev.meta.ai/docs/api-reference/voice/transcribe):
 * POST https://api.meta.ai/v1/asr/transcribe, multipart/form-data with `request` (JSON: model, audioEncoding WAV, mode
 * PUSH_TO_TALK) and `audio` (WAV, max 10 min / 32 MB), Authorization: Bearer. The JSON response has sessionId, transcript,
 * audioDurationMs and turns. Audio is held in memory for this one request and is never written to disk or the DB.
 * STT pricing is not published on the pricing page we read, so the cap check refuses STT once the cap is reached;
 * the per-call cost is recorded as unknown, not guessed.
 */
import type { BusinessStore } from '../store';
import { metaBudget, PER_CENT } from '../ai/meta-budget';
import { META_API } from '../ai/meta-call';
export const STT_MODEL = 'muse-voice-transcribe-1.0';
export const STT_URL = `${META_API}/asr/transcribe`;
export class SttError extends Error { constructor(message: string, readonly status: number) { super(message); } }
export async function transcribe(store: BusinessStore, wav: Blob, key: string | null, f: typeof fetch = fetch) {
  if (!key) throw new SttError('Not connected — set MODEL_API_KEY for Muse Voice Transcribe', 503);
  if (wav.size > 32 * 1024 * 1024) throw new SttError('Recording too large (32 MB max)', 413);
  const b = metaBudget(store, 1);
  if (b.spentPico + b.reservedPico >= b.capMinor * PER_CENT) throw new SttError('Meta spend cap reached; no request sent', 402);
  const form = new FormData();
  form.append('request', new Blob([JSON.stringify({ model: STT_MODEL, audioEncoding: 'WAV', mode: 'PUSH_TO_TALK' })], { type: 'application/json' }));
  form.append('audio', wav, 'command.wav');
  const t = Date.now();
  const r = await f(STT_URL, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30_000), headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' }, body: form });
  const raw = await r.text();
  if (!r.ok) {
    store.transact(() => store.appendEvidence('voice.stt', STT_MODEL, `HTTP ${r.status}`));
    throw new SttError(r.status === 402 ? 'Billing not set up' : r.status === 429 ? 'Transcription rate limit; try again' : `Transcription failed (HTTP ${r.status})`, r.status === 402 ? 402 : 502);
  }
  let j: any; try { j = JSON.parse(raw); } catch { throw new SttError('Transcription returned non-JSON', 502); }
  const out = { transcript: String(j?.transcript ?? '').trim(), audioDurationMs: Number(j?.audioDurationMs) || 0, sessionId: String(j?.sessionId ?? ''), ms: Date.now() - t };
  store.transact(() => store.appendEvidence('voice.stt', out.sessionId || STT_MODEL, `${STT_MODEL}: ${out.audioDurationMs} ms audio, ${out.transcript.length} chars, ${out.ms} ms; cost unknown (STT price not verified); audio not stored`));
  return out;
}
