# Arena verification — 2026-10-29

Base: PR #58 shell restoration, commit `6e3fbc67e10ec57d4753812157aea51f44682125`. Route `/workspace/brain/arena`; API `/api/metabos/arena`.

## Completed

- Node 22.23.4; Next.js 15.5.28. Pixi.js 8.22.0 added; no existing dependency versions changed. Production `npm audit --omit=dev`: zero reported advisories at qualification time.
- Typecheck passed. Clean production build passed. An earlier overlapping output-cleanup attempt failed with ENOTEMPTY; preserved that generated directory and reran the build alone. Existing `@miosa/sdk` dynamic-import warning remains.
- Initial focused suite: 35 tests passed. Updated page/API smoke registration and registry route coverage: 243 tests passed. Final Arena/registry contract run: 21 tests passed (overlaps these checks; counts are not additive).
- Full rerun: 414 test files passed, 2 failed; **5,358 tests passed, 2 failed, 9 skipped**. Failures are the previously observed `lab-ledger-retention` AC-06-35 30-second timeout and `lab-net-guard` AC-08-17 60-second timeout. Those implementations and timeout limits were not changed. The prior restoration review reproduced the retention failure on the unchanged PR #57 base. This is not an all-green full-suite claim.
- Production browser check at 1440×1000 and 390×844: signed-out denial; fictional owner sign-in; saving a skill version; context-to-pending-draft proposal; hash inspection; persistence after reload; YAML download; real Pixi WebGL canvas; stale snapshot retention after a failed refresh; mobile layout; sign-out clearing. Final resize assertion waits for the sidebar transition to settle. No browser runtime errors.
- A disposable fixture browser worker exercised exact-hash approval, actual claim/lease, scripted completion and parent-to-child delegation through the existing inference API. The scripted completion is explicitly test data, not model-generated output. Child drafts still await their own approval and the evidence chain verifies.
- No live provider calls, model downloads/inference, external messaging, payment actions, desktop OS installation, sandbox provisioning or production deployment performed.

## Repeat the browser check

Use a disposable local production server with isolated `GLADOS_DB` and `MUZEBOS_DB` paths, `GLADOS_DEFAULT_MODE=real`, and an empty test credential path. The script initializes a fictional owner and writes test drafts; never use a real business database.

```sh
TEST_BASE_URL=http://127.0.0.1:4136 node scripts/verify-arena-browser.mjs
```

Optional `TEST_CHROMIUM_PATH` selects a local Chromium binary; `SHOTS_DIR` saves internal QA captures. A browser without graphics support keeps the accessible HTML task list; the WebGL browser check uses software rendering in the test environment and does not qualify a physical-device GPU.

## Limits

No computer fleet, DID identity broker, zkVM proof system, automatic self-healing, cross-agent mailbox or public skill marketplace exists in this patch. The Arena is an observer plus an authenticated, versioned draft-plan editor. Existing authorization gaps in other routes and partial approval-bundle behavior from the earlier audit remain outside this patch. Kept as a separate draft PR; no existing PR merged.
