# Provider env vars

Every credential page stores only the *names* of env vars. Values are read from process.env when a test runs, and they are never stored or returned. If a variable is missing, the connection test reports "Not connected — add VAR".

| Page | Tester (official endpoint) | Env vars |
|---|---|---|
| orders.cart-abandonment | GET {BASE_URL} (Bearer); no vendor fixed | `MUZEBOS_STOREFRONT_EVENTS_BASE_URL`, `MUZEBOS_STOREFRONT_EVENTS_API_KEY` |
| orders.lead-enrichment | GET {BASE_URL} (Bearer); no vendor fixed | `MUZEBOS_ENRICHMENT_API_BASE_URL`, `MUZEBOS_ENRICHMENT_API_API_KEY` |
| orders.omnichannel-router | GET graph.facebook.com/v25.0/me | `MUZEBOS_META_ACCESS_TOKEN` |
| money.payment-link-generator | GET api.razorpay.com/v1/payments?count=1 (Basic) | `MUZEBOS_RAZORPAY_KEY_ID`, `MUZEBOS_RAZORPAY_KEY_SECRET` |
| money.splitter-and-escrow | GET api.razorpay.com/v1/payments?count=1 (Basic) | `MUZEBOS_RAZORPAY_ROUTE_KEY_ID`, `MUZEBOS_RAZORPAY_ROUTE_KEY_SECRET` |
| money.dunning-and-retry | TCP banner 220 (reachability only) | `MUZEBOS_SMTP_HOST`, `MUZEBOS_SMTP_PORT`, `MUZEBOS_SMTP_USER`, `MUZEBOS_SMTP_PASSWORD` |
| money.pos-hardware-bridge | GET {BASE_URL} (Bearer); no vendor fixed | `MUZEBOS_POS_BRIDGE_BASE_URL`, `MUZEBOS_POS_BRIDGE_API_KEY` |
| money.ach-and-wire-adapters | GET {BASE_URL} (Bearer); no vendor fixed | `MUZEBOS_BANK_API_BASE_URL`, `MUZEBOS_BANK_API_API_KEY` |
| money.upi-autopay-mandate | GET api.razorpay.com/v1/payments?count=1 (Basic) | `MUZEBOS_RAZORPAY_KEY_ID`, `MUZEBOS_RAZORPAY_KEY_SECRET` |
| money.payouts | GET api.razorpay.com/v1/payments?count=1 (Basic) | `MUZEBOS_RAZORPAYX_KEY_ID`, `MUZEBOS_RAZORPAYX_KEY_SECRET` |
| money.invoice-send | TCP banner 220 (reachability only) | `MUZEBOS_SMTP_HOST`, `MUZEBOS_SMTP_PORT`, `MUZEBOS_SMTP_USER`, `MUZEBOS_SMTP_PASSWORD` |
| talk.whatsapp-hub | GET graph.facebook.com/v25.0/me | `MUZEBOS_WHATSAPP_CLOUD_ACCESS_TOKEN` |
| talk.instagram-and-messenger-hub | GET graph.facebook.com/v25.0/me | `MUZEBOS_META_ACCESS_TOKEN` |
| talk.facebook-shop-sync | GET graph.facebook.com/v25.0/me | `MUZEBOS_META_COMMERCE_ACCESS_TOKEN` |
| talk.broadcast-lists | GET graph.facebook.com/v25.0/me | `MUZEBOS_WHATSAPP_CLOUD_ACCESS_TOKEN` |
| talk.voice-note-transcribe | GET openrouter.ai/api/v1/key | `OPENROUTER_API_KEY` |
| talk.call-log-to-crm | GET {BASE_URL} (Bearer); no vendor fixed | `MUZEBOS_TELEPHONY_BASE_URL`, `MUZEBOS_TELEPHONY_API_KEY` |
| talk.web-chat-widget | GET {BASE_URL} (Bearer); no vendor fixed | `MUZEBOS_CHAT_WIDGET_HOST_BASE_URL`, `MUZEBOS_CHAT_WIDGET_HOST_API_KEY` |
| talk.contact-sync | GET {BASE_URL} (Bearer); no vendor fixed | `MUZEBOS_CONTACTS_API_BASE_URL`, `MUZEBOS_CONTACTS_API_API_KEY` |
| stock.shelf-scanner | GET {BASE_URL} (Bearer); no vendor fixed | `MUZEBOS_SCANNER_DEVICE_BASE_URL`, `MUZEBOS_SCANNER_DEVICE_API_KEY` |
| stock.dropship-vendor-bridge | GET {BASE_URL} (Bearer); no vendor fixed | `MUZEBOS_DROPSHIP_VENDOR_BASE_URL`, `MUZEBOS_DROPSHIP_VENDOR_API_KEY` |
| stock.digital-asset-delivery | TCP banner 220 (reachability only) | `MUZEBOS_SMTP_HOST`, `MUZEBOS_SMTP_PORT`, `MUZEBOS_SMTP_USER`, `MUZEBOS_SMTP_PASSWORD` |
| growth.email-marketing | TCP banner 220 (reachability only) | `MUZEBOS_SMTP_HOST`, `MUZEBOS_SMTP_PORT`, `MUZEBOS_SMTP_USER`, `MUZEBOS_SMTP_PASSWORD` |
| growth.push-notifications | GET {BASE_URL} (Bearer); no vendor fixed | `MUZEBOS_PUSH_SERVICE_BASE_URL`, `MUZEBOS_PUSH_SERVICE_API_KEY` |
| growth.sms-campaigns | GET {BASE_URL} (Bearer); no vendor fixed | `MUZEBOS_SMS_GATEWAY_BASE_URL`, `MUZEBOS_SMS_GATEWAY_API_KEY` |
| growth.pixel-manager | GET graph.facebook.com/v25.0/me | `MUZEBOS_META_PIXEL_ACCESS_TOKEN` |
| operations.shipping-and-delivery | GET {BASE_URL} (Bearer); no vendor fixed | `MUZEBOS_SHIPPING_AGGREGATOR_BASE_URL`, `MUZEBOS_SHIPPING_AGGREGATOR_API_KEY` |
| operations.payroll-and-staff-payments | GET api.razorpay.com/v1/payments?count=1 (Basic) | `MUZEBOS_RAZORPAYX_KEY_ID`, `MUZEBOS_RAZORPAYX_KEY_SECRET` |
| builder.cdn-controller | GET api.cloudflare.com/client/v4/user/tokens/verify | `MUZEBOS_CLOUDFLARE_API_TOKEN` |
| builder.domain-and-dns-manager | GET api.cloudflare.com/client/v4/user/tokens/verify | `MUZEBOS_CLOUDFLARE_API_TOKEN` |
| brain.voice-hq | GET openrouter.ai/api/v1/key | `OPENROUTER_API_KEY` |
| brain.model-router | GET openrouter.ai/api/v1/key | `OPENROUTER_API_KEY` |
| brain.translation-layer | GET openrouter.ai/api/v1/key | `OPENROUTER_API_KEY` |
| brain.vision-service | GET openrouter.ai/api/v1/key | `OPENROUTER_API_KEY` |
| foundation.kyc-inbound-hub | GET {BASE_URL} (Bearer); no vendor fixed | `MUZEBOS_KYC_PROVIDER_BASE_URL`, `MUZEBOS_KYC_PROVIDER_API_KEY` |
| foundation.regulatory-reporting-dispatcher | GET {BASE_URL} (Bearer); no vendor fixed | `MUZEBOS_GSTN_GSP_BASE_URL`, `MUZEBOS_GSTN_GSP_API_KEY` |
| foundation.device-passkey-registrar | No live test (config only) | `MUZEBOS_WEBAUTHN_CONFIG` |
| system.edge-cache-matrix | GET api.cloudflare.com/client/v4/user/tokens/verify | `MUZEBOS_CLOUDFLARE_API_TOKEN` |
| system.object-storage-router | GET {BASE_URL} (Bearer); no vendor fixed | `MUZEBOS_S3_COMPATIBLE_STORAGE_BASE_URL`, `MUZEBOS_S3_COMPATIBLE_STORAGE_API_KEY` |
| system.service-mesh-directory | No live test (config only) | `MUZEBOS_SERVICE_MESH_CONFIG` |
| system.hardware-key-validator | No live test (config only) | `MUZEBOS_WEBAUTHN_CONFIG` |
| system.failover-cluster-director | GET {BASE_URL} (Bearer); no vendor fixed | `MUZEBOS_STANDBY_NODE_BASE_URL`, `MUZEBOS_STANDBY_NODE_API_KEY` |
| system.domain-dns-and-certificates | GET api.cloudflare.com/client/v4/user/tokens/verify | `MUZEBOS_CLOUDFLARE_API_TOKEN` |

