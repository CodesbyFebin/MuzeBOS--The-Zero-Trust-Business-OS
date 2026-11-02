# Judging criteria mapping (MuZe / MeTaBos)

Honest map from typical hackathon criteria to evidence in this repo. "Not built" and "needs Meta approval" are stated where true. No users, revenue, scores or Meta relationship are claimed. Pre-existing work (before Oct 26 2026, 9:30 PM IST) is disclosed in [HACKATHON.md](../HACKATHON.md).

| Criterion | What to look at | Evidence | Honest limits |
|---|---|---|---|
| Innovation | Agent actions as git-style commits: pending → approve → shipped, with diff, blame, revert and cherry-pick as new approval items | [agentverse/core.ts](https://github.com/CodesbyFebin/MuzeBOS--The-Zero-Trust-Business-OS/blob/feat/win-polish/lib/metabos/agentverse/core.ts), [server/commits.ts](https://github.com/CodesbyFebin/MuzeBOS--The-Zero-Trust-Business-OS/blob/feat/win-polish/lib/metabos/server/commits.ts) | Revert/cherry-pick create Jev items; they do not undo provider sends |
| Technical depth | Payload-hash-bound approvals, single send gate with idempotency keys, hash-chained evidence, Meta status breaker | [dispatch/service.ts](https://github.com/CodesbyFebin/MuzeBOS--The-Zero-Trust-Business-OS/blob/feat/win-polish/lib/metabos/dispatch/service.ts), [meta/status.ts](https://github.com/CodesbyFebin/MuzeBOS--The-Zero-Trust-Business-OS/blob/feat/win-polish/lib/metabos/meta/status.ts) | SQLite single node; no queue or vector DB |
| Use of Meta platform | WhatsApp Cloud API and Instagram adapters, signed webhooks, Login scopes, catalogue preview, Pixel/CAPI checklist, Meta status page | [meta/integration.ts](https://github.com/CodesbyFebin/MuzeBOS--The-Zero-Trust-Business-OS/blob/feat/win-polish/lib/metabos/meta/integration.ts), `/workspace/developer/meta-integration` | No live Meta app; App Review not submitted; publish/catalogue write/CAPI not built |
| Use of Llama | Local Llama drafts and Llama Guard checks via OpenAI-compatible URLs | [docs/DEMO-SCRIPT.md](DEMO-SCRIPT.md) step "Claw swarms" | Needs a local model running; demo-mode reply is a template, not model output |
| Impact | Small businesses answering WhatsApp leads with a human in control | [ACQUISITION.md](ACQUISITION.md) (business model, GTM) | No measured impact yet |
| Completeness | Typecheck, build, unit tests, browser e2e with axe and 44px checks | PR description for exact counts | 2–3 pre-existing lab tests fail (Node `globSync`, one timeout) |
| Demo | 3-minute guided Demo mode at `/workspace/builder/demo` | [DEMO-SCRIPT.md](DEMO-SCRIPT.md), screenshots in the PR | Inbound lead is a labelled FIXTURE unless a webhook is configured; send is held ("Not connected") without WhatsApp env |

## Fixture vs real in Demo mode
- **Real:** brand workspace, dispatch proposal, Jev decision with payload hash, the `/api/dispatch` call and its result, evidence rows, activity feed, weekly report.
- **Fixture (labelled on screen):** the inbound WhatsApp message (`+910000000000`, "Fixture lead (demo)", `kind='fixture'`), and the template reply text. Turn fixtures off with `MUZE_DEMO_FIXTURES=off`.
