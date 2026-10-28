# Feature status matrix

Generated from lib/metabos/registry.ts. Do not edit by hand. "Available" means a MeTaBos operation works locally and has the listed tests; it is not a production-readiness claim. "Needs credentials" means local records work but the provider action is not wired.

Totals: available 168, existing 23, needs-credentials 43, planned 0, blocked 0 (234 pages).

## 01 Mission Control (/)

| Page | Route | Status | Permission | Evidence / dependencies |
|---|---|---|---|---|
| Mission Control | / | available | member | tests/metabos-mission.test.ts; tests/metabos-mission-9d.test.ts; scripts/metabos-mission-browser.mjs |

## 02 Orders (/workspace/orders)

| Page | Route | Status | Permission | Evidence / dependencies |
|---|---|---|---|---|
| Orders Pipeline | /workspace/orders/pipeline | available | member | tests/metabos-modules-a.test.ts; tests/metabos-issuance.test.ts; scripts/metabos-crawl-routes.mjs |
| POS Terminal | /workspace/orders/pos | available | member | tests/metabos-modules-a.test.ts; tests/metabos-issuance.test.ts; scripts/metabos-crawl-routes.mjs |
| Bookings & Appointments | /workspace/orders/bookings | available | member | tests/metabos-modules-a.test.ts; tests/metabos-issuance.test.ts; scripts/metabos-crawl-routes.mjs |
| CRM Profiles | /workspace/orders/customers | available | member | tests/metabos-modules-a.test.ts; tests/metabos-issuance.test.ts; scripts/metabos-crawl-routes.mjs |
| Deals & Pipeline | /workspace/orders/deals | existing | member |  |
| Cart Abandonment | /workspace/orders/abandoned-carts | needs-credentials | member | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |
| Returns & Refunds | /workspace/orders/returns | available | member | tests/metabos-modules-a.test.ts; tests/metabos-issuance.test.ts; scripts/metabos-crawl-routes.mjs |
| Subscription Scheduler | /workspace/orders/subscriptions | available | member | tests/metabos-modules-a.test.ts; tests/metabos-issuance.test.ts; scripts/metabos-crawl-routes.mjs |
| Gift Cards & Credits | /workspace/orders/credits | available | member | tests/metabos-modules-a.test.ts; tests/metabos-issuance.test.ts; scripts/metabos-crawl-routes.mjs |
| Customer Self-Service Portal | /workspace/orders/portal | available | member | tests/metabos-modules-a.test.ts; tests/metabos-issuance.test.ts; scripts/metabos-crawl-routes.mjs |
| B2B Quote CPQ | /workspace/orders/quotes | available | member | tests/metabos-modules-a.test.ts; tests/metabos-issuance.test.ts; scripts/metabos-crawl-routes.mjs |
| Lead Enrichment | /workspace/orders/enrichment | needs-credentials | member | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |
| Interaction Scoring | /workspace/orders/scoring | available | member | tests/metabos-modules-a.test.ts; tests/metabos-issuance.test.ts; scripts/metabos-crawl-routes.mjs |
| Omnichannel Router | /workspace/orders/routing | needs-credentials | member | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |
| Pre-Order & Waitlist | /workspace/orders/waitlists | available | member | tests/metabos-modules-a.test.ts; tests/metabos-issuance.test.ts; scripts/metabos-crawl-routes.mjs |
| POI Location Directory | /workspace/orders/locations | available | member | tests/metabos-modules-a.test.ts; tests/metabos-issuance.test.ts; scripts/metabos-crawl-routes.mjs |
| Wholesale Contract Ledger | /workspace/orders/contracts | available | member | tests/metabos-modules-a.test.ts; tests/metabos-issuance.test.ts; scripts/metabos-crawl-routes.mjs |
| Attribution Mapper | /workspace/orders/attribution | available | member | tests/metabos-modules-a.test.ts; tests/metabos-issuance.test.ts; scripts/metabos-crawl-routes.mjs |
| Risk Pre-Screen | /workspace/orders/risk | available | member | tests/metabos-modules-a.test.ts; tests/metabos-issuance.test.ts; scripts/metabos-crawl-routes.mjs |
| Tax Jurisdiction Matrix | /workspace/orders/tax-jurisdictions | available | member | tests/metabos-modules-a.test.ts; tests/metabos-issuance.test.ts; scripts/metabos-crawl-routes.mjs |

