# UPI requests, settlement evidence and tax in MeTaBos

A UPI payment URI requests payment. It does not prove settlement. MeTaBos keeps
pending invoices distinct from operator-recorded reconciliation and any future
provider-verified evidence.

## How does payment reconciliation work?

The merchant independently checks the bank or PSP record before recording a
reference. The UI labels manual reconciliation separately from provider-verified
settlement. An email, QR code, generated link or matching amount alone does not
establish trusted settlement. No universal zero-fee or fraud-proof UPI claim is made.

## Is MeTaBos a GST filing service?

No. Local invoice calculations use merchant-supplied rates and details. They do
not establish GST registration, correct HSN classification, current tax-law
compliance, filing or government e-invoice registration. Tax-related modules
have bounded local scopes and must be reviewed before use.

## Are Stripe, Wise, PayPal and global rails live?

Provider-dependent pages can store configuration references, drafts and queued
outbox records. A populated page or a successful connection probe does not mean
payments or messages were dispatched. Escrow, mandates, payouts and jurisdiction
rules need separate provider/legal implementation and live qualification.

See [invoice approval](invoice-approvals.md), [verification and limits](verification.md)
and the [documentation hub](README.md).
