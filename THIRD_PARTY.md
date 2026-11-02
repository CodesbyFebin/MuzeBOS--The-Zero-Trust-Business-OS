# Third-party references
These repositories were studied during the event. MeTaBos code inspired by them is a clean-room re-implementation: no source was copied. Any file that does adapt code must carry `// adapted-from: <repo/path>, built during event` and be listed under "Adapted files" below.
| Repo | Licence | Status |
|---|---|---|
| matiasbattocchia/open-bsp-api | Unlicense | may adapt (attribution courtesy) |
| CatchTheTornado/open-agents-builder | MIT © authors | may adapt with notice |
| melgarafael/DeskcommCRM | MIT | may adapt with notice |
| Miosa-osa/BusinessOS | Apache-2.0 | may adapt, keep NOTICE |
| Sri-Krishna-V/awesome-adk-agents | Apache-2.0 | may adapt, keep NOTICE |
| Denis2054/Building-Business-Ready-GenAI-Systems | MIT | may adapt with notice |
| oc8-ai/oc8 | LGPL-3.0 | pattern-only |
| ToolJet/ToolJet | AGPL-3.0 | pattern-only |
| h100envy/crawlhive-brain | none | pattern-only |

## Patterns used (clean-room, no code copied)
| MeTaBos file | Pattern | Source |
|---|---|---|
| lib/metabos/talk/core.ts | pause the bot when a human replies (takeover) | open-bsp-api |
| lib/metabos/talk/core.ts | opt-out registry checked before send | DeskcommCRM |
| lib/metabos/talk/service.ts | sentiment-triggered handoff with a briefing card; follow-up after silence | DeskcommCRM, oc8 (pattern only) |
| lib/metabos/talk/service.ts | approve agent actions from a chat reply | open-agents-builder |
| lib/metabos/brain/ops.ts | flow combinators (sequence, parallel, oneOf, forEach) plus an evaluator loop | open-agents-builder, awesome-adk-agents |
| lib/metabos/brain/metering.ts | per-agent spend metering and monthly caps | oc8 (pattern only) |
| lib/metabos/brain/ops.ts | tool risk tiers; high risk always gated | open-agents-builder |
| lib/metabos/brain/ops.ts | counterparty risk memory with graded outcomes | crawlhive-brain (pattern only) |
| lib/metabos/data/service.ts | question to read-only SQL analyst that shows the query it ran | google/adk-samples data-science agent (Apache-2.0, pattern only) |
| lib/metabos/data/service.ts | customer data export and redaction | DeskcommCRM (MIT, pattern only) |
| lib/metabos/data/service.ts | monthly sales goals against actuals | DeskcommCRM (MIT, pattern only) |

## Adapted files
None yet.

## Token saver ideas (pattern-only, no code copied; checked with gh api on 28 Oct 2026)
- zilliztech/GPTCache (MIT, 8216 stars), exact-match response cache idea. Credit: Zilliz and GPTCache contributors.
- lm-sys/RouteLLM (Apache-2.0, 5647 stars), cheap-model routing idea. Credit: LMSYS.
- BerriAI/litellm (license reported as NOASSERTION), Retry-After backoff and per-model price table patterns. Credit: BerriAI.
- tinyhumansai/openhuman (GPL-3.0, 42380 stars), shrinking tool results while keeping ids; clean-room re-implementation. Credit: tinyhumansai.
- microsoft/LLMLingua (MIT, 6779 stars) was reviewed and not used.

## Llama (optional local tier) — Built with Llama
- Llama 3.2 1B Instruct and Llama Guard 3 1B (GGUF Q4_K_M, run by llama.cpp b11946 as a separate process; no weights or llama.cpp code are in this repo).
- Llama 3.2 is licensed under the Llama 3.2 Community License, Copyright © Meta Platforms, Inc. All Rights Reserved. Use must follow the Llama Acceptable Use Policy (llama.com/llama3_2/use-policy).
- "Built with Llama" is shown on /help and in AI settings.
- Sarvam-Translate is GPL-3.0. It may only run as a separate local service; none of its code is copied here.

## Design prototypes reviewed (Agent Hub, MUSE companion) — 2026-11-02

| Source | What it contained | Licence finding | What shipped |
|---|---|---|---|
| `designs/muse-companion.html` | Bundled **three.js** (header: "Copyright 2010-2021 Three.js Authors", MIT) plus a "Ported GPU-fur creature engine" with no author or licence. It also pulled Google Fonts and called `api.meta.ai` / `127.0.0.1`. Its fleet console printed random lines. | three.js is MIT, but it is **not used**. The fur engine's origin is unclear, so **none of its code was copied**. | `components/metabos/muse/MuseAvatar.tsx` is a clean-room Canvas2D avatar written from the visual idea only (fur, coat, listening/speaking states). It has no WebGL, no three.js and no network calls. The fake console was replaced by panels that read real APIs. |
| `designs/muse-mascot.png` | A mascot image used as a visual reference. | Supplied by the owner. | Not bundled. It was used only as a reference for the avatar's shape and colours. |
| `designs/agent-command-center.*` | A Discord-style layout with jsdelivr Geist fonts, `alert()` stubs and mock workspaces and people. | Owner's prototype. | Only the layout idea was used. `components/metabos/hub/AgentHub.tsx` was rewritten from scratch on real swarm, draft and Jev data, with no CDN fonts and no mock data. Meta and Discord colours were replaced with the MeTaBos palette. |

### MeTa Server design inputs (t59: a.txt, b.html, c.txt, d.txt) — reviewed, no code copied
- a.txt / c.txt (owner codesbyfebin, stated "License MIT") and b.html ("Meta AgentVerse OS — Discord for Meta × Git for Agents"): layout ideas only (server rail, channels, commit-style log). Their CDN assets (jsdelivr Geist/JetBrains fonts, cdnjs three.js r128, pixi.js 7.3.2), mock data, ui-avatars.com images and "fully wired"/"auto-setup"/OAuth claims were not used or adopted.
- d.txt ("Meta Agentverse Unified Suite" chat transcript): no licence stated, so no code was reused. Ideas used: one channel per Meta product, personal vs business mode. Its env names (META_APP_ID, META_APP_SECRET, META_VERIFY_TOKEN) appear only as setup notes; no adapter reads them and no OAuth or auto-setup runs.