## 03 Money (/workspace/money)

| Page | Route | Status | Permission | Evidence / dependencies |
|---|---|---|---|---|
| Invoice Maker | /workspace/money/invoices | available | finance.read | tests/metabos-issuance.test.ts; tests/release-gate1-approval.test.ts; scripts/metabos-crawl-routes.mjs |
| GST Billing Engine | /workspace/money/gst | available | finance.read | tests/metabos-issuance.test.ts; tests/release-gate1-approval.test.ts; scripts/metabos-crawl-routes.mjs |
| Open UPI Gateway | /workspace/money/upi | available | finance.read | tests/metabos-issuance.test.ts; tests/release-gate1-approval.test.ts; scripts/metabos-crawl-routes.mjs |
| Payments & Settlements | /workspace/money/payments | available | finance.read | tests/metabos-issuance.test.ts; tests/release-gate1-approval.test.ts; scripts/metabos-crawl-routes.mjs |
| Pricing & Discounts | /workspace/money/pricing | available | finance.read | tests/metabos-issuance.test.ts; tests/release-gate1-approval.test.ts; scripts/metabos-crawl-routes.mjs |
| Command Center | /workspace/money/command-center | available | finance.read | tests/metabos-issuance.test.ts; tests/release-gate1-approval.test.ts; scripts/metabos-crawl-routes.mjs |
| Sales Pipeline | /workspace/money/pipeline | available | finance.read | tests/metabos-issuance.test.ts; tests/release-gate1-approval.test.ts; scripts/metabos-crawl-routes.mjs |
| Founder Dashboard | /workspace/money/dashboard | available | finance.read | tests/metabos-issuance.test.ts; tests/release-gate1-approval.test.ts; scripts/metabos-crawl-routes.mjs |
| Expense Approvals | /workspace/money/expenses | available | finance.read | tests/metabos-issuance.test.ts; tests/release-gate1-approval.test.ts; scripts/metabos-crawl-routes.mjs |
| Overdue Reminders | /workspace/money/overdue | available | finance.read | tests/metabos-issuance.test.ts; tests/release-gate1-approval.test.ts; scripts/metabos-crawl-routes.mjs |
| Payment Link Generator | /workspace/money/links | needs-credentials | finance.read | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |
| Multi-Currency Converter | /workspace/money/currencies | available | finance.read | tests/metabos-issuance.test.ts; tests/release-gate1-approval.test.ts; scripts/metabos-crawl-routes.mjs |
| Splitter & Escrow | /workspace/money/splits | needs-credentials | finance.read | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |
| Deduplicator | /workspace/money/idempotency | available | finance.read | tests/metabos-issuance.test.ts; tests/release-gate1-approval.test.ts; scripts/metabos-crawl-routes.mjs |
| Dispute & Chargeback Logger | /workspace/money/disputes | available | finance.read | tests/metabos-issuance.test.ts; tests/release-gate1-approval.test.ts; scripts/metabos-crawl-routes.mjs |
| Dunning & Retry | /workspace/money/dunning | needs-credentials | finance.read | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |
| POS Hardware Bridge | /workspace/money/terminals | needs-credentials | finance.read | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |
| ACH & Wire Adapters | /workspace/money/providers | needs-credentials | finance.read | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |
| UPI AutoPay Mandate | /workspace/money/mandates | needs-credentials | finance.read | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |
| Payouts | /workspace/money/payouts | needs-credentials | finance.read | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |
| Reconciliation | /workspace/money/reconciliation | available | finance.read | tests/metabos-issuance.test.ts; tests/release-gate1-approval.test.ts; scripts/metabos-crawl-routes.mjs |
| Credit Notes | /workspace/money/credit-notes | available | finance.read | tests/metabos-issuance.test.ts; tests/release-gate1-approval.test.ts; scripts/metabos-crawl-routes.mjs |
| Proforma to Invoice | /workspace/money/proformas | available | finance.read | tests/metabos-issuance.test.ts; tests/release-gate1-approval.test.ts; scripts/metabos-crawl-routes.mjs |
| Invoice Send | /workspace/money/delivery | needs-credentials | finance.read | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |
| TCS & Tax Collected | /workspace/money/tax-collected | available | finance.read | tests/metabos-issuance.test.ts; tests/release-gate1-approval.test.ts; scripts/metabos-crawl-routes.mjs |

