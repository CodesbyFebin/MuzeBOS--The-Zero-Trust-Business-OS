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
