# Slice 9 audit: registry pages that rendered the status stub

Taken on feat/slice8e-talk-growth (PR #16) before slice 9. The registry had 220 pages: 83 available, 23 existing, 90 planned, 24 blocked. All 114 planned or blocked pages rendered `FeatureStub`.

## Group 1: DB-only (slice 9a, built on the module engine): 51 pages
8, 10, 13, 16, 17, 18, 19, 22, 40, 47, 49, 54, 56, 58, 59, 60, 72, 77, 78, 79, 83, 84, 86, 87, 95, 96, 97, 98, 100, 110, 115, 121, 122, 124, 125, 127, 128, 129, 132, 135, 136, 139, 140, 153, 154, 157, 158, 159, 164, 170, 172.
(170 AML was matched as provider-blocked by keyword, but rules over local invoices need no provider.)

## Group 2: provider-dependent (slice 9b, needs-credentials): 43 pages
Planned but needing a provider: 6 cart events, 12 enrichment, 14 omnichannel routing, 26 payment links, 28 escrow, 31 dunning, 35 payouts, 48 broadcast, 53 web chat, 57 contact sync, 76 dropship, 80 digital delivery, 88 email, 109 shipping, 120 payroll payments, 137 and 199 DNS, 145 model router, 155 translation, 156 vision, 174 regulatory filing.
Blocked on a provider: 32, 33, 34, 39, 41, 42, 43, 50, 51, 63, 89, 90, 94, 126, 142, 168, 179, 190, 191, 193, 194, 198.

## Group 3: infrastructure measured from this process, DB and filesystem (slice 9c): 20 pages
114, 130, 131, 133, 134, 138, 148, 175, 177, 182, 183, 184, 185, 187, 189, 192, 195, 196, 197, 200.

## 9b — provider pages (43)
New status `needs-credentials`: local records are real (module engine, full CRUD, evidence), the provider action is not.
Each page has an approval-bound outbox (draft → queued → cancelled). Approval binds a sha256 of the payload; the item
stays "queued, provider not connected". No sent/delivered/paid state exists (tested). Provider config is stored in
`mb_provider_config` as env-var references (must start `MUZEBOS_` or be the provider default); values are never stored
or returned. Test connection makes a real request when every reference resolves (Meta Graph `/me`, Razorpay
`/v1/payments`, Cloudflare token verify, OpenRouter `/key`, SMTP 220 banner, generic HTTPS GET) and otherwise reports
"Not configured". WebAuthn/service-mesh pages report "no live test".

Counts after 9b: available 134, existing 23, needs-credentials 43, planned 19, blocked 1 (the 20 infra pages remain for 9c).
Limits: no dispatch adapters; HTTP/SMTP tests prove reachability/auth only.

## 9c — infra pages (20)
`InfraWorkspace` server-renders measurements taken at request time (`lib/metabos/infra.ts`, also `GET /api/infra/:id`):
process (memoryUsage, cpuUsage, uptime, loadavg, cgroup memory.max), SQLite (PRAGMAs, mb_migrations, mb_audit with
hash-chain verification, workflow runs/steps, mb_commands, webhook deliveries) and filesystem (.next BUILD_ID/static,
public/, source files, DB file size). Read-only; no shell, no rebuild, no purge. Stated as limits: no rate limiter, DB not
encrypted at rest, single SQLite connection, no replication, source-derived pages show zero without sources.

Counts after 9c: available 154, existing 23, needs-credentials 43, planned 0, blocked 0.

## 9d: Mission Control layouts and the no-stub guarantee
- Widget layout (order and visibility of the 7 widgets) is stored in `mb_settings` under the key `mission.layout`. It is changed through `POST /api/mission-control/layout`, which requires an Idempotency-Key and validates on the server (unknown, repeated or empty layouts get a 422). Every save or reset writes an `mb_audit` entry.
- The UI has a "Customize layout" panel with add, remove, move up/down and restore default.
- `tests/metabos-mission-9d.test.ts` checks:
  - layout persistence across a restart, evidence and validation;
  - that every widget and the Connected Business graph change in response to records written to the store;
  - that none of the 220 registry routes renders FeatureStub. Dedicated pages are checked statically; the rest go through the dynamic page.
- `scripts/metabos-crawl-routes.mjs` crawls all 220 routes on desktop and mobile against a fresh DB. Each route must return 200 with no `.mb-stub`. It also runs the layout flow in the browser.
- Limitations:
  - The layout is for one workspace (there are no per-user layouts).
  - Widgets have a fixed set of 7 and cannot be resized.
  - The crawl only checks the 200 status and the absence of a stub; it does not test each page's behaviour.