## 04 Talk (/workspace/talk)

| Page | Route | Status | Permission | Evidence / dependencies |
|---|---|---|---|---|
| WhatsApp Hub | /workspace/talk/whatsapp | needs-credentials | member | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |
| Instagram & Messenger Hub | /workspace/talk/meta-inbox | needs-credentials | member | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |
| Facebook Shop Sync | /workspace/talk/shop-sync | needs-credentials | member | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |
| Business Inbox | /workspace/talk/inbox | existing | member |  |
| Notification Center | /workspace/talk/notifications | available | member | scripts/metabos-crawl-routes.mjs |
| Template Manager | /workspace/talk/templates | available | member | scripts/metabos-crawl-routes.mjs |
| Chat Bot Builder | /workspace/talk/bots | available | member | scripts/metabos-crawl-routes.mjs |
| Broadcast Lists | /workspace/talk/broadcasts | needs-credentials | member | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |
| Auto-Responder | /workspace/talk/responders | available | member | scripts/metabos-crawl-routes.mjs |
| Voice Note Transcribe | /workspace/talk/voice | needs-credentials | member | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |
| Call Log to CRM | /workspace/talk/calls | needs-credentials | member | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |
| Email Inbox | /workspace/talk/email | existing | member |  |
| Web Chat Widget | /workspace/talk/web-chat | needs-credentials | member | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |
| Bot-to-Human Handover | /workspace/talk/handover | available | member | scripts/metabos-crawl-routes.mjs |
| Canned Replies | /workspace/talk/replies | available | member | scripts/metabos-crawl-routes.mjs |
| CSAT Survey | /workspace/talk/surveys | available | member | scripts/metabos-crawl-routes.mjs |
| Contact Sync | /workspace/talk/contacts | needs-credentials | member | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |
| Spam Filter | /workspace/talk/spam | available | member | scripts/metabos-crawl-routes.mjs |
| Sentiment Monitor | /workspace/talk/sentiment | available | member | scripts/metabos-crawl-routes.mjs |
| Reviews Collector | /workspace/talk/reviews | available | member | scripts/metabos-crawl-routes.mjs |

## 05 Stock (/workspace/stock)

| Page | Route | Status | Permission | Evidence / dependencies |
|---|---|---|---|---|
| Product Catalog Graph | /workspace/stock/catalog | available | member | scripts/metabos-crawl-routes.mjs |
| Inventory Movements Ledger | /workspace/stock/movements | available | member | scripts/metabos-crawl-routes.mjs |
| Shelf Scanner | /workspace/stock/scanner | needs-credentials | member | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |
| Low-Stock Alert | /workspace/stock/alerts | available | member | scripts/metabos-crawl-routes.mjs |
| Warehouse & Location Matrix | /workspace/stock/locations | available | member | scripts/metabos-crawl-routes.mjs |
| Barcode & QR Generator | /workspace/stock/barcodes | available | member | scripts/metabos-crawl-routes.mjs |
| Supplier Purchase Orders | /workspace/stock/purchase-orders | available | member | scripts/metabos-crawl-routes.mjs |
| Variant Matrix | /workspace/stock/variants | available | member | scripts/metabos-crawl-routes.mjs |
| Bundles & Kits | /workspace/stock/bundles | available | member | scripts/metabos-crawl-routes.mjs |
| Batch & Expiry | /workspace/stock/batches | available | member | scripts/metabos-crawl-routes.mjs |
| Serial Number Registry | /workspace/stock/serials | available | member | scripts/metabos-crawl-routes.mjs |
| BOM Configurator | /workspace/stock/bom | available | member | scripts/metabos-crawl-routes.mjs |
| Reorder Point Calculator | /workspace/stock/reorder | available | member | scripts/metabos-crawl-routes.mjs |
| Inter-Warehouse Transfer | /workspace/stock/transfers | available | member | scripts/metabos-crawl-routes.mjs |
| Shrinkage & Damage Ledger | /workspace/stock/adjustments | available | member | scripts/metabos-crawl-routes.mjs |
| Dropship Vendor Bridge | /workspace/stock/dropshipping | needs-credentials | member | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |
| Consignment Manager | /workspace/stock/consignment | available | member | scripts/metabos-crawl-routes.mjs |
| POD Asset Matcher | /workspace/stock/delivery-evidence | available | member | scripts/metabos-crawl-routes.mjs |
| RMA Stock Isolator | /workspace/stock/quarantine | available | member | scripts/metabos-crawl-routes.mjs |
| Digital Asset Delivery | /workspace/stock/digital-delivery | needs-credentials | member | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |

