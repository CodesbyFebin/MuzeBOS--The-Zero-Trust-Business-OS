# How MeTaBos verifies invoice approval

MeTaBos binds merchant approval to the exact canonical invoice payload. Issuance
rechecks the approved payload and available stock, then writes the issued
invoice, inventory movements and audit evidence in one database transaction.
An altered or replayed approval cannot authorize a different invoice.

## The operator workflow

1. Add the merchant profile, customer and catalog products.
2. Create an order draft and review quantities, prices, tax and payload hash.
3. Explicitly approve the reviewed payload within its expiry window.
4. Issue the invoice; the transaction rechecks stock and commits durable records.
5. Inspect the invoice snapshot, stock movement and evidence entry.

Integer minor units avoid floating-point money calculations. Tax uses explicit
per-line rounding. Business details and rates remain merchant supplied; exact
hash binding does not validate a legal tax interpretation or customer identity.

## What happens if another order consumes the stock?

The issuance transaction checks stock again. A stale draft cannot bypass that
check merely because it was approved earlier. Idempotency keys identify retries;
the same key cannot authorize a changed request. Rejected operations do not
partially issue an invoice.

## Does AI approval issue an invoice?

No. Model outputs are proposals. The persistent inference workspace has its own
exact-task Jev gate and bounded workers. Business writes retain their separate
validation, permission and transaction boundaries. A model response cannot grant
itself authority.

See [commerce architecture](../METABOS-ARCHITECTURE.md),
[issuance tests](../../tests/metabos-issuance.test.ts) and
[UPI versus settlement](upi-and-tax.md). Return to the [documentation hub](README.md).
