# Slice 8 plan: remaining registry pages

Generated from the live registry (lib/muzebos/registry.ts) on 2026-10-26 before slice 8 work. 139 pages were planned and 25 blocked.

Rule: a page moves to `available` only when its module or screen exists and tests cover it. Everything else keeps an honest stub listing its dependencies.

Legend for "needs":
- **DB only**: buildable on the local SQLite store with validation, state machine and evidence.
- **provider**: needs an external account, credentials or a verified adapter.
- **infra / larger model**: needs runtime infrastructure, a bigger data model, or a subsystem that does not exist yet (editor, queue, telemetry pipeline, ...).

## Batch (a) Orders + Stock core - DB only, built in this slice

| Pillar | Menu | Page | Needs |
|---|---|---|---|
| 2 | orders | POS Terminal | DB only |
| 7 | orders | Returns & Refunds | DB only |
| 9 | orders | Gift Cards & Credits | DB only |
| 11 | orders | B2B Quote CPQ | DB only |
| 15 | orders | Pre-Order & Waitlist | DB only |
| 64 | stock | Low-Stock Alert | DB only |
| 65 | stock | Warehouse & Location Matrix | DB only |
| 66 | stock | Barcode & QR Generator | DB only |
| 67 | stock | Supplier Purchase Orders | DB only |
| 68 | stock | Variant Matrix | DB only |
| 69 | stock | Bundles & Kits | DB only |
| 70 | stock | Batch & Expiry | DB only |
| 71 | stock | Serial Number Registry | DB only |
| 73 | stock | Reorder Point Calculator | DB only |
| 74 | stock | Inter-Warehouse Transfer | DB only |
| 75 | stock | Shrinkage & Damage Ledger | DB only |

## Batch (b) Money - DB only, built in this slice (done: all six available, tests/muzebos-modules-b.test.ts + MODULE_BATCH=b browser run)

| Pillar | Menu | Page | Needs |
|---|---|---|---|
| 20 | orders | Tax Jurisdiction Matrix | DB only |
| 25 | money | Pricing & Discounts | DB only |
| 27 | money | Multi-Currency Converter | DB only |
| 30 | money | Dispute & Chargeback Logger | DB only |
| 37 | money | Credit Notes | DB only |
| 38 | money | Proforma to Invoice | DB only |

## Batch (c) Operations + Foundation - DB only, built in this slice

| Pillar | Menu | Page | Needs |
|---|---|---|---|
| 101 | operations | Staff Management | DB only |
| 103 | operations | Projects | DB only |
| 104 | operations | Attendance & Leave | DB only |
| 105 | operations | Time Tracker | DB only |
| 106 | operations | Meeting Notes | DB only |
| 107 | operations | SOP Library | DB only |
| 108 | operations | Vendors & Purchases | DB only |
| 111 | operations | Incident Log | DB only |
| 112 | operations | Onboarding Checklist | DB only |
| 113 | operations | Asset Assignment | DB only |
| 116 | operations | Performance Review | DB only |
| 117 | operations | Backup Drills | DB only |
| 118 | operations | Compliance Checklist | DB only |
| 163 | foundation | Documents Vault | DB only |
| 165 | foundation | Terms & Privacy Versions | DB only |
| 166 | foundation | Trademark & IP Tracker | DB only |
| 167 | foundation | License & Permit Registry | DB only |
| 169 | foundation | DPIA Review | DB only |
| 171 | foundation | Corporate Resolution Log | DB only |
| 173 | foundation | Grievance & Whistleblower Portal | DB only |
| 176 | foundation | Data Deletion Requests | DB only |
| 178 | foundation | Backup & Snapshot Ledger | DB only |

## Batch (e) Talk + Growth pieces that work without a provider - DB only, built in this slice (sending stays blocked)

| Pillar | Menu | Page | Needs |
|---|---|---|---|
| 46 | talk | Template Manager | DB only |
| 55 | talk | Canned Replies | DB only |
| 91 | growth | Content Calendar | DB only |
| 92 | growth | Coupon Engine | DB only |
| 93 | growth | UTM Tracker | DB only |
| 99 | growth | Growth Experiments | DB only |

## Batch (d) Settings, Account, Support, Upgrade, Developer

These menus are pinned utilities that already link to existing screens (setup, login, usage, roadmap, integrations, blueprint). They contain no planned pillars. Slice 8 adds a Developer API reference generated from the real `app/api` route files; no plans, prices or tiers are invented.

## Needs a provider or credentials (stay blocked/planned)

