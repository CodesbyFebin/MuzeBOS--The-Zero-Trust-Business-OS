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
