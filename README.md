# MuzeBOS — The Zero-Trust Business OS

Run your business. Approve what matters. Verify what happened.

A self-hostable business workspace built from FounderOS. MuzeBOS adds a real,
local SQLite commerce desk to the inherited business and AI department screens,
with a dark operational interface inspired by the supplied reference.

**Version 0.1.1: single-operator local preview.** The name describes the design
goal; this release is not a claim of independently certified zero-trust security
or production readiness.

## Daily founder workspace

The sidebar has 18 destinations, with daily categories first and five utilities
pinned below. All 205 requested pillars are organized inside category hubs with
Available, Existing, or Planned labels. The home page is Mission Control: it
shows real approvals, pending invoice requests, stockouts, tasks, persistent
reminders, actual relationships, audit events and connector status. Updates poll
every 20 seconds while visible; errors retain the last timestamped snapshot.
See [navigation and status details](docs/MUZEBOS-NAVIGATION.md).

## What works locally

- Customers and a product catalog with unique SKUs and opening stock.
- Invoice drafts with integer money, deterministic per-line tax rounding,
  exact payload hashes, and 30-minute approval expiry.
- Explicit approve/reject actions. Issuance rechecks stock and atomically writes
  the invoice, stock movements, order state, and audit event.
- Retry idempotency and rejection of altered/replayed approvals.
- Immutable-by-application invoice snapshots, including merchant details.
- Printable invoices (browser Print → Save as PDF), configurable merchant
  profile, optional UPI deep links, and explicit manual payment reconciliation.
- A graph of actual customers, products and orders; counts come from the database.
- A local tamper-evident event chain, with verification in the evidence view.
- The original FounderOS screens, connectors, knowledge tools, agent roster,
  and operator-password setup are retained. Their own configuration and
  limitations still apply; they are not newly verified live integrations.

A generated UPI request is **not payment confirmation**. Manual reconciliation
is labeled separately from provider-verified settlement. Invoice tax rates and
business details are merchant supplied; this is not GST filing or a registered
e-invoice service.

## Start

Use **Node.js 22 LTS** (the tested runtime).

```bash
npm ci
npm run dev
```

Open http://localhost:4100. Real mode is the default. No fabricated business
records are inserted. The inherited demo mode is optional; the MuzeBOS commerce
store remains separate and always contains real operator-entered records.

The startup wrapper binds to loopback until an operator password is configured
under **Settings → Security**. Keep it private. Use a private-network deployment
with TLS and configure a password before permitting remote access.

```bash
npm run typecheck
npm test -- --maxWorkers=4 --minWorkers=1
npm run build
npm start
```

The inherited build produces many pages and can require several minutes.

Browser verification uses Playwright: install a Chromium browser with
`npx playwright install chromium`, start the app with disposable
`MUZEBOS_DB` and `GLADOS_DB` paths, then run `npm run test:browser`.
This test creates real local records; never point it at your business database.

## Try the real workflow

1. Open Invoices → Merchant invoice profile. Enter your business details and,
   optionally, a UPI ID. Save. Verify those details before using an invoice.
2. Add a customer in Customers.
3. Add a product in Inventory with its price, tax rate, and stock.
4. Create a draft in Orders. Check items, quantities, totals, and payload hash.
5. Approve & issue. Observe the invoice and stock change together.
6. Open Invoices; payment remains pending. Print the invoice or use an optional
   UPI request. Enter a bank reference only after independently checking payment.
7. Open Evidence to inspect the issuance and manual reconciliation events.

The form currently adds one SKU per draft. The API supports multi-line drafts.
Catalog updates, invoice credit/void workflows, and stock replenishment UI are
not part of this initial commerce release.

## Configuration

See `.env.example`. The inherited `GLADOS_*` variables remain compatible.

| Variable | Purpose |
| --- | --- |
| `MUZEBOS_DB` | Absolute commerce database path; default `data/muzebos-business.db` |
| `MUZEBOS_ORIGIN` | Exact browser origin for commerce mutations behind a proxy |
| `GLADOS_DEFAULT_MODE` | `real` by default; inherited demo content requires opt-in |
| `GLADOS_HOST` | Bind interface; startup wrapper refuses remote bind without password |
| `PORT` | Default `4100` |

The commerce API is `/api/business`. Mutations require same-origin requests and
an `Idempotency-Key` UUID. See [API](docs/MUZEBOS-API.md).

## Scope and remaining gates

This release retains single-operator authentication. Passkeys, individual
accounts, RBAC, tenant isolation, durable commerce workers, live Meta messaging,
vision-to-product recognition, verified payment webhooks, global tax compliance,
and an independent security assessment remain incomplete.

No unsupported Meta model identifiers or endpoints have been added. No external
provider is called by the new commerce flow. No pilot metrics, customers,
transaction volumes or accuracy results are claimed.

See [architecture and threat model](docs/MUZEBOS-ARCHITECTURE.md),
[verification](docs/MUZEBOS-VERIFICATION.md), and
[deployment and recovery](docs/MUZEBOS-OPERATIONS.md).

## Attribution

Derived from the supplied FounderOS (on GladOS) source. The original MIT license
and copyright remain in [LICENSE](LICENSE). Internal directory names, historical
design documents, environment keys, and compatibility code retain upstream
names intentionally. New MuzeBOS work: CodesbyFebin, 2026.

## Reviewed upstream integrations

The source catalog covers 29 pinned repositories, with licenses and integration
status kept separate from deployment claims. New local sections include resource
bookings, an attributed AI employee/founder prompt library, and a limited
browser-local permission review using AgentShield's MIT normalizer.

See [integration review](docs/MUZEBOS-UPSTREAM-INTEGRATIONS.md) and
[third-party notices](THIRD_PARTY_NOTICES.md). No external applications or
autonomous employee schedules are launched by these sections.