| Pillar | Menu | Page | Status | Needs |
|---|---|---|---|---|
| 6 | orders | Cart Abandonment | planned | storefront/cart events source |
| 10 | orders | Customer Self-Service Portal | planned | customer-facing auth and public portal hosting |
| 12 | orders | Lead Enrichment | planned | enrichment data provider |
| 13 | orders | Interaction Scoring | planned | channel interaction data (Slice 6 adapters) |
| 14 | orders | Omnichannel Router | planned | channel adapters (Slice 6) |
| 16 | orders | POI Location Directory | planned | maps/places provider |
| 18 | orders | Attribution Mapper | planned | ad platform attribution data |
| 19 | orders | Risk Pre-Screen | planned | risk/fraud data provider |
| 22 | money | GST Billing Engine | planned | GST e-invoice IRP / GSP credentials |
| 26 | money | Payment Link Generator | planned | payment provider link API |
| 28 | money | Splitter & Escrow | planned | payment provider escrow/split API |
| 31 | money | Dunning & Retry | planned | payment provider retries plus a sending channel |
| 32 | money | POS Hardware Bridge | blocked | POS hardware SDK |
| 33 | money | ACH & Wire Adapters | blocked | bank ACH/wire API |
| 34 | money | UPI AutoPay Mandate | blocked | UPI AutoPay mandate (NPCI via PSP) |
| 35 | money | Payouts | planned | payout provider API |
| 39 | money | Invoice Send | blocked | email/WhatsApp sending provider |
| 41 | talk | WhatsApp Hub | blocked | Meta WhatsApp Cloud API |
| 42 | talk | Instagram & Messenger Hub | blocked | Meta Instagram/Messenger API |
| 43 | talk | Facebook Shop Sync | blocked | Meta Commerce API |
| 47 | talk | Chat Bot Builder | planned | messaging channel adapter |
| 48 | talk | Broadcast Lists | planned | messaging channel adapter + opt-in records |
| 49 | talk | Auto-Responder | planned | messaging channel adapter |
| 50 | talk | Voice Note Transcribe | blocked | speech-to-text provider |
| 51 | talk | Call Log to CRM | blocked | telephony provider |
| 53 | talk | Web Chat Widget | planned | public widget hosting + realtime transport |
| 54 | talk | Bot-to-Human Handover | planned | messaging channel adapter |
| 56 | talk | CSAT Survey | planned | sending channel |
| 57 | talk | Contact Sync | planned | contacts provider (Google/phone) OAuth |
| 58 | talk | Spam Filter | planned | inbound channel adapter |
| 59 | talk | Sentiment Monitor | planned | model provider (Slice 9 router) + inbound messages |
| 60 | talk | Reviews Collector | planned | review platform APIs |
| 63 | stock | Shelf Scanner | blocked | camera/scanner hardware |
| 76 | stock | Dropship Vendor Bridge | planned | dropship vendor API |
| 78 | stock | POD Asset Matcher | planned | print-on-demand vendor API |
| 80 | stock | Digital Asset Delivery | planned | file hosting + signed delivery links |
| 86 | growth | SEO & Content | planned | search console / content provider |
| 88 | growth | Email Marketing | planned | email sending provider (ESP) |
| 89 | growth | Push Notifications | blocked | push provider (FCM/APNs) |
| 90 | growth | SMS Campaigns | blocked | SMS provider (DLT registration in India) |
| 94 | growth | Pixel Manager | blocked | ad pixels / conversion APIs |
| 95 | growth | Audience Builder | planned | ad platform audience APIs |
| 97 | growth | Influencer Tracker | planned | social platform APIs |
| 98 | growth | Trend Spotter | planned | trend data provider |
| 100 | growth | A/B Variant Dispatcher | planned | traffic splitting at the edge |
| 109 | operations | Shipping & Delivery | planned | courier/shipping provider APIs |
| 120 | operations | Payroll & Staff Payments | planned | payroll/bank payout provider |
| 126 | builder | CDN Controller | blocked | CDN provider |
| 137 | builder | Domain & DNS Manager | planned | DNS registrar/provider API |
| 142 | brain | Voice HQ | blocked | voice provider |
| 145 | brain | Model Router | planned | Slice 9 model router already exists at /workspace/brain/runtime; needs registry mapping review |
| 155 | brain | Translation Layer | planned | translation model provider |
| 156 | brain | Vision Service | planned | vision model provider |
| 157 | brain | Recommendations | planned | model provider + sufficient sales history |
| 158 | brain | Forecasting | planned | model provider + sufficient history |
| 159 | brain | Anomaly Detector | planned | model provider + history |
| 168 | foundation | KYC Inbound Hub | blocked | KYC provider |
| 170 | foundation | AML Transaction Monitor | blocked | AML screening provider |
| 172 | foundation | Customs & Tariff HSN Engine | planned | customs tariff dataset licence |
| 174 | foundation | Regulatory Reporting Dispatcher | planned | regulator filing APIs |
| 179 | foundation | Device Passkey Registrar | blocked | WebAuthn device registration in the auth layer |
| 189 | system | Container Console | blocked | container runtime |
| 190 | system | Edge Cache Matrix | blocked | edge/CDN provider |
| 191 | system | Object Storage Router | blocked | object storage provider |
| 193 | system | Service Mesh Directory | blocked | service mesh |
| 194 | system | Hardware Key Validator | blocked | hardware security keys |
| 198 | system | Failover Cluster Director | blocked | multi-node cluster |
| 199 | system | Domain, DNS & Certificates | planned | DNS/ACME provider |

