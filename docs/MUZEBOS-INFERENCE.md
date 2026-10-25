# MuzeBOS inference and bounded agent workspace

Updated: 2026-10-26 (India)

## What runs

`/workspace/brain/inference` is the responsive operator control panel. The
existing 18 main destinations are preserved. A persistent SQLite queue assigns
short drafts to the clerk/browser route, analysis to the analyst/Ollama route,
and planning/code proposals to the planner or code-reviewer/Meta Wonder route.
An explicit route can override this assignment before review. Routing is a
deterministic policy, not an unverified model estimate of task difficulty.

Every dispatch requires Jev approval by the current operator. Jev is the name of
the built-in gate, not a claim of integration with an external Jev product.
The canonical approval hash binds the prompt, specialist role, model, endpoint
configuration fingerprint, output-token limit, parent task and paid consent.
Model text cannot authorize itself, a child task or an invoice.

Outputs are drafts. This runtime does not execute shell commands, arbitrary
MCP tools, browser actions, publishing, payment, or invoice issuance. Existing
commerce actions retain their separate validation and approval boundaries.
No self-training or continuous model learning is claimed.

## Execution planes

| Plane | Implemented behavior | Boundary |
| --- | --- | --- |
| Web/mobile control | Task creation, review, cancellation, result inspection, model setup status, worker heartbeats, audit | Responsive web UI, not a certified native mobile app |
| Browser inference | WebLLM Web Worker, explicit Llama model download, up to three approved drafts per operator start | Requires actual WebGPU support and an active capable browser |
| Persistent workers | Separate Node process, shared SQLite, leases and crash recovery | Continuous operation requires a running host and supervisor |
| Jev policy | Exact-task approval, no silent reroute, expiry, hard limits and cancellation fences | Current single-operator session, not passkey signatures or RBAC |
| Proof | Existing SHA-256/audit evidence and explicit not-configured zkVM state | Hashes are not zk proofs; no RISC Zero prover was launched |

## Model routes

- Browser: `Llama-3.2-1B-Instruct-q4f16_1-MLC` through `@mlc-ai/web-llm`.
  Model weights are downloaded to the device only when Load is selected.
- Ollama: a configured loopback/private base URL including `/v1`, plus an
  installed model. Default model ID is `llama3.2:3b`; installation is separate.
  Local computation still consumes hardware resources.
- Meta: `muse-wonder-1.0` using Meta's Chat Completions endpoint. Requires
  `MODEL_API_KEY`, server paid opt-in and the task's explicit paid consent.
- OpenRouter: an explicitly configured model and key. Only a selected `:free`
  model can be enabled without server paid opt-in. Quotas/availability and
  provider terms still apply. No automatic free-to-paid substitution occurs.
- OpenClaw: visibly blocked pending a qualified isolated gateway and per-tool
  approval bridge. Its chat endpoint can invoke internal agent tools, so a
  compatible wire format alone does not establish MuzeBOS policy enforcement.
- Muse Code / Wonder Full: visibly blocked pending the installed subscription
  runtime, isolated workspace and per-tool bridge. Wonder Full is not selected
  by changing Muse Wonder's API reasoning effort. No generic API is invented.

Configuration presence is not a successful health check. No secret is returned
by `/api/inference`. Endpoint changes invalidate an existing task's route
binding; the worker will not silently move work to a different model.

## Durable state and budgets

Tasks move through `awaiting_approval → queued → running → completed` with
`cancelled` and `failed` terminal paths. Failed or expired attempts require a
fresh operator approval, up to two attempts total. A queued approval expires
after one hour. Leases last two minutes and may be renewed within an absolute
ten-minute browser execution window. Late completions after cancellation,
expiry, supersession or completion are rejected.

At most two tasks hold active leases. Root tasks are capped at 20 per UTC day.
Workers reserve at most 50 dispatches and 65,536 output tokens per UTC day.
These are workload limits, not a currency spending cap. Provider input billing,
subscriptions, hosting and computation can have separate costs.

Each completed parent may create one reviewed batch of up to five children.
Every child starts at awaiting approval. Depth is limited to two and each task
family to 25 records. No unrestricted recursive swarm is created.

Prompts and outputs in this workspace are durable operator records, separate
from transient model runtime memory. There is no zero-retention claim. A browser
result is browser-reported text; its hash does not prove which model computed it.
Missing provider usage remains missing rather than being replaced with zero.

## Run natively

Use Node 22 and `npm ci`. Configure secrets in the ignored `.env.local` or the
process environment. Export a consistent `MUZEBOS_DB` path for app and worker.

```sh
npm run build
npm start
```

In a second terminal, with the same database and model configuration:

```sh
MUZEBOS_WORKER_ENABLED=1 npm run inference:worker
```

`npm run inference:once` executes at most one approved server task. The worker
never runs without the enable flag. A supervisor must restart the worker after
a crash; stale task leases then require new approval rather than automatic
paid retries. Browser-only jobs need an active browser worker.

## Prepared Compose deployment

Docker was not available in the implementation environment; this packaging is
prepared, not runtime-qualified. Pin the Ollama image digest before deployment.
GPU acceleration and model memory requirements depend on the host.

```sh
cp deploy/inference/.env.example .env.inference
# Edit provider settings locally; never commit the filled file.
docker compose -f compose.inference.yml build
docker compose -f compose.inference.yml run --rm app npm run inference:bootstrap
docker compose -f compose.inference.yml --profile local-model up -d
# Explicit model installation, if using the optional Ollama service:
docker compose -f compose.inference.yml exec ollama ollama pull llama3.2:3b
```

Bootstrap accepts a hidden password from an interactive terminal and refuses to
overwrite an existing operator account. The application refuses non-loopback
binding before operator setup. The host port is loopback-only. Mobile/LAN access
requires a separately configured authenticated HTTPS reverse proxy and an exact
`MUZEBOS_ORIGIN` matching its external HTTPS origin; no public
endpoint is exposed by this recipe. Both services share the durable business
data volume. No Docker socket or host source directory is mounted into workers.
These containers are not a qualified arbitrary-code sandbox.

## zkVM boundary

A conventional sandbox runs agent workloads. A zkVM proves a specific program's
execution and verifies a receipt against an expected program image. It is not a
substitute for the continuously running host, GPU inference or auth policy.
A future proof service must bind the task hash, approval, policy version and
output hash to a verified journal, reject development/fake receipts, and pin the
expected image ID. Until that prover and verifier are installed and exercised,
the UI says not configured and cannot mark a hash as a verified zk proof.

## Primary references checked

- https://webllm.mlc.ai/docs/user/basic_usage.html
- https://dev.meta.ai/docs/models
- https://dev.meta.ai/docs/quickstart
- https://dev.meta.ai/docs/muse-code/extending
- https://docs.openclaw.ai/gateway/openai-http-api
- https://openrouter.ai/docs/api/reference/overview
- https://docs.ollama.com/api/openai-compatibility
- https://dev.risczero.com/terminology
- https://dev.risczero.com/api/generating-proofs/dev-mode
