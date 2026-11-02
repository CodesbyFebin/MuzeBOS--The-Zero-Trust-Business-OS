# Founder navigation and Mission Control

The sidebar contains exactly 18 destinations: 13 main entries and five pinned
utilities. Detailed capabilities live inside category hubs and the command
palette instead of creating hundreds of sidebar links.

## Daily-first order

1. Mission Control
2. Orders & CRM — ORD, pillars 1–20
3. Money & Billing — FIN, pillars 21–40
4. Talk & Channels — COM, pillars 41–60
5. Stock & Products — INV, pillars 61–80
6. Growth & Store — GRW, pillars 81–100
7. Run & Team — OPS, pillars 101–120
8. Builder & PWA — BLD, pillars 121–140
9. Brain & Agents — AI, pillars 141–160
10. Foundation & Legal — FND, pillars 161–180
11. Network & Infra — SYS, pillars 181–200
12. Workflows
13. Evidence & Audit

The five pinned utilities are Settings & Control (201), Upgrade & Billing (202),
Help & Support (203), API & Webhooks (204), and Account (205).

The ten categories retain all 200 numbered feature entries. A tool can be
Available (with its actual limited local scope), Existing (an inherited screen
whose own integration state applies), or Planned. Planned entries have no
pretend execution button. Directory coverage does not mean all 205 capabilities
have been implemented.

Number-key shortcuts 1–9 follow the new main sidebar order.
Legacy routes remain accessible and searchable. The MeTaBos sidebar groups them
under the new workspaces. Other upstream branding profiles retain their original
navigation; their route and module compatibility remains intact.

## Mission Control

GET /api/mission-control aggregates actual commerce data, reminders, inherited
tasks and observed connector status. The UI polls every 20 seconds while visible
and refreshes when the window regains focus. It displays the server response
timestamp. A failed request preserves the previous snapshot and shows an error.
Connector checks use the inherited cached status board; missing/timeout states
are reported as unavailable. Filming-mode sample tasks and connector statuses
are explicitly excluded from the real business summary.

The dashboard shows actionable approval counts, expired drafts, pending invoice
requests, out-of-stock products, open/overdue/blocked work, a real relationship
graph, recent audit events, and connection configuration. No simulated revenue,
CPU usage, live model runs, settlement or push notification is generated.

Personal reminders use mb_reminders in the real commerce database. Creation and
completion go through the authenticated same-origin commerce command endpoint,
with idempotency and audit events. Due times are entered in the browser's local
timezone and stored in UTC. Reminder completion survives process/browser restarts.
The UI does not claim background alarms, push notifications, email dispatch or
an operating-system scheduler.

The supplied standalone HTML was treated as a layout reference. Its browser-only
storage and manual-reference-to-settlement logic were not copied into the server
application. Payment state still distinguishes pending from manually reconciled;
there is no provider-verified settlement adapter.