## 06 Growth (/workspace/growth)

| Page | Route | Status | Permission | Evidence / dependencies |
|---|---|---|---|---|
| Social Media Studio | /workspace/growth/studio | existing | member |  |
| Campaign Manager | /workspace/growth/campaigns | existing | member |  |
| Online Store Builder | /workspace/growth/store | available | member | tests/metabos-analytics.test.ts; scripts/metabos-crawl-routes.mjs |
| Website Builder | /workspace/growth/website | available | member | tests/metabos-analytics.test.ts; scripts/metabos-crawl-routes.mjs |
| Analytics & Funnel | /workspace/growth/analytics | available | member | tests/metabos-analytics.test.ts; scripts/metabos-crawl-routes.mjs |
| SEO & Content | /workspace/growth/seo | available | member | tests/metabos-analytics.test.ts; scripts/metabos-crawl-routes.mjs |
| Referrals & Loyalty | /workspace/growth/loyalty | available | member | tests/metabos-analytics.test.ts; scripts/metabos-crawl-routes.mjs |
| Email Marketing | /workspace/growth/email | needs-credentials | member | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |
| Push Notifications | /workspace/growth/push | needs-credentials | member | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |
| SMS Campaigns | /workspace/growth/sms | needs-credentials | member | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |
| Content Calendar | /workspace/growth/calendar | available | member | tests/metabos-analytics.test.ts; scripts/metabos-crawl-routes.mjs |
| Coupon Engine | /workspace/growth/coupons | available | member | tests/metabos-analytics.test.ts; scripts/metabos-crawl-routes.mjs |
| UTM Tracker | /workspace/growth/utm | available | member | tests/metabos-analytics.test.ts; scripts/metabos-crawl-routes.mjs |
| Pixel Manager | /workspace/growth/pixels | needs-credentials | member | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |
| Audience Builder | /workspace/growth/audiences | available | member | tests/metabos-analytics.test.ts; scripts/metabos-crawl-routes.mjs |
| Landing Page Builder | /workspace/growth/landing-pages | available | member | tests/metabos-analytics.test.ts; scripts/metabos-crawl-routes.mjs |
| Influencer Tracker | /workspace/growth/influencers | available | member | tests/metabos-analytics.test.ts; scripts/metabos-crawl-routes.mjs |
| Trend Spotter | /workspace/growth/trends | available | member | tests/metabos-analytics.test.ts; scripts/metabos-crawl-routes.mjs |
| Growth Experiments | /workspace/growth/experiments | available | member | tests/metabos-analytics.test.ts; scripts/metabos-crawl-routes.mjs |
| A/B Variant Dispatcher | /workspace/growth/ab-tests | available | member | tests/metabos-analytics.test.ts; scripts/metabos-crawl-routes.mjs |

## 07 Operations (/workspace/operations)

