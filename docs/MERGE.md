# What was merged from v4, and how

The v4 codebase (MIT, Codes By Febin — the author's own earlier work) was used as a reference. Nothing was copied as-is: each feature was re-implemented against this repo's `BusinessStore` schema in `lib/metabos/records.ts`, exposed through one authenticated route, and tested in `tests/release-v4-port.test.ts`.

| v4 feature | Here | Guarantee tested |
|---|---|---|
| UPI QR (`src/lib/qr.ts`, `/api/invoices/[id]/qr`) | `invoiceQrSvg`, `POST /api/metabos/records {action:"qr"}` | Amount and payee come from the stored invoice; 409 without a merchant UPI ID; 409 once reconciled. A QR is a payment request only; the invoice stays pending until a bank reference is entered. |
| Inventory ledger | `stockLedger`, `{action:"stock-ledger"}` | Opening stock (from `product.created` evidence) + order movements + total-affecting stock moves = current stock; a direct DB edit is reported unbalanced. |
| Tax report + CSV | `taxCsv`, `{action:"tax-csv"}` | Every cell quoted; cells starting `= + - @` tab or CR are prefixed with `'`. |
| Evidence export | `evidenceExport`, `{action:"evidence"}` | `auth.* member.* account.* customer.*` rows redacted, emails masked; `chainIntactAtExport` is the server-side verification and flips to false after tampering. |
| Backups | `backupAndVerify`, `{action:"backup"}` | SQLite online backup to `MUZEBOS_BACKUP_DIR` (default `data/backups`, mode 0700), reopened and checked (audit chain, invoice count); writes `backup.verified` evidence. |

Permissions: all actions require a signed-in member; backup needs `members.manage` (owner); the others need `finance.read`. The route is POST-only so no export is reachable by an unauthenticated GET.

Caveats: redacted rows cannot be re-hashed from the export file alone. Backups are not encrypted and are not copied off the box; restore is manual (stop the server, replace `MUZEBOS_DB`). Not ported: v4 analytics (this repo already has `lib/metabos/analytics.ts`) and its other endpoints, which would each need tests first.

New dependency: `qrcode@^1.5.4` (+ `@types/qrcode` dev). `npm audit --omit=dev` after install: 0 vulnerabilities.