## Unique env vars (50)

- `MUZEBOS_BANK_API_API_KEY`
- `MUZEBOS_BANK_API_BASE_URL`
- `MUZEBOS_CHAT_WIDGET_HOST_API_KEY`
- `MUZEBOS_CHAT_WIDGET_HOST_BASE_URL`
- `MUZEBOS_CLOUDFLARE_API_TOKEN`
- `MUZEBOS_CONTACTS_API_API_KEY`
- `MUZEBOS_CONTACTS_API_BASE_URL`
- `MUZEBOS_DROPSHIP_VENDOR_API_KEY`
- `MUZEBOS_DROPSHIP_VENDOR_BASE_URL`
- `MUZEBOS_ENRICHMENT_API_API_KEY`
- `MUZEBOS_ENRICHMENT_API_BASE_URL`
- `MUZEBOS_GSTN_GSP_API_KEY`
- `MUZEBOS_GSTN_GSP_BASE_URL`
- `MUZEBOS_KYC_PROVIDER_API_KEY`
- `MUZEBOS_KYC_PROVIDER_BASE_URL`
- `MUZEBOS_META_ACCESS_TOKEN`
- `MUZEBOS_META_COMMERCE_ACCESS_TOKEN`
- `MUZEBOS_META_PIXEL_ACCESS_TOKEN`
- `MUZEBOS_POS_BRIDGE_API_KEY`
- `MUZEBOS_POS_BRIDGE_BASE_URL`
- `MUZEBOS_PUSH_SERVICE_API_KEY`
- `MUZEBOS_PUSH_SERVICE_BASE_URL`
- `MUZEBOS_RAZORPAYX_KEY_ID`
- `MUZEBOS_RAZORPAYX_KEY_SECRET`
- `MUZEBOS_RAZORPAY_KEY_ID`
- `MUZEBOS_RAZORPAY_KEY_SECRET`
- `MUZEBOS_RAZORPAY_ROUTE_KEY_ID`
- `MUZEBOS_RAZORPAY_ROUTE_KEY_SECRET`
- `MUZEBOS_S3_COMPATIBLE_STORAGE_API_KEY`
- `MUZEBOS_S3_COMPATIBLE_STORAGE_BASE_URL`
- `MUZEBOS_SCANNER_DEVICE_API_KEY`
- `MUZEBOS_SCANNER_DEVICE_BASE_URL`
- `MUZEBOS_SERVICE_MESH_CONFIG`
- `MUZEBOS_SHIPPING_AGGREGATOR_API_KEY`
- `MUZEBOS_SHIPPING_AGGREGATOR_BASE_URL`
- `MUZEBOS_SMS_GATEWAY_API_KEY`
- `MUZEBOS_SMS_GATEWAY_BASE_URL`
- `MUZEBOS_SMTP_HOST`
- `MUZEBOS_SMTP_PASSWORD`
- `MUZEBOS_SMTP_PORT`
- `MUZEBOS_SMTP_USER`
- `MUZEBOS_STANDBY_NODE_API_KEY`
- `MUZEBOS_STANDBY_NODE_BASE_URL`
- `MUZEBOS_STOREFRONT_EVENTS_API_KEY`
- `MUZEBOS_STOREFRONT_EVENTS_BASE_URL`
- `MUZEBOS_TELEPHONY_API_KEY`
- `MUZEBOS_TELEPHONY_BASE_URL`
- `MUZEBOS_WEBAUTHN_CONFIG`
- `MUZEBOS_WHATSAPP_CLOUD_ACCESS_TOKEN`
- `MUZEBOS_INSTAGRAM_ACCESS_TOKEN`
- `MUZEBOS_APPROVAL_SIGNING_SECRET`
- `OPENROUTER_API_KEY`

