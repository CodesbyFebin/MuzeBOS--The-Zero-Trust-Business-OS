# MuZe production-source comparison — 2026-11-03

## Source coverage

Reviewed the attached `argon-source.zip`, `argon.html`, and `qw.tar`, plus the
existing locally qualified MuzeBOS integration at `6b6cb3f`. The newly attached
`workspace-dc62d6d9-9cd5-4352-8ba3-f91b495a87e9.tar` was unavailable. Its contents
have not been read or merged. This is source review and local qualification,
not verification of either deployed production instance.

## Choice

Use **MuzeBOS as the sole backend, Argon as the companion control surface, and
selected qw dashboard interaction patterns as design references**. Keep one
Next application, one commerce/evidence database, and one durable inference
queue. Do not add a second Prisma database or replace payload-bound approvals
with a visual status switch.

| Area | Argon | qw workspace | MuzeBOS integrated base | Decision |
| --- | --- | --- | --- | --- |
| Companion | Real local intent router, 3D fur, mood, music and language tools | Fur companion and broad dashboard views | Existing roaming guide and voice interface | Reuse supplied Argon renderer in an isolated frame; keep dashboard guide/navigation in host |
| AI execution | No model or server worker | Chat uses z-ai SDK; fallback prose claims work that did not occur | Durable tasks, leases, routing, bounded attempts and exact-hash approval | MuzeBOS queue is the brain; Argon UI never approves itself |
| Business facts | No business database | ensureSeed populates fictional people, agent status, invoices and metrics | Real SQLite records and separately identified demo mode | Render real counts and explicit empty states |
| Completion claims | Local tools actually change local UI/audio | Chat fallbacks say spawned, reconciled or routed without performing those actions | Execution/evidence states stored in backend | Exclude qw success fallbacks and sample claims |
| Authorization | Standalone local app | Inspected actions, chat and Jev handlers have no member/permission/origin gate | Operator gate, member sessions and domain permissions | Add a member-gated companion API; reuse MuzeBOS controls |
| Approvals | No business-write gate | Jev PATCH toggles a string, optionally promotes a skill | Hash-bound inference and distinct-reviewer MuZe sends | Retain existing approval workflow; no iframe approve/send intent |
| Continuous work | Browser lifecycle only | automate creates a job row with `nextRun: armed`; that does not establish a running scheduler | Server worker, SQLite leases, supervisor packaging and heartbeat | Worker handles continuous execution while its host runs; show heartbeat age honestly |
| Rendering stack | Inlined three.js r128 | React 19, Next 16, Prisma and three.js 0.187 | React 18, Next 15, better-sqlite3 and existing fur engine | Keep dependency baseline; isolate r128 so it does not collide with host Three.js |
| Trust claims | Local companion only | Seed prose includes unestablished zero-egress, sandbox and tamper-proof claims | Hash-chain/inclusion checks with explicit limitations | Do not import unsupported ZK, hardware or security claims |

## What was integrated

- Argon's supplied modular sources, local tool router, multilingual UI, generative
  music and 3D renderer are retained under `vendor/argon`. The hosted build is
  reproducible with `python3 scripts/build-argon.py`.
- One roaming MuZe control is mounted in the shared application shell. Its brain
  panel persists across in-app navigation and lazily loads Argon when opened.
- The panel uses qw's companion + grouped destinations + workspace-card concept,
  rebuilt with existing MuzeBOS tokens and real backend data. qw's demo seeds,
  generic record API, second auth/data layer and mock completion claims are excluded.
- A strict opaque-origin message bridge accepts only fixed navigation targets,
  a workspace-status request, and bounded task text. Task text fills a review
  form; it does not enqueue itself. Creating a draft is a separate user action.
- Drafts enter the existing InferenceStore as awaiting approval, with a bounded
  snapshot of actual workspace facts and instructions against invented actions.
  The iframe cannot approve, execute, send, load network resources or read host
  cookies/localStorage.
- Workspace metrics and worker liveness come from the server; no heartbeat means
  continuous execution is not confirmed. Browser uptime is never worker uptime.

The original Argon README describes standalone capabilities. The hosted frame
intentionally has narrower permissions: microphone access, automatic speech,
settings persistence and downloads are not granted through the sandbox. Use the
existing dashboard voice surface for microphone input. Browser speech services
may use a vendor network service; offline voice is not asserted.

## Product and hackathon focus

The coherent product is a founder's **reviewable operations copilot**: a visible
companion explains the live business, prepares a bounded draft, hands the exact
proposal to a human, and shows the resulting durable record and evidence.

Demonstrate one real business journey rather than a catalogue of simulated
agents: an unpaid invoice → grounded draft → explicit approval → a permitted
provider receipt → evidence export. Keep fixtures visibly labeled if live
provider access is unavailable. Record the actual model, usage and observed
result. Attribute the inherited code and Argon sources accurately.

No implementation can guarantee a hackathon win. Judging eligibility, model
access, live-provider proof, video, submission and security review remain
independent completion gates. No event rules were re-verified in this source
integration; consult the organizers before making an eligibility claim.

## Local verification

446 test files passed; 5,619 tests passed, 9 skipped, 0 failed. Final typecheck
and production build passed. Production HTTP checks passed with a real workspace
session and a real server worker process: grounded draft creation, exact waiting
state, idempotent retry, rejection of caller-supplied approval, persisted worker
heartbeat, one shared roaming wrapper and the hosted Argon asset/CSP. The worker
left the unapproved draft untouched. Hosted bridge routing and embedded-script
syntax checks also passed. See `verification.json`.

These are local source/HTTP/process checks. Browser interaction, actual WebGL
rendering/accessibility, live model calls and continuously deployed production
uptime have not been established. GitHub remains unchanged pending explicit
push approval.

## Additional release candidates

| Input | Decision | Reason |
| --- | --- | --- |
| Unified MuZe + Argon Git bundle | Release base | Preserves reviewed PR ancestry, one workspace database, approved execution and the companion bridge. |
| GitHub main snapshot | Upstream baseline | Retained in the integration ancestry. Use GitHub to verify the current main commit and PR heads before publication. |
| AgentVerse v4 | Evaluate individual ports | Signed webhooks and agent audit workflows are useful. Its Express and Rust servers bring separate session, persistence and automation boundaries. A port must use MuZe workspace identity and the existing review queue. |
| MuZe fullstack SPA | Interaction reference | The zero-dependency server and offline heartbeat support a demo. Production worker health comes from the durable queue's server heartbeat. |
| AgentRQ | MCP collaboration reference | Evaluate task and human approval adapters against the existing queue and identity checks. |
| Forge, ZK, Business Server and Sovereign dashboards, and Sovereign HTML | UX references | Keep simulated or illustrative trust states separate from verified evidence. |
| qw | Existing integration reference | Dashboard interaction patterns already informed the unified build. |

The three alternate workspace TAR uploads were unavailable. Their contents were excluded from the comparison. Future ports should share the workspace session and queue, include explicit failure states, and prove that approved payloads survive retry without duplicate effects.
