# PR #46 shell restoration

Restores the desktop shell selected by the owner, using PR #46 (`fa9d32d62a716259a33904e1b901ea1169743ff0`) as the visual reference. Based on PR #57 (`4e81767b9f0af0449f865a1b5e6fb38b44ffa2b6`) so newer business features are preserved.

## Behavior

The existing registry-driven navigation components remain unchanged: 18 main destinations, five pinned utilities, Brain above category clusters, Ctrl/Command+K command palette, backend-sourced notifications, account menu, page-details drawer, mobile navigation drawer and bottom tabs.

The PR #48 side-panel overrides and PR #57 shell overrides are removed. The original PR #46 shell rules become authoritative again. The automatic opening intro is unmounted so a new session opens directly into the workspace. Its source remains archived in the codebase.

Newer page-level Mission Control v3 styling, widgets, live-data views, voice pages, adapters, passkeys, permissions and persistence are not rolled back. In particular, this restoration does not replace database files or import sample records. Category pages can contain newer widgets and tools beyond the screenshot.

## Scope and status

This is a visual shell restoration, not a release/security qualification of the entire stacked branch. Previously reported workspace mutation permission gaps and partial approval-bundle behavior are outside this patch and remain unresolved here. Live provider calls, physical-device inference, production deployment, and submission readiness are not claimed.

## Qualification — 2026-10-29

- Node 22.23.4; locked dependencies reused from the reviewed PR #57 snapshot.
- `npm run typecheck`: passed.
- `npm run build`: passed (Next.js 15.5.28 production build). Existing `@miosa/sdk` dynamic-import warning remains.
- Shell-focused Vitest run: 3 files, 12 tests passed.
- Full `npm test -- --maxWorkers=4`: 413 files passed, 2 failed; 5,350 tests passed, 2 timed out, 9 skipped. Failures: `tests/lab-ledger-retention.test.ts` AC-06-35 (30s) and `tests/lab-net-guard.test.ts` AC-08-17 (60s). Those Lab files and their implementation are unchanged by this restoration. This is not an all-green full-suite qualification.
- Isolated follow-up: the dry network guard passed in approximately 54 seconds. The retention timeout was reproduced on the unchanged PR #57 base (`repo-latest`, AC-06-35), independently of the restoration. No Lab implementation or timeout limit was changed.
- Production browser check: passed at 1440×900 and 390×844. Verified 18 destinations, five pinned utilities, 56px rail, 248px panel allocation (247px content plus divider), 52px topbar, Brain pin, Ctrl+K search, details drawer, secondary-panel collapse/expand, signed-out attention guidance, real signed-in owner and empty notification state, preserved voice page, 62px mobile tabs, 44px minimum tab targets, mobile route/drawer behavior, no horizontal overflow and no browser runtime errors.
- Compared restored navigation source to PR #46: `Sidebar.tsx`, `WorkspaceNavigation.tsx`, `MetaTopbar.tsx` and `ShellExtras.tsx` are identical.
- No live model calls, payment operations or production deployment performed. Only disposable fictional owner setup was used for browser checks.

Reproduce the browser check against a disposable production server:

```sh
TEST_BASE_URL=http://127.0.0.1:4126 node scripts/verify-pr46-restoration.mjs
```

Optional: set `TEST_CHROMIUM_PATH` for a custom Chromium binary and `SHOTS_DIR` for internal QA screenshots. Do not point this script at a real business database; it uses `signInOwner` to initialize a fictional workspace.

The restoration is prepared for a draft PR on top of `feat/mission-v3`; no existing PR or default-branch update is merged by this work.
