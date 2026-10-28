# Release readiness (Meta Global AI Developer Hackathon)

Written on 2026-10-28 (IST) **before** changes on branch `fix/release-readiness`, stacked on PR #29 (`feat/os-auth-workspaces`, head 41dc9c9). Then updated with results at the end. Nothing here is merged, deployed, published or submitted. No credentials were rotated.

## Starting state (observed, not assumed)

- Stack: #24 ← … ← #26 ← #27 ← #28 ← #29 ← this branch. PR #23 (`fix/submission-audit-20261028`, head 84fedba) is OPEN and mergeable against `main`. **Our stack does not contain #23's fix.**
- Package manager: npm 11.21.1, lockfile `package-lock.json`. Node on this box: v20.19.2. CI (`.github/workflows/ci.yml`) uses Node 22 and runs `npm ci`, `npm run typecheck`, `npm test`, `npm run build`. CI does not run lint, browser tests or `npm audit`.
- Installed `next`: **14.2.35**. `next.config.mjs` has no `images` block, so it uses the defaults: the image optimizer is on, `dangerouslyAllowSVG` is false, and there are no `remotePatterns`. 6 files import `next/image`.
- Re-run of gates on PR #29 head (worktree): `tsc --noEmit` exit 0; `vitest run` 5047 passed, 1 failed (`tests/lab-v2-g-copy.test.ts`, which fails on the base branch too), 8 skipped; `next build` exit 0; route crawl 230/230 on desktop and mobile.
- `npm audit --omit=dev` (2026-10-28): 12 findings (1 critical, 7 high, 1 moderate, 3 low). The full list is in the Gate 2 section.

## Pre-change blockers

