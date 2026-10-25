# MuzeBOS verification — 2026-10-25

Tested implementation commit: `6a69c593414112820bc55c4f124af39aec3dc939`.
The Git tree of the uploaded implementation exactly matched the local source
index used for qualification: `9f2a7b2bba7625083d9d976da8f5d51ba3113c2f`.
This report and machine-readable summaries are documentation-only additions.

| Gate | Result | Evidence |
| --- | --- | --- |
| Dependency installation | PASS | `npm ci` on Node 22.23.4 |
| TypeScript | PASS | `npm run typecheck` exited 0 |
| Full automated suite | PASS | 358 files passed; 4,782 tests passed; 8 explicitly skipped |
| Production build | PASS | Next.js 14.2.35 optimized build completed |
| New commerce tests | PASS | 20 domain, HTTP and authorization boundary tests |
| HTTP browser workflow | PASS | Desktop and 390px mobile checks on production build |
| Draft calculations | PASS | INR 399.98 subtotal + INR 72.00 tax = INR 471.98 |
| Approval binding/replay/expiry | PASS | Automated domain tests |
| Competing stock approvals | PASS | Separate SQLite connections cannot oversell |
| Transaction rollback | PASS | Failed later line restores earlier stock and movements |
| Persistence and recovery | PASS | Restart snapshot and SQLite online backup/restore tests |
| Origin/CSRF and operator session | PASS | Handler tests; internal Next URL rewrite regression covered |
| Graph selection and mobile overflow | PASS | Browser-driven checks |
| GitHub-hosted CI | NOT RUN | Local results do not stand in for a completed hosted workflow |
| Live Meta messaging/vision | BLOCKED | Commerce adapters and configured external account required |
| Provider-verified settlement | BLOCKED | Payment-provider adapter/account/webhooks required |
| Passkeys and multi-user RBAC | NOT RUN | Not implemented in this local preview |
| Tenant isolation | NOT RUN | Single operator/store only; no multi-tenant claim |
| Durable commerce workers | NOT RUN | Not implemented; new commerce operations are synchronous |
| Physical Android testing | NOT RUN | Mobile browser layout is not device qualification |
| Independent security assessment | NOT RUN | No independent assessor has reviewed this release |
| Production TLS/monitoring/recovery drill | NOT RUN | Separate deployment qualification required |

## Browser story

Customer creation → product creation → exact invoice draft → explicit approval
→ invoice issuance → pending payment → explicit manual reconciliation → reload
→ persisted stock of three units → verified audit view → graph-node selection
→ mobile layout without horizontal page overflow. No browser runtime errors.

The browser tests used disposable local databases, manually entered test records,
and the real application API. They did not call external providers or claim
real-world transactions. Test data is excluded from the source archive and git.

The new commerce endpoint rejects cross-site/missing-origin mutations, changed
idempotency payloads, invalid input and oversized bodies. Those checks do not
constitute an independent security certification of all inherited FounderOS tools.

## Reproduce

```bash
npm ci
npm run typecheck
npm test -- --maxWorkers=4 --minWorkers=1
npm run build
```

For the browser test, install Chromium through Playwright, start the app with
fresh `MUZEBOS_DB` and `GLADOS_DB` paths, then run `npm run test:browser` from
another terminal. Never use a real business database: the test writes records.
A restricted host used an explicitly supplied Chromium binary for this run.

The production build retains an inherited optional SDK dependency-resolution
warning from `@miosa/sdk`; it completes successfully. No warning is represented
as external integration evidence.
