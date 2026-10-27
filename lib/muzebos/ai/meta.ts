/**
 * Meta model adapters added during the Meta Global AI Developer Hackathon (Oct 27 - Nov 4, 2026).
 * Endpoints and model ids were read from public docs on 2026-10-27:
 *  - https://dev.meta.ai/docs/models and /docs/protocols/chat-completions (base https://api.meta.ai/v1)
 *  - https://www.baseten.co/library/muse-spark-open/ and docs.baseten.co Model APIs (base https://inference.baseten.co/v1)
 *  - Hackathon guide: use meta-models/muse-spark-open-1026 on Baseten.
 * None of these calls have been run against the live services from this repo yet (no key on the build box).
 * Keys are read from env on the server and never returned.
 */
export const META_BASE = 'https://api.meta.ai/v1';
export const BASETEN_BASE = 'https://inference.baseten.co/v1';
export const META_MODELS = {
  spark: 'muse-spark-1.3',
  wonder: 'muse-wonder-1.0',
  image: 'muse-image-1.0',
  transcribe: 'muse-voice-transcribe-1.0',
  sam: 'sam-3.1',
} as const;
export const BASETEN_MUSE_SPARK_OPEN = 'meta-models/muse-spark-open-1026';

type Env = Record<string, string | undefined>;
type Fetch = typeof fetch;
export type Msg = { role: 'system' | 'developer' | 'user' | 'assistant'; content: string };
export type LiveChat = { text: string; model: string; provider: 'meta' | 'baseten'; usage: unknown; live: true };

/** The Meta docs name the variable MODEL_API_KEY; MuzeBOS also accepts META_MODEL_API_KEY. */
export const metaKey = (env: Env = process.env) => (env.META_MODEL_API_KEY || env.MODEL_API_KEY)?.trim() || null;
export const basetenKey = (env: Env = process.env) => env.BASETEN_API_KEY?.trim() || null;

async function post(f: Fetch, url: string, key: string, body: unknown, who: string, signal?: AbortSignal) {
  const res = await f(url, { method: 'POST', signal, headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => null) as any;
  if (!res.ok) throw new Error(`${who} returned ${res.status}${json?.error?.message ? `: ${String(json.error.message).slice(0, 200)}` : ''}`);
  return json;
}

function chatText(json: any, who: string) {
  const text = json?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text) throw new Error(`${who} returned no message`);
  return text;
}

/** Muse Spark / Muse Wonder through the OpenAI-compatible Chat Completions endpoint. */
export async function metaChat(model: string, messages: Msg[], opts: { env?: Env; fetch?: Fetch; reasoningEffort?: 'low' | 'medium' | 'high'; signal?: AbortSignal } = {}): Promise<LiveChat> {
  const key = metaKey(opts.env); if (!key) throw new Error('Meta Model API needs META_MODEL_API_KEY (or MODEL_API_KEY)');
  const json = await post(opts.fetch ?? fetch, `${META_BASE}/chat/completions`, key, { model, messages, ...(opts.reasoningEffort ? { reasoning_effort: opts.reasoningEffort } : {}) }, 'meta', opts.signal);
  return { text: chatText(json, 'meta'), model: String(json.model ?? model), provider: 'meta', usage: json.usage ?? null, live: true };
}

/** Muse Spark Open (open weights) served by Baseten Model APIs. */
export async function basetenChat(messages: Msg[], opts: { env?: Env; fetch?: Fetch; model?: string; signal?: AbortSignal } = {}): Promise<LiveChat> {
  const key = basetenKey(opts.env); if (!key) throw new Error('Baseten needs BASETEN_API_KEY');
  const model = opts.model ?? BASETEN_MUSE_SPARK_OPEN;
  const json = await post(opts.fetch ?? fetch, `${BASETEN_BASE}/chat/completions`, key, { model, messages }, 'baseten', opts.signal);
  return { text: chatText(json, 'baseten'), model: String(json.model ?? model), provider: 'baseten', usage: json.usage ?? null, live: true };
}

/** Muse Image single-shot generation (POST /v1/images/generations, documented on /docs/models).
 *  Response shape assumed OpenAI-style data[0].b64_json | url; unverified until a live call. */
export async function metaImage(prompt: string, opts: { env?: Env; fetch?: Fetch } = {}) {
  const key = metaKey(opts.env); if (!key) throw new Error('Meta Model API needs META_MODEL_API_KEY (or MODEL_API_KEY)');
  const json = await post(opts.fetch ?? fetch, `${META_BASE}/images/generations`, key, { model: META_MODELS.image, prompt }, 'meta-image');
  const d = json?.data?.[0];
  if (!d || (typeof d.b64_json !== 'string' && typeof d.url !== 'string')) throw new Error('meta-image returned no image');
  return { b64: d.b64_json ?? null, url: d.url ?? null, model: META_MODELS.image };
}

/** Muse Voice Transcribe file endpoint (POST /v1/asr/transcribe). Field names follow the OpenAI
 *  transcription convention (file, model); unverified until a live call. */
export async function metaTranscribe(audio: Blob, filename: string, opts: { env?: Env; fetch?: Fetch } = {}) {
  const key = metaKey(opts.env); if (!key) throw new Error('Meta Model API needs META_MODEL_API_KEY (or MODEL_API_KEY)');
  const form = new FormData(); form.append('model', META_MODELS.transcribe); form.append('file', audio, filename);
  const res = await (opts.fetch ?? fetch)(`${META_BASE}/asr/transcribe`, { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: form });
  const json = await res.json().catch(() => null) as any;
  if (!res.ok) throw new Error(`meta-transcribe returned ${res.status}`);
  if (typeof json?.text !== 'string') throw new Error('meta-transcribe returned no text');
  return { text: json.text as string, model: META_MODELS.transcribe };
}
