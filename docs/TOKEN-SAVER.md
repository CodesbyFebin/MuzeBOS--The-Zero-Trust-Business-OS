# Token saver (Meta Model API)

Code: `lib/metabos/ai/token-saver.ts`, `lib/metabos/ai/meta-call.ts`, `lib/metabos/ai/meta-budget.ts`. Tests: `tests/meta-budget-token-saver.test.ts` (fixture fetch only).

| Lever | What it does |
| --- | --- |
| Reasoning effort per task | classify / reply / draft `low`; analysis / plan `medium`; deep `high` only when the owner opts in (otherwise `medium`). Never `max`. Docs: https://dev.meta.ai/docs/reasoning |
| Hard output caps | classify 256, reply 512, draft 768, analysis 1536, plan 2048, deep 4096 (`max_tokens` / `max_output_tokens`; reasoning counts toward them). |
| Prompt-prefix order | System prompt and agent card first, variable data last (overdue drafts moved invoice data to the end). `cached_tokens` is recorded per call. |
| Exact-match cache | SQLite `mb_model_cache`, sha256 of model + params + messages, 24 h TTL; only for cacheable task classes and never for calls with side effects. |
| Deterministic first | Simple acknowledgements and opening-hours questions are answered by rules with no model call. |
| Shrink tool results | Truncates long strings and arrays, keeps id-like keys. |
| Top-k | Word-overlap ranking so each agent gets only its top-k tools and memory snippets. |
| Cheap routing | Contributor models by default; large models only for plan/deep. |

## Measured before/after (real calls, 28 Oct 2026, 13:27–13:28 IST)

Model `muse-spark-1.3-contributor`, chat completions, one call per row (n = 1, so the numbers vary run to run). "Before" = provider defaults (no effort, no max tokens). "After" = token-saver policy.

| Task | Before completion (reasoning) | After completion (reasoning) | Before USD | After USD |
| --- | --- | --- | --- | --- |
| reply | 655 (626) | 396 (364) — effort low, max 512 | 0.00013540 | 0.00008360 |
| classify | 217 (207) | 175 (165) — effort low, max 256 | 0.00004800 | 0.00003960 |
| draft | 780 (739) | 427 (381) — effort low, max 768 | 0.00016130 | 0.00009070 |
| **Total** | **1652** | **998** | **0.00034470** | **0.00021390** |

On these three calls, completion tokens dropped 39.6% and recorded cost 37.9%. Prompts were 44–53 tokens and `cached_tokens` was 0 on every call, so this run shows **no** measured saving from prompt caching. Cache hits and rule answers are covered by fixture tests only; no live saving is claimed for them.

## Sources checked (gh api, 28 Oct 2026)

| Repo | License | Stars | Use |
| --- | --- | --- | --- |
| zilliztech/GPTCache | MIT | 8216 | Idea only (exact-match cache); no code copied |
| lm-sys/RouteLLM | Apache-2.0 | 5647 | Idea only (route to the cheaper model); no code copied |
| microsoft/LLMLingua | MIT | 6779 | Not used. A prompt-compression side service was not built (it would be optional and off by default) |
| BerriAI/litellm | NOASSERTION (custom; enterprise dir separately licensed) | 62213 | Pattern only (Retry-After backoff, per-model price table) |
| tinyhumansai/openhuman | GPL-3.0 | 42380 | Pattern only (shrink tool results, keep ids); clean-room |
