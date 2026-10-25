# Commerce API

`GET /api/business` returns real customers, products, orders, invoices, merchant
settings, audit evidence and local chain verification. Response is not cached.

All `POST /api/business` commands require:

- Valid operator session when the password is configured.
- Same-origin browser request (`MUZEBOS_ORIGIN` when deployed behind a proxy).
- `Content-Type: application/json`.
- `Idempotency-Key: <UUID>`; reuse for a transport retry of the exact command.
- A body no larger than 64,000 bytes.

Examples (all are real local writes):

```json
{"action":"customer","data":{"name":"Example customer","email":""}}
```

```json
{"action":"product","data":{"name":"Coffee","sku":"COF-01","price":19999,"taxBps":1800,"stock":5}}
```

`price` is minor units: 19999 means INR 199.99. `taxBps: 1800` means 18%.

```json
{"action":"draft","data":{"customerId":"<UUID>","lines":[{"productId":"<UUID>","quantity":2}]}}
```

The draft response contains `id`, `hash`, `payload`, and `expiresAt`. Inspect the
complete payload. Approving requires that exact hash:

```json
{"action":"issue","id":"<draft UUID>","hash":"<SHA-256 from reviewed draft>"}
```

Other actions:

```json
{"action":"reject","id":"<draft UUID>"}
```

```json
{"action":"reconcile","id":"<invoice UUID>","reference":"<operator-verified bank reference>"}
```

```json
{"action":"configure","data":{"name":"Your business","address":"Your address","taxId":"","upi":"merchant@bank"}}
```

Reconciliation is explicitly manual. It cannot become provider-verified through
this endpoint. No action sends a WhatsApp message or charges a bank account.

Errors use `{ "error": "..." }` and appropriate 400, 401, 403, 404, 409, 413 or
500 status. Retried successful command keys do not create duplicate records.