1. **Gate 1:** the approval link in the inference review pointed to `/workflows?view=governed`, which does not show agent proposals (the #23 finding). The fix is not on our stack.
2. **Gate 2:** `next@14.2.35` is in range of GHSA-2464-fhr4-w9xw (critical, `>=10.0.0 <=15.5.27`, patched 15.5.28 / 16.4.1) and ~25 more Next advisories. Other high-severity findings are axios, follow-redirects, nodemailer, postcss, source-map-js, undici and zod.
3. **Gate 3:** the demo's "reproduce a fixed reminder" step is synthetic. There is no evidence-linked overdue-invoice task.
4. **Gate 4:** the hackathon eligibility of an existing codebase is unconfirmed. The video and receipt status are unknown.

## Proposed changes

- Port #23's BrainRuntime `#jev` hash-tab fix, the corrected link, and its browser test (approve → execute → reload → exactly one durable reminder). Do not merge #23.
- Add unit and integration tests for reject, expiry, a changed proposal (hash-bound, needs a fresh approval), unauthorized access and the cross-workspace stance.
- Upgrade Next to ≥15.5.28 and fix the remaining findings with non-breaking updates. Document anything left open.
- Build an overdue-invoice reminder workflow from stored invoices: cited fields and dates, a bounded Meta draft or a clearly labelled fixture, Jev approval, sending only through a connected integration, and the result recorded in Activity.

## Results (2026-10-28 IST, box: Linux, Node v20.19.2, npm 11.21.1)

| Gate | Status | Evidence |
|---|---|---|
| 1 Approval journey | PASS (local fixture) | `tests/release-gate1-approval.test.ts` 7/7 (approve, then exactly one reminder; reject; expiry; changed or tampered proposal; refused tool; cross-DB). Browser: `npm run test:qualify-browser` exit 0 includes "separate Jev approval link", "approval before reminder execution", "durable approved reminder" and "Jev hash link reload". |
| 2 Dependencies | PASS (scan) | `npm audit --omit=dev` exit 0, 0 vulnerabilities after zod 4.6.7 (fix/zod4). Array bounds and streaming body cap tested. See docs/SECURITY-TRIAGE.md. A clean scan is not proof of a secure deployment. |
| 3 Overdue-invoice workflow | PASS (fixture) · live BLOCKED · real send UNVERIFIED | Branch `feat/gate3-overdue`. `/workspace/money/overdue` plus `/api/muzebos/overdue`, `lib/muzebos/overdue{,-core}.ts`, workflow `overdue-invoice-reminder` (only grant of `messages.send`). `tests/release-gate3-overdue.test.ts` 7/7: findings come only from stored pending invoices with no reference; cited fields; uncertainty (derived due date, assumed 30-day terms unless configured); a FIXTURE label and BLOCKED gate with no key or price and no network call; a live call capped (350 max_tokens, 15 s timeout, 64 KB response, 2,000-char prompt, 20 calls/day, USD 0.02/call, USD 0.25/day, which needs a configured price) and validated, with a bad, timed-out or invalid draft falling back to fixture; Jev hash approval required; with no sender, a `not_sent` record; with a sender, queued once and handed off once; reconcile after approval gives a stale hash and nothing sent; evidence chain verifies. Live: no Meta key on the box, so BLOCKED. Real send: no inbox or gsend on the box; the hand-off path is tested only with a stub sender. |
| 5 v4 port (records) | PASS (local tests) | Branch `feat/v4-port` (stacked on `feat/gate3-overdue`). `lib/muzebos/records.ts`, `POST /api/muzebos/records` (member + `finance.read`; backup needs `members.manage`; unauthenticated POST answers 403 locally). `tests/release-v4-port.test.ts` 5/5: UPI QR amount from the stored invoice, 409 without UPI or after reconcile; stock ledger balanced and detects a direct edit; tax CSV formula neutralising; redacted evidence export with chain status that detects tampering; backup reopened and verified. See docs/MERGE.md. Backups unencrypted and local only. |
| 6 Command Center (Friction Radar + features 2-7) | PASS (local tests) | Branch `feat/friction-radar` (stacked on `feat/v4-port`). `/workspace/money/command-center`, `/api/muzebos/command-center`, `lib/muzebos/command-center.ts`. `tests/release-command-center.test.ts` 6/6: radar items come from records with refs, severity order and a playbook for every kind; promises kept only by a bank reference; a payment claim never reconciles by itself, needs the exact amount, and references are single-use; brief figures carry sources and say UNVERIFIED on a broken chain; bundle approval is all-or-nothing under one hash, and drift approves nothing and is recorded; near-misses read from evidence. Deterministic, no model call. GET read access follows the existing `businessAccess` pattern (same as `/api/muzebos/overdue`). |
| 7 Demo seed (5-step story) | PASS (local fixture) | Branch `feat/demo-seed` (stacked on `feat/friction-radar`). `npm run seed:demo-story` writes fictional records (first evidence row `demo.seeded`), refuses a non-empty DB (checked: second run refused), uses 0-day demo terms instead of backdating. `tests/release-demo-story.test.ts` 2/2 walks radar → FIXTURE draft (no network) → Jev approval (not sent, no sender) → matched claim → chain verifies. Script in docs/hackathon/DEMO-SCRIPT.md. Live model call and real send are not exercised. |
| 8 Member-only business reads | PASS (local tests) | Branch `fix/member-reads` (stacked on `feat/demo-seed`). GET command-center and overdue now require a signed-in member with finance.read. `tests/release-member-reads.test.ts` 9/9: 401 signed-out, 401 forged token, 403 member role, 200 owner, workspace-A token rejected by workspace B. smoke-api expects 401; `next start` returns 401 for both. Other GET routes not yet audited for the same gap. |
| 4 Event and eligibility | UNCONFIRMED | Official page: https://dev.meta.ai/events/global-hackathon (submissions due Nov 4, 9:00 PM ET; Indie and Startup tracks). Existing-codebase eligibility is UNCONFIRMED. Question for the organizers: "May a project submitted to the Meta Global AI Developer Hackathon build on a codebase that existed before Oct 26, 2026, provided the Meta-model work done during the event is identified in the submission?" |

Gate 4 checklist: [ ] track chosen  [ ] demo video recorded  [ ] submission receipt received. None of these has been verified here.

### Commands and results
| Command | Exit | Result |
|---|---|---|
| `npx tsc --noEmit -p .` | 0 | 0 errors |
| `npx vitest run` | 1 | 5057 passed, 1 failed (`lab-v2-g-copy`, a known failure already on the base branch; `lab-v2-g.test.ts` also fails as a file), 8 skipped |
| `npm run build` | 0 | Next 15.5.28 |
| `node scripts/muzebos-crawl-routes.mjs` against `next start -p 4100` | 0 | 230/230 desktop and 230/230 mobile, 0 stubs |
| `npm run test:qualify-browser` | 0 | All suites PASS (Chromium, local fixture server) |
| `npm audit --omit=dev` | 1 | 1 high (zod) |
| lint | n/a | no lint script configured |

The 8 skipped tests are not counted as passing. Mocked or fixture-backed: the browser Jev journey uses a fixture inference server (`scripts/muzebos-jev-browser-fixture.ts`), and no paid model or provider was called. No HTTP smoke script is configured beyond the crawl.

### Verdict
**NOT READY.** Gate 3 works in fixture mode only (live Muse draft BLOCKED: no key; real send unverified), and Gate 4 eligibility is unconfirmed.

No defensible numeric score available.

### CI for #30 (Node 22, GitHub Actions)
Both `test` jobs passed (runs 40598410733 and 40598416214): `npm ci`, typecheck, test, build.

### Gate 3 run (feat/gate3-overdue, 2026-10-28 IST)
| Command | Exit | Result |
|---|---|---|
| `npx tsc --noEmit -p .` | 0 | 0 errors |
| `npx vitest run` | 1 | 5072 passed, 1 failed (known `lab-v2-g-copy`; `lab-v2-g.test.ts` file-level, same as base), 8 skipped |
| `npx vitest run tests/release-gate3-overdue.test.ts` | 0 | 7/7 |
| `npm run build` | 0 | Next 15.5.28 |
| crawl against `next start -p 4100` | 0 | 231/231 desktop and 231/231 mobile, 0 stubs (new page `/workspace/money/overdue`) |
| `npm run test:qualify-browser` | 0 | PASS |
| `npm audit --omit=dev` | 0 | 0 vulnerabilities |
| `GET /api/muzebos/overdue` (fresh DB) | 200 | `liveGate.reason`: "BLOCKED: no Meta model API key configured", `senderConnected:false` |

### CI for #31 (Node 22)
Both `test` jobs passed (runs 40600003065 and 40600007878).

## v4 port (feat/v4-port), checks run 2026-10-27 UTC

| Command | Exit | Result |
|---|---|---|
| `npx tsc --noEmit -p .` | 0 | 0 errors |
| `npx vitest run` | 1 | 1 failed (known `lab-v2-g-copy`; `lab-v2-g.test.ts` file-level, same as base), 8 skipped; api-reference regenerated, then 142/142 in api-reference + smoke-api |
| `npx vitest run tests/release-v4-port.test.ts` | 0 | 5/5 |
| `npm run build` | 0 | Next 15.5.28 |
| crawl against `next start -p 4100` | 0 | 231/231 desktop and 231/231 mobile, 0 stubs |
| `npm run test:qualify-browser` | 0 | PASS |
| `npm audit --omit=dev` | 0 | 0 vulnerabilities (with qrcode 1.5.x) |

No defensible numeric score available.

## Command Center (feat/friction-radar), checks run 2026-10-27 UTC

| Command | Exit | Result |
|---|---|---|
| `npx tsc --noEmit -p .` | 0 | 0 errors |
| `npx vitest run` | 1 | 5085 passed, 1 failed (known `lab-v2-g-copy`; `lab-v2-g.test.ts` file-level, same as base), 8 skipped |
| `npx vitest run tests/release-command-center.test.ts` | 0 | 6/6 |
| `npm run build` | 0 | Next 15.5.28 |
| crawl against `next start -p 4100` | 0 | 232/232 desktop and 232/232 mobile, 0 stubs |
| `npm run test:qualify-browser` | 0 | PASS |
| `npm audit --omit=dev` | 0 | 0 vulnerabilities |

No defensible numeric score available.

## Demo seed (feat/demo-seed), checks run 2026-10-27 UTC

| Command | Exit | Result |
|---|---|---|
| `npx tsc --noEmit -p .` | 0 | 0 errors |
| `npx vitest run` | 1 | 5087 passed, 1 failed (known `lab-v2-g-copy`; `lab-v2-g.test.ts` file-level), 8 skipped |
| `npm run build` | 0 | Next 15.5.28 |
| crawl | 0 | 232/232 desktop and mobile, 0 stubs |
| `npm run test:qualify-browser` | 0 | PASS |
| `npm audit --omit=dev` | 0 | 0 vulnerabilities |

No defensible numeric score available.