| Page | Route | Status | Permission | Evidence / dependencies |
|---|---|---|---|---|
| Staff Management | /workspace/operations/staff | available | member | scripts/metabos-crawl-routes.mjs |
| Tasks & Goals | /workspace/operations/tasks | existing | member |  |
| Projects | /workspace/operations/projects | available | member | scripts/metabos-crawl-routes.mjs |
| Attendance & Leave | /workspace/operations/attendance | available | member | scripts/metabos-crawl-routes.mjs |
| Time Tracker | /workspace/operations/time | available | member | scripts/metabos-crawl-routes.mjs |
| Meeting Notes | /workspace/operations/meetings | available | member | scripts/metabos-crawl-routes.mjs |
| SOP Library | /workspace/operations/sops | available | member | scripts/metabos-crawl-routes.mjs |
| Vendors & Purchases | /workspace/operations/vendors | available | member | scripts/metabos-crawl-routes.mjs |
| Shipping & Delivery | /workspace/operations/shipping | needs-credentials | member | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |
| File Approvals | /workspace/operations/file-approvals | available | member | scripts/metabos-crawl-routes.mjs |
| Incident Log | /workspace/operations/incidents | available | member | scripts/metabos-crawl-routes.mjs |
| Onboarding Checklist | /workspace/operations/onboarding | available | member | scripts/metabos-crawl-routes.mjs |
| Asset Assignment | /workspace/operations/assets | available | member | scripts/metabos-crawl-routes.mjs |
| Access Log | /workspace/operations/access | available | member | scripts/metabos-crawl-routes.mjs |
| Automation Library | /workspace/operations/automations | available | member | scripts/metabos-crawl-routes.mjs |
| Performance Review | /workspace/operations/reviews | available | member | scripts/metabos-crawl-routes.mjs |
| Backup Drills | /workspace/operations/backup-drills | available | member | scripts/metabos-crawl-routes.mjs |
| Compliance Checklist | /workspace/operations/compliance | available | member | scripts/metabos-crawl-routes.mjs |
| Audit Trail | /workspace/operations/audit | available | member | scripts/metabos-crawl-routes.mjs |
| Payroll & Staff Payments | /workspace/operations/payroll | needs-credentials | member | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |

## 08 Builder (/workspace/builder)

| Page | Route | Status | Permission | Evidence / dependencies |
|---|---|---|---|---|
| Media & Assets Gallery | /workspace/builder/media | available | member | scripts/metabos-crawl-routes.mjs |
| Content Block Studio | /workspace/builder/blocks | available | member | scripts/metabos-crawl-routes.mjs |
| Theme Customizer | /workspace/builder/themes | existing | member |  |
| Form & Intake Constructor | /workspace/builder/forms | available | member | scripts/metabos-crawl-routes.mjs |
| Asset Transform Pipeline | /workspace/builder/transforms | available | member | scripts/metabos-crawl-routes.mjs |
| CDN Controller | /workspace/builder/cdn | needs-credentials | member | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |
| Deep Linking Registry | /workspace/builder/deep-links | available | member | scripts/metabos-crawl-routes.mjs |
| Localization Matrix | /workspace/builder/localization | available | member | scripts/metabos-crawl-routes.mjs |
| Accessibility Verifier | /workspace/builder/accessibility | available | member | scripts/metabos-crawl-routes.mjs |
| Component Dependency Tree | /workspace/builder/components | available | member | scripts/metabos-crawl-routes.mjs |
| Hydration Optimizer | /workspace/builder/performance | available | member | scripts/metabos-crawl-routes.mjs |
| UGC Moderation Desk | /workspace/builder/moderation | available | member | scripts/metabos-crawl-routes.mjs |
| SSR State Hydrator | /workspace/builder/rendering | available | member | scripts/metabos-crawl-routes.mjs |
| Font & Icon Optimizer | /workspace/builder/fonts-icons | available | member | scripts/metabos-crawl-routes.mjs |
| Design Token Exporter | /workspace/builder/token-export | available | member | scripts/metabos-crawl-routes.mjs |
| App Builder & PWA Wrapper | /workspace/builder/pwa | available | member | scripts/metabos-crawl-routes.mjs |
| Domain & DNS Manager | /workspace/builder/domains | needs-credentials | member | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |
| Static Build Pipeline | /workspace/builder/builds | available | member | scripts/metabos-crawl-routes.mjs |
| Design System Tokens | /workspace/builder/tokens | available | member | scripts/metabos-crawl-routes.mjs |
| UGC Store Gallery | /workspace/builder/ugc | available | member | scripts/metabos-crawl-routes.mjs |

