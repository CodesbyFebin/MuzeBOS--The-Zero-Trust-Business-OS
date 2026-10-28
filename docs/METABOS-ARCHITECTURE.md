# MeTaBos architecture and threat model

## Delivered boundary

Browser → BusinessConsole → `/api/business` → validated domain commands →
SQLite immediate transaction → response → refreshed business view.

The new commerce code is under `lib/metabos/` and `components/metabos/`.
The inherited FounderOS application remains alongside it. There is one operator
and one business store; there is no claimed tenant boundary. The commerce API
has its own session/origin gate in addition to inherited Next middleware.

## Persistence

`data/metabos-business.db` stores customers, products, drafts, invoice snapshots,
stock movements, merchant settings, command results, and audit events. Schema
initialization is idempotent and version recorded. WAL and a five-second busy
timeout support local connections. Immediate transactions serialize write
approval operations. A competing approval rechecks stock after acquiring the
write lock. Rollback covers every stock movement if any line fails.

Amounts use bounded integer minor units. Tax is integer half-up per line using
BigInt intermediate multiplication. Invoice currency is INR. Price is exclusive
of tax. Drafts snapshot customer, merchant, product, quantity, price and tax;
issuance verifies the SHA-256 hash and expiry. Drafts do not reserve stock.

Commands have UUID idempotency keys. Identical retries return the recorded result;
changed commands with the same key fail. A successful issue consumes approval.

## Threat controls and limitations

- Customer/product input is validated. SQL uses bound parameters. Printed
  customer data is inserted using textContent, not interpolated HTML.
- Commerce mutations require the expected Origin. They reject missing origins,
  cross-site fetches, oversized bodies, and unknown commands.
- Configured deployments require the inherited operator session. Fresh instances
  are intended for loopback only, enforced by the startup wrapper.
- Host headers alone cannot prove a caller is local. Never expose a passwordless
  instance through an internet proxy or run bare `next start` on a public bind.
- Upstream sessions share an operator secret. They are not individual identities
  or passkeys; session expiry and permission granularity need further work.
- Audit hashes detect ordinary edits but cannot stop a privileged database
  administrator rewriting the entire chain. There is no external anchor and no
  claim of administrator-proof immutability or deletion detection at the tail.
- Logs identify the single operator implicitly. They are not independently
  authenticated person-level signatures.
- The new commerce flow executes synchronously and performs no external side
  effects. It does not introduce a shell or general-purpose execution tool.
- Inherited tools/connectors retain their original behavior and require separate
  security qualification before enabling them against sensitive accounts.
- Snapshots load the complete commerce store. Pagination and bounded audit
  queries are required before large installations.
- No field-level database encryption, KMS, provider retention contract, or
  automatic regulatory compliance is claimed.

## Future integration contract

AI may propose a draft, never directly set tax, stock, paid state or permissions.
Future external messages, provider payment requests, background jobs, and tools
must have explicit permission scopes, payload-bound approval, idempotency,
webhook authentication, durable recovery and actual provider evidence.

Use supported Meta models only after checking official model/API documentation
and account entitlements. An unconfigured connector must remain unconfigured.
