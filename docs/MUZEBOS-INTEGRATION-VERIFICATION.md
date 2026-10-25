# Upstream integration qualification

Date: 2026-10-25

## Scope

All 29 requested repositories were cloned successfully as shallow sparse
checkouts outside MuzeBOS. Revision IDs, root-license hashes and dispositions
are recorded in the source catalog. No upstream package installation, privileged
service startup, scraper outreach, model call or automatic schedule was run.

Working additions:

- Searchable 29-source provenance catalog, including imported, companion,
  reference, review and excluded dispositions.
- Eight employee role definitions and 60 routine reference texts, plus eleven
  founder skill documents and five onboarding templates. Text is loaded on demand
  from an exact-ID allowlist and displayed inertly, never installed as a skill.
- Manual human-review queue creates a durable Mission Control reminder.
- Limited static permission review uses the unmodified AgentShield MIT
  normalizer. This does not integrate the full upstream scanner or enforce policy.
- SQLite resource bookings normalize times to UTC, use half-open intervals,
  reject overlap inside an immediate transaction, and audit cancellation.
- Exactly 18 sidebar destinations remain; new pages nest under existing hubs.

## Executed checks

| Check | Result |
| --- | --- |
| Full local suite at integration checkpoint | 360 files passed; 4,812 tests passed; 8 skipped |
| Final targeted suite after document-loader optimization and API tests | 6 files passed; 227 tests passed |
| Standalone TypeScript | Passed |
| Optimized production build | Passed |
| Production file trace | All 76 reference documents included |
| Existing commerce browser flow | Passed |
| Mission Control desktop/mobile browser flow | Passed |
| New integration desktop/mobile browser flow | Passed |

The final targeted suite covers all new domain/API behavior, source metadata,
reference document hashes, smoke page/API registries and existing commerce and
Mission Control behavior. It includes a two-process SQLite booking race: one
reservation commits and the other is rejected.

An initial production build was killed while the full suite was running. The
large prompt JSON was replaced with a small client index and on-demand inert
text files. The subsequent production build passed; no failed build is counted
as a qualification pass.

Browser checks created real disposable records and exercised:

- All 29 source records and disposition filters.
- Eight role definitions and loaded founder template text.
- A persisted human-review reminder visible through Mission Control's API.
- Rejection of an unknown/path-traversal document identifier.
- Permission normalization and findings in the browser.
- Booking creation, overlap error, reload persistence and audited cancellation.
- The four new pages at a 390px viewport without horizontal overflow.
- All 18 sidebar links and no browser runtime errors.

Reproduce after building with `npm run test:qualify-browser`. Supply
`TEST_CHROMIUM_PATH` if using an externally installed Chromium executable.
The runner uses fresh disposable databases and disables background warm/cron
work. Local browser credentials and provider secrets are not needed.

## Boundaries

MuzeBOS remains single-operator and SQLite-backed. No new external ERP, BI,
network server, accounting service, model provider, messaging channel or payment
rail has been deployed or connected. No independent security review, compliance
certification, PostgreSQL migration or tenant-isolation qualification is claimed.
See THIRD_PARTY_NOTICES.md for the four scoped MIT imports and the source catalog
for the projects that remain external or excluded.