## 09 Brain (/workspace/brain)

| Page | Route | Status | Permission | Evidence / dependencies |
|---|---|---|---|---|
| AI Assistant | /workspace/brain/assistant | existing | member |  |
| Voice HQ | /workspace/brain/voice | needs-credentials | member | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |
| Evidence & Audit | /workspace/brain/evidence | available | member | tests/metabos-brain-templates.test.ts; scripts/metabos-crawl-routes.mjs |
| Prompt Library | /workspace/brain/employees | available | member | tests/metabos-brain-templates.test.ts; scripts/metabos-crawl-routes.mjs |
| Model Router | /workspace/brain/models | needs-credentials | member | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |
| Founder Templates | /workspace/brain/templates | available | member | tests/metabos-brain-templates.test.ts; scripts/metabos-crawl-routes.mjs |
| AI Runtime | /workspace/brain/runtime | available | member | tests/metabos-brain-templates.test.ts; scripts/metabos-crawl-routes.mjs |
| Missions | /workspace/brain/missions | available | member | tests/metabos-brain-templates.test.ts; scripts/metabos-crawl-routes.mjs |
| Goals & Check-ins | /workspace/brain/goals | available | member | tests/metabos-brain-templates.test.ts; scripts/metabos-crawl-routes.mjs |
| Chief of Staff | /workspace/brain/chief-of-staff | available | member | tests/metabos-brain-templates.test.ts; scripts/metabos-crawl-routes.mjs |
| Department Walls | /workspace/brain/department-walls | available | member | tests/metabos-brain-templates.test.ts; scripts/metabos-crawl-routes.mjs |
| Layered Memory | /workspace/brain/memory | available | member | tests/metabos-brain-templates.test.ts; scripts/metabos-crawl-routes.mjs |
| Jev Approvals & Activity | /workspace/brain/activity | available | member | tests/metabos-brain-templates.test.ts; scripts/metabos-crawl-routes.mjs |
| Agents | /workspace/brain/agents | available | member | tests/metabos-brain-templates.test.ts; scripts/metabos-crawl-routes.mjs |
| Tool Registry | /workspace/brain/tools | existing | member |  |
| Memory Graph | /workspace/brain/memory-graph | available | member | tests/metabos-brain-templates.test.ts; scripts/metabos-crawl-routes.mjs |
| Run Summary & Evidence | /workspace/brain/decisions | available | member | tests/metabos-brain-templates.test.ts; scripts/metabos-crawl-routes.mjs |
| Validation Gate | /workspace/brain/validation | available | member | tests/metabos-brain-templates.test.ts; scripts/metabos-crawl-routes.mjs |
| Approval Desk | /workspace/brain/approvals | available | member | tests/metabos-brain-templates.test.ts; scripts/metabos-crawl-routes.mjs |
| Commit Executor | /workspace/brain/executor | available | member | tests/metabos-brain-templates.test.ts; scripts/metabos-crawl-routes.mjs |
| Observer Ledger | /workspace/brain/runs | available | member | tests/metabos-brain-templates.test.ts; scripts/metabos-crawl-routes.mjs |
| Evaluation Harness | /workspace/brain/evals | available | member | tests/metabos-brain-templates.test.ts; scripts/metabos-crawl-routes.mjs |
| System Cards Publisher | /workspace/brain/system-cards | available | member | tests/metabos-brain-templates.test.ts; scripts/metabos-crawl-routes.mjs |
| Translation Layer | /workspace/brain/translation | needs-credentials | member | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |
| Agent Permission Review | /workspace/brain/security | available | member | tests/metabos-brain-templates.test.ts; scripts/metabos-crawl-routes.mjs |
| Vision Service | /workspace/brain/vision | needs-credentials | member | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |
| Recommendations | /workspace/brain/recommendations | available | member | tests/metabos-brain-templates.test.ts; scripts/metabos-crawl-routes.mjs |
| Forecasting | /workspace/brain/forecasting | available | member | tests/metabos-brain-templates.test.ts; scripts/metabos-crawl-routes.mjs |
| Anomaly Detector | /workspace/brain/anomalies | available | member | tests/metabos-brain-templates.test.ts; scripts/metabos-crawl-routes.mjs |
| Founder Copilot | /workspace/brain/founder-copilot | available | member | tests/metabos-brain-templates.test.ts; scripts/metabos-crawl-routes.mjs |