## Existing screens: backing

| Page | Backing |
|---|---|
| orders.deals-and-pipeline | Backed by the local SQLite database only (no provider needed); Optional live CRM/attribution: TRAKYO_API_KEY (else local DB) |
| talk.business-inbox | Meta inbox: META_APP_SECRET, META_VERIFY_TOKEN and a connected Page/WhatsApp token |
| talk.email-inbox | Email connector credentials set on /integrations (IMAP/Gmail) |
| growth.social-media-studio | Meta publishing token (MUZEBOS_META_ACCESS_TOKEN); not a verified publishing adapter |
| growth.campaign-manager | Meta Marketing API token; external calls need separate verification |
| operations.tasks-and-goals | Backed by the local SQLite database only (no provider needed) |
| builder.theme-customizer | Backed by the local SQLite database only (no provider needed) |
| brain.ai-assistant | Model provider key (OPENROUTER_API_KEY or configured provider) |
| brain.tool-registry | Backed by the local SQLite database only (no provider needed); Each connector needs its own credentials |
| foundation.settings-and-sovereignty | Backed by the local SQLite database only (no provider needed) |
| system.integrations-and-adapters | Backed by the local SQLite database only (no provider needed); Each connector needs its own credentials |
| workflows.canvas | Backed by the local SQLite database only (no provider needed); Canvas does not execute runs; governed runs live at /workflows?view=governed |
| settings.application-settings | Backed by the local SQLite database only (no provider needed) |
| settings.merchant-profile | Backed by the local SQLite database only (no provider needed) |
| settings.connections | Backed by the local SQLite database only (no provider needed); Each connector needs its own credentials |
| upgrade.inspect-usage | Backed by the local SQLite database only (no provider needed); Shows "Usage unavailable" when no provider usage is recorded |
| support.customer-inbox | Meta inbox: META_APP_SECRET, META_VERIFY_TOKEN and a connected Page/WhatsApp token |
| support.setup-checklist | Backed by the local SQLite database only (no provider needed) |
| support.project-roadmap | Backed by the local SQLite database only (no provider needed) |
| developer.integration-directory | Backed by the local SQLite database only (no provider needed); Each connector needs its own credentials |
| developer.system-blueprint | Backed by the local SQLite database only (no provider needed) |
| account.operator-security | Backed by the local SQLite database only (no provider needed) |
| account.sign-in-manage-session | Backed by the local SQLite database only (no provider needed) |

