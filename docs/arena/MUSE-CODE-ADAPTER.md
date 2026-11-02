# Muse Code adapter boundary — reviewed 2026-10-29

Status: documentation and proposed integration contract only. No Muse binary or SDK was installed, no account was signed in, and no model call or subscription purchase was made by this change. The 3D Arena currently observes existing MeTaBos inference records, not live Muse Code sessions.

## Official surfaces reviewed

- https://dev.meta.ai/docs/muse-code — native CLI, headless execution, `muse serve` / `muse schema`, TypeScript package `@muse-code/sdk`. Docs list macOS, Linux and Windows; workflow availability depends on installed build/rollout. Session messaging is unavailable on Windows.
- https://dev.meta.ai/docs/overview — use the Model API to build an application, distinct from running the Muse Code harness. Documented base URL: `https://api.meta.ai/v1`. Documented Wonder model: `muse-wonder-1.0`; Spark examples include `muse-spark-1.3`. Model availability must be checked against the configured account. No guessed Wonder Full identifier is enabled.
- https://dev.meta.ai/docs/muse-code/auth — CI uses `META_API_KEY`; API billing is token based. The existing app's credential contract must be mapped explicitly rather than renaming its environment variables silently. Subscription allowances and API billing should be shown as separate configuration surfaces until verified for the operator's account.
- https://dev.meta.ai/docs/muse-code/configuration — headless `--json` emits JSONL events; `--max-model-steps` bounds a run. `--no-session-log` changes retention/recovery behavior; it does not establish an end-to-end zero-retention policy.
- https://dev.meta.ai/docs/muse-code/permissions — an OS sandbox and approval policy are distinct controls. Default auto-review and even untrusted mode do not require approval for every workspace file write. A sandbox is not a zkVM or cryptographic execution proof.
- https://dev.meta.ai/docs/cookbook/multi-agent-orchestration — the documented recipe uses Hermes profiles and durable Kanban comments. It is not evidence that Hermes is integrated into MeTaBos.

## Proposed MeTaBos bridge

1. Run a separately supervised, authenticated worker in a disposable worktree with filesystem/network/resource limits. Validate the installed protocol schema and advertised capabilities before accepting tasks. A CLI process and a child task are separate identities; never infer an agent fleet from a marketing count.
2. Use SDK/session protocol events for session/task/tool IDs, pending decisions, completion/failure and artifacts. Preserve source provenance and correlate them with MeTaBos task, worker and lease IDs; deduplicate event delivery. Event logging must redact prompts, credentials and tool output according to the explicit retention policy.
3. Before any business effect, construct a bounded proposed action; require exact-payload Jev approval with scope, actor, nonce, expiry and idempotency binding. Enforce business authorization in MeTaBos adapters, outside the model. A message or CLI approval cannot confer invoice/payment/publishing permissions.
4. Qualify interception separately for shell execution, file edits, MCP tools, computer use and spawned children. Until a category can be mediated, disable it or isolate its writes as untrusted artifacts. A terminal approval prompt alone cannot implement the every-action Jev requirement. Never enable bypass flags to make an unattended demo finish.
5. Route approved inference using operator-configured models and explicit budget limits: local model for bounded small drafts, Spark for normal supported workloads, Wonder for reviewed complex work. Validate tool/structured-output support and account access before dispatch. No automatic paid fallback, contributor mode, or subscription assumption.
6. Paint 3D agents only from persisted, observed events and current worker leases. Show unsupported capabilities as unavailable. On lease expiry, fence the old worker and reconcile its outputs before any retry; never replay an external action merely to animate a station.

## Qualification before claiming a live Muse Code integration

Require a reproducible run showing exact installed version/schema, authenticated transport, persisted task/event correlation, approval-before-effect, rejected and stale approvals, lost-event/restart recovery, cancellation/lease fencing, child isolation, redacted logs, budget denial and a verified artifact. Record actual model ID and latency, and distinguish model output from scripted fixtures. Only then change the adapter status from planned/not configured to verified.
