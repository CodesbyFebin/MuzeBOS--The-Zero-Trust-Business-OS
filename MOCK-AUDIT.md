
## Data, privacy and growth (PR C)
- Ask your data: fixed questions map to fixed parameterised SELECTs over real tables. Owner SELECTs must be one statement that SQLite reports as read-only, may only name allowed business tables (no members, sessions, audit or keys), and are capped at 200 rows. The SQL that ran is shown. There is no LLM involved, so nothing is invented.
- DPDP export/redact: export bundles the real rows. Redact pseudonymises customers, orders, invoices and conversations, blanks messages, keeps amounts and opt-outs, needs owner plus typed name, and refuses while orders await review. Every request is logged in mb_privacy_requests and the evidence chain.
- Sales goals: targets in integer paise, actuals summed from issued invoices (invoiced) and manually reconciled invoices (collected). With no goal set, the table shows "No goal set".