## 10 Foundation (/workspace/foundation)

| Page | Route | Status | Permission | Evidence / dependencies |
|---|---|---|---|---|
| Dashboard & Overview | /workspace/foundation/overview | available | member | scripts/metabos-crawl-routes.mjs |
| Business Identity Profile | /workspace/foundation/identity | available | member | scripts/metabos-crawl-routes.mjs |
| Documents Vault | /workspace/foundation/documents | available | member | scripts/metabos-crawl-routes.mjs |
| Business Card Studio | /workspace/foundation/business-cards | available | member | scripts/metabos-crawl-routes.mjs |
| Terms & Privacy Versions | /workspace/foundation/policies | available | member | scripts/metabos-crawl-routes.mjs |
| Trademark & IP Tracker | /workspace/foundation/ip | available | member | scripts/metabos-crawl-routes.mjs |
| License & Permit Registry | /workspace/foundation/licenses | available | member | scripts/metabos-crawl-routes.mjs |
| KYC Inbound Hub | /workspace/foundation/kyc | needs-credentials | member | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |
| DPIA Review | /workspace/foundation/privacy-assessments | available | member | scripts/metabos-crawl-routes.mjs |
| AML Transaction Monitor | /workspace/foundation/aml | available | member | scripts/metabos-crawl-routes.mjs |
| Corporate Resolution Log | /workspace/foundation/resolutions | available | member | scripts/metabos-crawl-routes.mjs |
| Customs & Tariff HSN Engine | /workspace/foundation/tariffs | available | member | scripts/metabos-crawl-routes.mjs |
| Grievance & Whistleblower Portal | /workspace/foundation/grievances | available | member | scripts/metabos-crawl-routes.mjs |
| Regulatory Reporting Dispatcher | /workspace/foundation/reporting | needs-credentials | member | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |
| Data Residency Controls | /workspace/foundation/residency | available | member | scripts/metabos-crawl-routes.mjs |
| Data Deletion Requests | /workspace/foundation/privacy-controls | available | member | scripts/metabos-crawl-routes.mjs |
| Encryption Configuration | /workspace/foundation/encryption | available | member | scripts/metabos-crawl-routes.mjs |
| Backup & Snapshot Ledger | /workspace/foundation/backups | available | member | scripts/metabos-crawl-routes.mjs |
| Device Passkey Registrar | /workspace/foundation/passkeys | needs-credentials | member | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |
| Settings & Sovereignty | /workspace/foundation/sovereignty | existing | member |  |

## 11 System (/workspace/system)