## Dispatch adapters and passkeys (feat/real-adapters)

Every send needs a Jev approval whose payload hash matches and an `idempotency-key` UUID header. If keys are missing, the API answers 424 "Not connected — add …". The tests use a mocked HTTP layer and don't prove a live send.

| Channel | Env | Provider call |
| --- | --- | --- |
| WhatsApp text | `MUZEBOS_WHATSAPP_CLOUD_ACCESS_TOKEN`, `MUZEBOS_WHATSAPP_PHONE_NUMBER_ID` | `POST graph.facebook.com/v25.0/{phone-number-id}/messages` |
| Instagram DM | `MUZEBOS_INSTAGRAM_ACCESS_TOKEN` (Instagram User token) | `POST graph.instagram.com/v25.0/me/messages` (text ≤ 1000 bytes, 24h window) |
| WhatsApp approval prompts | `MUZEBOS_APPROVAL_SIGNING_SECRET` (32+ chars, HMAC key for single-use codes) | sent as a WhatsApp dispatch; no extra provider |
| Email (SMTP) | `MUZEBOS_SMTP_HOST`, `MUZEBOS_SMTP_PORT`, `MUZEBOS_SMTP_USER`, `MUZEBOS_SMTP_PASSWORD`, `MUZEBOS_SMTP_FROM` | nodemailer `sendMail` |
| Razorpay payment link | `MUZEBOS_RAZORPAY_KEY_ID`, `MUZEBOS_RAZORPAY_KEY_SECRET` | `POST api.razorpay.com/v1/payment_links` (paise, reference_id = idempotency key) |
| OpenRouter completion | `OPENROUTER_API_KEY` | `POST openrouter.ai/api/v1/chat/completions` |
| Passkeys (WebAuthn) | `MUZEBOS_WEBAUTHN_RP_ID`, `MUZEBOS_WEBAUTHN_ORIGIN`, optional `MUZEBOS_WEBAUTHN_RP_NAME` | local verification with @simplewebauthn/server; no network call |