## Needs infrastructure or a larger data model (stay planned)

Some of these could be DB-only later (8 Subscription Scheduler, 17 Wholesale Contract Ledger, 40 TCS report, 72 BOM, 77 Consignment, 79 RMA isolation, 87 Referrals & Loyalty, 110 File Approvals, 114 Access Log, 115 Automation Library, 164 Business Card Studio) but need multi-record or reporting behaviour beyond the module engine; they are deferred, not claimed.

| Pillar | Menu | Page | Status |
|---|---|---|---|
| 8 | orders | Subscription Scheduler | planned |
| 17 | orders | Wholesale Contract Ledger | planned |
| 40 | money | TCS & Tax Collected | planned |
| 72 | stock | BOM Configurator | planned |
| 77 | stock | Consignment Manager | planned |
| 79 | stock | RMA Stock Isolator | planned |
| 83 | growth | Online Store Builder | planned |
| 84 | growth | Website Builder | planned |
| 87 | growth | Referrals & Loyalty | planned |
| 96 | growth | Landing Page Builder | planned |
| 110 | operations | File Approvals | planned |
| 114 | operations | Access Log | planned |
| 115 | operations | Automation Library | planned |
| 121 | builder | Media & Assets Gallery | planned |
| 122 | builder | Content Block Studio | planned |
| 124 | builder | Form & Intake Constructor | planned |
| 125 | builder | Asset Transform Pipeline | planned |
| 127 | builder | Deep Linking Registry | planned |
| 128 | builder | Localization Matrix | planned |
| 129 | builder | Accessibility Verifier | planned |
| 130 | builder | Component Dependency Tree | planned |
| 131 | builder | Hydration Optimizer | planned |
| 132 | builder | UGC Moderation Desk | planned |
| 133 | builder | SSR State Hydrator | planned |
| 134 | builder | Font & Icon Optimizer | planned |
| 135 | builder | Design Token Exporter | planned |
| 136 | builder | App Builder & PWA Wrapper | planned |
| 138 | builder | Static Build Pipeline | planned |
| 139 | builder | Design System Tokens | planned |
| 140 | builder | UGC Store Gallery | planned |
| 148 | brain | Run Summary & Evidence | planned |
| 153 | brain | Evaluation Harness | planned |
| 154 | brain | System Cards Publisher | planned |
| 164 | foundation | Business Card Studio | planned |
| 175 | foundation | Data Residency Controls | planned |
| 177 | foundation | Encryption Configuration | planned |
| 182 | system | Workflows Broker | planned |
| 183 | system | Database Migration Ledger | planned |
| 184 | system | API Gateway & Rate Limiter | planned |
| 185 | system | Task Queue Orchestrator | planned |
| 187 | system | Telemetry & Logs | planned |
| 192 | system | Connection Pool Optimizer | planned |
| 195 | system | Zero-Trust Network Access | planned |
| 196 | system | Dead-Letter Remediation | planned |
| 197 | system | Crash Dump Parser | planned |
| 200 | system | Static Asset Pipeline | planned |

## Engine

DB-only pages are declarative modules (`lib/muzebos/modules`): typed fields validated server-side with zod, reference checks, uniqueness, an explicit state machine with domain guards and effects (stock moves, order drafts), optimistic versions (409 "Stale" on concurrent edits), idempotency keys, and a hash-chained evidence entry per change. Storage: migration v10 adds `mb_module_records` and `mb_stock_moves`. One generic API (`/api/modules/[module]`) and one generic page component render loading, empty, error and stale states.

Also fixed: the provider regex matched "voice" inside "Invoice" and "ach" inside other words, wrongly blocking "Proforma to Invoice". "Invoice Send" stays blocked because it needs a sending provider.
