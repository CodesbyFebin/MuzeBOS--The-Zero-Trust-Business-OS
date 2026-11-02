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

## three.js (MUSE fur simulator)
- three@0.169.0 (pinned to match the owner-supplied source project), MIT License, Copyright © 2010-2026 three.js authors (github.com/mrdoob/three.js). Used via npm, including examples/jsm OrbitControls and GPUComputationRenderer (MIT). It is lazy-loaded on the voice page only.
- The fur simulator code in lib/metabos/fur-sim is a clean-room implementation. The referenced fur-sim source was not found in either GitHub account (CodesbyFebin, Cyberteckmaster), and d.txt states no licence.
- Preset data (the Sakura Mochi, Golden Fluff, Midnight Velvet and Matcha Puff base and tip colours and groom values, plus the environment light intensities and wind) is ported from the owner-supplied copy /workspace/designs/fur-src2/src/lib/fur-sim (ui-presets.js, environments.ts). No licence is stated in that copy. No shader or engine code was copied from it. The shading is "Marschner-style", following the published Marschner et al. 2003 model; no code was taken from it.

## MuZe combined shell: owner-made AI Studio code (t74)
- Source: the owner's own Google AI Studio app (/workspace/designs/t74), made by codesbyfebin. It contained MetaServer, ServerRail, ChannelSidebar, TopBar, the PendingApprovals, UnifiedInbox, GitConsole, KnowledgeGraph, AdsManager, FleetConsole, ArenaView, SwarmView and MetaAppChannel views, MuzeSanctum, CommandPalette, utils/pureLogic.ts (with a test) and data/mockData.ts. No licence file is included; the code is the owner's own.
- How we used it: the component structure and views served as the layout reference, merged into components/metabos/agentverse. lib/metabos/muze/pure.ts adapts pureLogic (filterActivities, ROAS metrics, sparring commit message) to real records. Its '3.8x' ROAS fallback was removed (ROAS is null without real insights), and the local approve/send helpers were dropped because Jev and /api/dispatch handle those. tests/muze-pure.test.ts adapts the cases from pureLogic.test.ts.
- What we did not ship: data/mockData.ts and every mock usage (views show real APIs or "No records yet"), .aistudio/, public/assets/aistudio/, lucide-heavy marketing sections, pricing and templates.

## AgentVerse references (t77, t81, MUSE companion HTML, Meta blueprint): owner-made AI Studio material
- `designs/t77/*/App.tsx` (two commit-console variants), `designs/t81/App.tsx` + `index.css`, the "Meta AgentVerse OS" HTML attachment and the MUSE companion HTML (Sanctum tabs) were made by the repository owner in Google AI Studio and supplied as **design reference only**.
- No code, sample data, Discord palette or Meta brand colours were copied. Ideas taken: evidence-vault and firewall channels, the commit composer, Sanctum tabs, the voice language selector, the OAuth scope list and the Meta build-order page. The implementation in `components/metabos/meta`, `lib/metabos/meta`, `components/metabos/muze/MuzeSanctum.tsx` and `components/metabos/agentverse` is ours.
- Meta, Facebook, Instagram and WhatsApp are trademarks of Meta Platforms, Inc. MuZe has no relationship with Meta.

### AgentVerse presets / activity feed / Meta status (owner-made AI Studio code, t88)
Ported from the owner's own Google AI Studio export (`designs/t88/src`: `ServerPresetModal.tsx`, `views/AgentActivityFeed.tsx`, `views/MetaStatusMonitor.tsx`, `utils/pureLogic.ts` + `pureLogic.test.ts`, `types.ts`). Owner-made, not third-party licensed code.
- Ported: preset library + `saveCustomPreset`, channel-slug mapping from `deployServerFromPreset` (`lib/metabos/agentverse/presets.ts`); `filterActivities` (already in `lib/metabos/muze/pure.ts`); `calculateMetaHealth`, `filterMetaProducts`, manual status toggle (`lib/metabos/meta/status-pure.ts`, `lib/metabos/meta/status.ts`); adapted tests in `tests/agentverse-presets-status.test.ts`.
- Stripped: `mockData.ts`, invented latency/uptime numbers and 90-day/45-bar history, the status "simulator", `approveCommit`/`rejectCommit` (shipped without dispatch), `calculateRoasMetrics` mock ROAS, gradients and purple/cyan styling, "autonomous" wording. `.aistudio/` and `public/assets/aistudio/` were not used.
- Changed: status defaults to "Unknown" (no live feed is fetched); degraded/outage only from a labelled manual operator mark, which also holds matching dispatches (circuit breaker). Deploy creates a real workspace.
