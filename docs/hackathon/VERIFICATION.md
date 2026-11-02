# Submission PR qualification — October 27, 2026

Pre-event comparison point: `1105e64ca6c6791170e619d9f446c81b9e6aec22`.
This file records local observations; CI must qualify the published PR head too.

| Check | Observation |
| --- | --- |
| Node environment | Node 22.23.4; locked `npm ci` completed |
| Focused inference/worker tests | 27 passed on initial implementation; includes a real separate-process HTTP fixture, not a real model |
| New handoff/API/demo tests | 39 passed across five focused files, including authenticated origin/idempotency checks, two gate approvals, exact provider/model binding, unsafe JSON and tamper rejection, and unattended-live refusal |
| TypeScript | `npm run typecheck` passed after final source changes |
| Standalone demo | `npm run hackathon:demo -- --fixture both` completed: two synthetic requests, four scripted gate reviews, two local reminders and a valid local audit chain |
| Full regression suite | Final full run: **5,030 passed, 8 skipped**, 383 files passed; no failures |
| Production build | Passed; existing @miosa/sdk dynamic-dependency warning remains |
| Browser interface | All four production browser flow suites passed: business/invoice flow, Mission Control, integrations and inference; desktop/mobile, including fixture server handoff and separate action-approval link |
| Live Meta API | Not run; credentials/access and budget approval not established |
| Live Baseten API | Not run; guide's exact model ID/account access not live-qualified |
| Credits, video, X post and platform submission | Founder actions; not performed |

Reproduce with Node 22:

```sh
npm ci
npm run typecheck
npm test -- --maxWorkers=4 --minWorkers=1
npm run build
npm run hackathon:demo -- --fixture both
npm run test:qualify-browser
```

Browser checks need a supported Playwright Chromium installation (or explicit
`TEST_CHROMIUM_PATH`). They check interface/state, not a physical GPU or model.
The fixture report's token usage is unknown, not zero; local fixture timings are
not model latency. No inference fixture is offered as evidence for a provider
prize. The final recorder must obtain real API evidence or label the demo fixtures.


PR #22 originally called models on key presence and described an unconfirmed
Indie track. This revision removes that behavior, retains the original PR commit
in history and integrates against the tested pre-event main tree. GitHub CI on
the published head is an additional merge gate; local checks do not substitute
for that result. No live provider test was run: configuration inspection found
neither provider key and paid opt-in disabled (no secret values were printed).


## Follow-up audit — October 28, 2026 (IST)

The audit found a gap in the original browser coverage: it asserted the approval
link URL without navigating to the actual Jev queue. Audited main's governed
workflow view filters out agent proposals. The follow-up patch changes the link
to the existing Jev tab and adds an actual browser/API/SQLite approval/reminder
flow using a provider protocol fixture. All four browser suites, types/build,
41 focused checks and the full 5,030-test suite passed locally (8 skipped).
See [SUBMISSION-AUDIT.md](SUBMISSION-AUDIT.md) for exact scope and remaining gates.

A separate fresh production dependency scan found 12 flagged packages, including
1 critical and 7 high. These were not part of the previous test-only qualification;
application exploitability was not demonstrated. No dependencies were changed.
