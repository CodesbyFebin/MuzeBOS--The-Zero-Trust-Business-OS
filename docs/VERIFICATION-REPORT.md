# Verification report: batch 3 → Agent Hub / MUSE stack (PRs #61–#66)

Checked 2 Nov 2026, between 1:30 and 2:00 AM IST, on branch `feat/agent-hub` (draft PR #66). This report covers local checks only. It is not a production-readiness claim, and nothing has been merged or deployed.

## Checks
| Check | Result |
|---|---|
| `npx tsc --noEmit` | pass |
| `npx vitest run` (full) | 5376 passed, 9 skipped. 2 tests failed and 1 file failed to load, all in the lab area, which was already failing before this work: Node 20 has no `globSync` (`lab-v2-g*`), and `lab-ledger-retention` hit a 50 s timeout. |
| `npm run build` | pass. The only warning is the existing `@miosa/sdk` one. |
| Route crawl (`scripts/metabos-crawl-routes.mjs`) | 244/244 routes return 200 with 0 stubs on desktop and on mobile. All 184 legacy routes redirect. |
| Agent Hub + MUSE e2e (`scripts/e2e-hub-muse.mjs`) | pass. A channel and an agent were created; a composer draft showed "Jev: pending"; the ledger showed "chain verified"; the coat switched to violet; reduced-motion was captured. There were 0 page errors and 0 dialogs. |
| Theme + a11y (`scripts/hub-muse-audit.mjs`, axe-core 4 wcag2a/aa/21aa) | Hub: 0 axe violations and 0 blue or purple pixels; one link was under 44 px ("Review in Jev") and is fixed. MUSE: 0 violations, 0 blue or purple, 0 small targets. |
| Local swarm e2e (`scripts/e2e-local-swarm.mjs`) | pass. "Run on local swarm" ran the claw-local Llama-3.2-3B in 18–36 s at $0. Llama Guard returned `safe`, a Brain draft was saved, and Jev showed `awaiting_approval`. Nothing was sent. |
| Yao engine live | pass. `yao agent eval metabos.s01-l` returned a valid draft JSON through OpenRouter Llama 3.3 70B. |
| Yao full-app live e2e | **BLOCKED**. Yao is running on :5099, but no `MUZEBOS_YAO_ACCESS_TOKEN` has been issued (the API answers 401). The owner needs to sign in to Yao once and provide the token at runtime. The stream parser is tested against a live capture (`tests/fixtures/yao-sse-live-2026-10-28.txt`). |

## Per-area verdicts
| Area | Verdict | Why |
|---|---|---|
| Social drafting lane (#61) | READY | Draft → Guard → Jev, tested |
| Safe outputs, pipeline approval stop, GST MCP (#62) | READY | Tests plus crawl |
| hi/ml/ta via Sarvam claw (#63) | NOT READY | Real-language output needs a live Sarvam run that the owner reviews |
| Writing library (#64) | READY | Real records, tests |
| Claw swarms browser (#65) | READY | 1000 cards; local run verified end to end |
| Run on Yao from the app | BLOCKED | No Yao access token |
| Agent Hub (#66) | READY | e2e plus audits; real records only |
| MUSE companion (#66) | READY | e2e plus audits; clean-room avatar |
| External sends | BLOCKED by design | Only approved Jev items reach `/api/dispatch`; the Meta credentials are not live here |

## Claw cost totals (`./claw status`, 2 Nov 2026 ~1:40 AM IST)
1577 jobs done and 38 failed. 157 were escalated to the Meta fallback. API spend is **$0.023556 of the $5.00 cap**, which is 23,556 micro-USD. 1 approval is pending. Local servers: Llama-3.2-3B-Instruct-Q4_K_M on :8089 and Llama-Guard-3-1B on :8090.

## Reconciling with #58–#60 (owner's stack)
#58–#60 (`restore/pr46-shell` → `feat/arena-observed-office` → `feat/arena-3d-agents`) and this stack (#61–#66) both branch from #57, side by side. They were left untouched. A trial merge of `feat/agent-hub` with `origin/feat/arena-3d-agents` (done locally and aborted, nothing pushed) produced conflicts in 5 files only:
- `app/metabos.css`: both sides only append. Keep both blocks.
- `lib/metabos/api-reference.generated.json`: regenerate with `npx tsx scripts/gen-api-reference.ts`.
- `tests/metabos-mission-9d.test.ts` and `tests/metabos-workspace-modules.test.ts`: registry counts. Set them to the merged registry totals.
- `tests/smoke-api.test.ts`: union the route lists and `MEMBER_ONLY`.

`lib/metabos/registry.ts` and `tests/smoke.test.ts` merged cleanly. Suggested order: merge #58–#60 first, then rebase #61 onto #60 and fix the 5 files above, then re-run the crawl. The registry count rises by the number of pages Arena adds.

## MeTa Server (feat/meta-server, stacked on #66)

| Check | Result |
|---|---|
| tsc | pass |
| vitest | meta-server 7/7; full suite only pre-existing lab-* failures (globSync, timeouts) also failing on base |
| build | pass |
| crawl | desktop 245/245 200, mobile 245/245 200, 0 stubs, 184 legacy redirects |
| e2e-meta-server | OK (HQ, channel preview, ads draft, commits, connections, suite personal/business, swarm embed, mobile toggles) |
| a11y audit | 0 axe violations, 0 targets <44px, no off-palette colours on meta-server, agent-hub, voice |

Verdict: ready for review as a draft. Meta Suite products without adapters (Facebook, Threads, Messenger, Ads) show "Not connected"; all sends are drafts through Jev + /api/dispatch. Screenshots: /tmp/shots/meta-server-*.png, /tmp/shots/meta-suite-*.png.

## MUSE fur simulator — measured in headless Chromium with SwiftShader (software GL, no real GPU)
- Forced gpu tier (64 shells, 60k strands, GPGPU): 1 fps. Forced webgl tier (32 shells, 12k strands, CPU physics): 1–2 fps.
- Auto: software GL was detected, so it started on webgl, ran at 2 fps, and adaptively downgraded to the 2D fallback ("too slow for WebGL (2 fps)").
- Turning the GPU toggle off switched to the CPU tier. ?muse=2d forces the 2D avatar. Reduced motion renders on demand.
- getUserMedia was not called before the click; it was called once after it, with {video, audio:false}. Off-screen paused: true. 0 page errors. E2E OK.
- Not measured: real-GPU fps.
