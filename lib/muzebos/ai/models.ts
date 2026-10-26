/**
 * Verified model catalog and tier config for the Brain runtime.
 * Every id below was checked on 2026-10-26 against the source named in `source`.
 * Nothing here is a guess; models we could not verify are not listed.
 */
export type Tier = 'small' | 'medium' | 'large';
export type ProviderId = 'webllm' | 'openrouter' | 'meta' | 'local';
export type ModelRef = { provider: ProviderId; model: string; family: 'llama' | 'muse'; note: string };

export const SOURCES = {
  webllm: 'https://github.com/mlc-ai/web-llm (src/config.ts prebuiltAppConfig, npm @mlc-ai/web-llm 0.2.86)',
  openrouter: 'https://openrouter.ai/api/v1/models (public model list)',
  meta: 'https://dev.meta.ai/docs (Meta Model API, base https://api.meta.ai/v1)',
} as const;
export const VERIFIED_AT = '2026-10-26';
export const WEBLLM_VERSION = '0.2.86';

/** Per-token USD prices as published by OpenRouter on VERIFIED_AT (prompt / completion). Unknown = absent. */
export const PRICES: Record<string, { prompt: number; completion: number }> = {
  'meta/muse-wonder': { prompt: 0.000004, completion: 0.00002 },
  'meta/muse-spark-1.3': { prompt: 0.00000125, completion: 0.00000425 },
  'meta-llama/llama-3.1-8b-instruct': { prompt: 0.00000005, completion: 0.00000008 },
};

/** Tier config: ordered candidates. The router uses the first available one and records why. */
export const TIERS: Record<Tier, { label: string; purpose: string; candidates: ModelRef[] }> = {
  small: {
    label: 'Small', purpose: 'Short classification, extraction and drafting. Llama, in the browser when WebGPU is available.',
    candidates: [
      { provider: 'webllm', model: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', family: 'llama', note: 'Runs on this device via WebGPU; no data leaves the browser.' },
      { provider: 'local', model: 'env:MUZEBOS_LOCAL_MODEL', family: 'llama', note: 'Your own OpenAI-compatible server (Ollama, vLLM).' },
      { provider: 'openrouter', model: 'meta-llama/llama-3.2-3b-instruct', family: 'llama', note: 'Paid per token on your OpenRouter key (no free Llama variant listed).' },
      { provider: 'openrouter', model: 'meta-llama/llama-3.1-8b-instruct', family: 'llama', note: 'Paid per token on your OpenRouter key.' },
    ],
  },
  medium: {
    label: 'Medium', purpose: 'Multi-step reasoning over business records.',
    candidates: [
      { provider: 'openrouter', model: 'meta/muse-spark-1.3', family: 'muse', note: 'Muse Spark via OpenRouter.' },
      { provider: 'meta', model: 'muse-spark-1.3', family: 'muse', note: 'Muse Spark via the Meta Model API.' },
      { provider: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct', family: 'llama', note: 'Llama fallback.' },
    ],
  },
  large: {
    label: 'Large', purpose: 'Long, open-ended planning and analysis.',
    candidates: [
      { provider: 'openrouter', model: 'meta/muse-wonder', family: 'muse', note: 'Muse Wonder via OpenRouter (1M context).' },
      { provider: 'meta', model: 'muse-wonder-1.0', family: 'muse', note: 'Muse Wonder via the Meta Model API (preview).' },
      { provider: 'openrouter', model: 'meta-llama/llama-4-maverick', family: 'llama', note: 'Llama fallback.' },
    ],
  },
};

/** What we found about Muse, shown in the UI and PR. */
export const MUSE_FINDINGS = [
  'Muse is reachable over the network: OpenRouter lists meta/muse-wonder, meta/muse-spark-1.3 and others, and the Meta Model API serves muse-wonder-1.0 and muse-spark-1.3.',
  'Both need a key. Without OPENROUTER_API_KEY or META_MODEL_API_KEY the Muse adapters report "needs key" and the router falls back to Llama.',
  'Muse is not in the WebLLM prebuilt list, so no Muse model runs in the browser. The open-weight Muse Glimmer needs your own server (use the local adapter).',
  'Live Muse calls were not exercised in tests because no key was available.',
];