| Page | Route | Status | Permission | Evidence / dependencies |
|---|---|---|---|---|
| Integrations & Adapters | /workspace/system/sources | existing | member |  |
| Workflows Broker | /workspace/system/broker | available | member | scripts/metabos-crawl-routes.mjs |
| Database Migration Ledger | /workspace/system/migrations | available | member | scripts/metabos-crawl-routes.mjs |
| API Gateway & Rate Limiter | /workspace/system/gateway | available | member | scripts/metabos-crawl-routes.mjs |
| Task Queue Orchestrator | /workspace/system/queues | available | member | scripts/metabos-crawl-routes.mjs |
| Webhook Listener Pool | /workspace/system/webhooks | available | member | scripts/metabos-crawl-routes.mjs |
| Telemetry & Logs | /workspace/system/logs | available | member | scripts/metabos-crawl-routes.mjs |
| Health Heartbeat | /workspace/system/health | available | member | scripts/metabos-crawl-routes.mjs |
| Container Console | /workspace/system/self-host | available | member | scripts/metabos-crawl-routes.mjs |
| Edge Cache Matrix | /workspace/system/cache | needs-credentials | member | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |
| Object Storage Router | /workspace/system/storage | needs-credentials | member | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |
| Connection Pool Optimizer | /workspace/system/database | available | member | scripts/metabos-crawl-routes.mjs |
| Service Mesh Directory | /workspace/system/services | needs-credentials | member | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |
| Hardware Key Validator | /workspace/system/hardware-keys | needs-credentials | member | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |
| Zero-Trust Network Access | /workspace/system/access-policies | available | member | scripts/metabos-crawl-routes.mjs |
| Dead-Letter Remediation | /workspace/system/dead-letter | available | member | scripts/metabos-crawl-routes.mjs |
| Crash Dump Parser | /workspace/system/crashes | available | member | scripts/metabos-crawl-routes.mjs |
| Failover Cluster Director | /workspace/system/failover | needs-credentials | member | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |
| Domain, DNS & Certificates | /workspace/system/domains | needs-credentials | member | External provider account and credentials; Provider dispatch adapter (not built; items stay queued) |
| Static Asset Pipeline | /workspace/system/assets | available | member | scripts/metabos-crawl-routes.mjs |

## 12 Workflows (/workflows)

| Page | Route | Status | Permission | Evidence / dependencies |
|---|---|---|---|---|
| Workflow Canvas | /workflows | existing | member |  |

## 13 Evidence (/workspace/evidence)

| Page | Route | Status | Permission | Evidence / dependencies |
|---|---|---|---|---|
| Commerce Evidence Ledger | /workspace/evidence/commerce-ledger | available | member | scripts/metabos-crawl-routes.mjs |
| Workflow Run Evidence | /workspace/evidence/workflow-runs | available | member | scripts/metabos-crawl-routes.mjs |

## 14 Settings & Control (/workspace/settings)

| Page | Route | Status | Permission | Evidence / dependencies |
|---|---|---|---|---|
| Application settings | /workspace/settings/application-settings | existing | member |  |
| Merchant profile | /workspace/settings/merchant-profile | existing | member |  |
| Connections | /workspace/settings/connections | existing | member |  |

## 15 Upgrade (/workspace/upgrade)

| Page | Route | Status | Permission | Evidence / dependencies |
|---|---|---|---|---|
| Inspect usage | /workspace/upgrade/inspect-usage | existing | member |  |

## 16 Help & Support (/workspace/support)

| Page | Route | Status | Permission | Evidence / dependencies |
|---|---|---|---|---|
| Customer inbox | /workspace/support/customer-inbox | existing | member |  |
| Setup checklist | /workspace/support/setup-checklist | existing | member |  |
| Project roadmap | /workspace/support/project-roadmap | existing | member |  |

## 17 API & Webhooks (/workspace/developer)

| Page | Route | Status | Permission | Evidence / dependencies |
|---|---|---|---|---|
| Integration directory | /workspace/developer/integration-directory | existing | member |  |
| System blueprint | /workspace/developer/system-blueprint | existing | member |  |
| Meta webhook status | /workspace/developer/meta-webhooks | available | member | scripts/metabos-crawl-routes.mjs |
| API routes | /workspace/developer/api-reference | available | member | scripts/metabos-crawl-routes.mjs |

## 18 Account (/workspace/account)

| Page | Route | Status | Permission | Evidence / dependencies |
|---|---|---|---|---|
| Operator security | /workspace/account/operator-security | existing | member |  |
| Sign in / manage session | /workspace/account/sign-in-manage-session | existing | member |  |
| Sign in | /workspace/account/sign-in | available | member | scripts/metabos-crawl-routes.mjs |
| People and Roles | /workspace/account/people | available | member | scripts/metabos-crawl-routes.mjs |
