# Real product demo

Use a fresh, disposable local database. Do not seed production with sample data.
The following values are deliberate test inputs, not claims about a real shop.

1. Open MeTaBos. Show its blank counters and local-store label.
2. In Invoices → Merchant invoice profile, enter a fictional test business.
3. Add a customer named Demo Customer and a product named Coffee with SKU
   DEMO-COFFEE, price INR 199.99, tax 18%, and five units in stock.
4. Create an order draft for two units. Explain subtotal INR 399.98, tax
   INR 72.00, and total INR 471.98.
5. Show the SHA-256 binding and approval expiry. Approve & issue.
6. Show the invoice's pending payment status and three remaining units.
7. Reload to demonstrate persistence.
8. Show Evidence: approval request, invoice issuance, and verified hash chain.
9. Select a customer or product node in the knowledge graph.
10. Explain remaining integration gates: external Meta messaging, AI vision,
    provider-verified settlement, passkeys and team accounts.

Never represent manual reconciliation as live provider settlement. Do not show
fictional metrics as pilot outcomes or present this as an independent security
certification.
