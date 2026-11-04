# PR integration and remaining work — 2026-11-03

## Delivery state

All 13 open PR heads observed at the start of this review are ancestors of local
branch `codex/integrate-all-20261103`. The exact reviewed heads and original target
branches are recorded in `pr-integration-20261103.json`.

**GitHub main and PR states have not been changed.** Automatic approval review
rejected the integration branch push, requiring an explicit operator yes for a
remote push under AGENTS.md. The ZIP is a locally integrated candidate, not an
already merged GitHub release. Publish the integration branch, qualify it in CI,
and merge it before calling the upstream PRs merged. Re-check current remote
heads first; any changes since the recorded snapshot need another review.

PR #24 was reconciled with an ancestry-only merge: its missions/goals functionality
already exists in the renamed `metabos` modules on main, with newer persistent
inference and payload-bound approvals. Reintroducing its old direct model calls
or `muzebos` modules would regress that behavior. No current implementation was
replaced by the historical version.

## Integration repairs

- Kept the Board → Issues → Rakazo/canvas → Home → Community dependency stack.
- Preserved private encrypted exports and the separate Rust hash-chain verifier.
- Regenerated the API reference from all 252 actual route files; added the new
  evidence-export GET route to the exhaustive authenticated smoke coverage.
- Reconciled MUSE database markers and Meta lead two-reviewer markers. Both now
  appear in Sanctum receipts. The dispatch service itself refuses approval until
  two distinct reviewers have signed the exact payload hash; the API check is
  retained too. Direct service calls cannot silently bypass this requirement.
- Bound community edit/delete ownership to immutable member IDs. Same display
  names no longer confer ownership; renames retain ownership. Existing rows with
  no author ID fail closed for self-edit; staff can still moderate deletions.
- Refused member-created announcement threads, which previously bypassed the
  staff-only announcement creation boundary.
- Kept community review labels in internal markers, not recipient message bodies.
  Provider limits now reject overlong messages rather than silently truncating them.
- Scoped Board status caches to each BusinessStore to prevent cross-workspace
  counts from being reused.
- Changed Meta token-presence status from "connected" to "configured"; mere
  credential presence is not a successful live connection check.
- Added a dedicated Rust `cargo test --locked` CI job. Kept the Node 22 test/build
  job and removed unsupported Vitest worker flags through the reviewed PRs.
- Updated the older Sanctum regression to use both reviewers and the stale shell
  assertion to protect the restored PR #46 geometry without reintroducing later
  overrides.

## Remaining work and limits

This is not a defensible 100/100 certification. A passing local suite does not
establish all optional integrations, production isolation or hackathon eligibility.

| Priority | Work | Completion evidence needed |
| --- | --- | --- |
| P0 | Publish and qualify this integration on GitHub | Explicit push approval, green Node and Rust CI, merged integration, refreshed PR list |
| P1 | Live Meta/Baseten/model qualification | Real permitted account, bounded approved request, observed model/usage and reviewed action; no fixtures represented as live |
| P1 | Live messaging and Graph qualification | Test-app tokens, required scopes/App Review, two reviewer identities, deliberate dry-run switch, provider receipt |
| P1 | Rakazo live compatibility | Real self-hosted instance; session auth, oRPC envelopes, bot creation, proposal tool installation and full reviewed send |
| P1 | Production security qualification | Independent review; real deployment/session/workspace isolation and backup/restore validation |
| P1 | Evidence trust extensions | Payload-bound FIDO2 reviewer signatures, independently retained checkpoints/external anchoring, separate cryptographic audit; hash commitments are not ZK |
| P2 | Hardware/runtime attestation | Real silicon/MicroVM/tool-sandbox attestations and isolated execution; R0–R4 remain honestly unproven where applicable |
| P2 | Meta CAPI | Consent collection and enforcement, event IDs/deduplication, verified Events Manager test receipt; current checklist correctly says not built |
| P2 | Billing/partner mode | Defined product requirements and implementation; current Meta integration lists this as partial |
| P2 | Browser accessibility/e2e | Run Board, Home, Canvas, Community and BOS suites with installed Chromium and axe; local browser download was unavailable here |
| P2 | Lint | Configure a maintained lint rule set and qualify existing code; Next's type/build step is not a full lint configuration |
| Owner | Hackathon submission | Confirm accepted track/existing-code eligibility with organizers; record video and obtain actual submission receipt |

No paid provider calls, real business messages, deployment, external invitation, hackathon
submission, hardware attestation or independent security certification was made
in this review. The historical audit documents remain historical; this report
records the current integration scope and does not relabel their past results.

## Validation

**Final local result:** 445 test files passed; 5,610 tests passed, 9 skipped,
0 failed. Typechecking, production build and authenticated production HTTP
approval/export flow passed. Production dependency audit: 0 advisories.

Final results are recorded in `integration-verification-20261103.json` and the
ZIP's `review/` logs. Nine inherited skipped tests are not counted as passes.
The host lacks Node's RSS interface; a temporary V8 memory-reporting fallback was
used for qualification only, outside the source tree and application startup.
Rust/Cargo is unavailable locally; its source and fixtures were reviewed and CI
now has an explicit Rust gate. Browser installation was attempted but failed;
no browser-interaction success is claimed.
