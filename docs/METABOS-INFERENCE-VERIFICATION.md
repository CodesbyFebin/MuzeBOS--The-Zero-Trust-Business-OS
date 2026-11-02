# Inference workspace verification

Date: 2026-10-26 (India)

This report qualifies the code and controls described in METABOS-INFERENCE.md.
It does not qualify a live model deployment, indefinite uptime or a zk proof.

## Checks

| Check | Result |
| --- | --- |
| Frozen full suite | 363 files passed; 4,836 tests passed; 8 skipped |
| Focused inference/domain/API/process tests | 22 passed |
| Standalone TypeScript | Passed |
| Optimized production build | Passed |
| Commerce desktop/mobile browser flow | Passed |
| Mission Control desktop/mobile browser flow | Passed |
| Upstream integration desktop/mobile browser flow | Passed |
| Inference desktop/mobile control flow | Passed |

The source uses Node 22 and the locked WebLLM 0.2.86 package. Its pinned browser
model identifier exists in that package's prebuilt configuration. The model
runtime is loaded only after an explicit user action, and browser context is
bounded to 8,192 tokens with conservative input-byte admission.

Domain checks exercise routing, canonical approval binding, route changes,
transport selection, global concurrency, expired approval/lease recovery,
cancellation fences, bounded retries/delegation and durable result/audit
records. Provider tests use injected response fixtures and reject tool calls.
A separate process test starts two real Node workers against one approved task
and a local HTTP protocol fixture; exactly one provider request and commit occur.
This proves the transport and persistence path, not live model quality.

Browser checks prove persisted task creation, specialist/size assignment,
Jev approval, reload behavior, lease-token non-disclosure, fixture-only result
commit, reviewed child tasks, provider status, explicit missing-GPU/prover
states, retained stale snapshots, 18 navigation links and mobile layout. No
browser runtime errors were observed. No browser fixture output is presented
as a real model result.

The original inbox tests assumed a UTC afternoon also fell on the same local
day in every timezone. Their fixture now uses a local afternoon, with an
explicit midnight boundary assertion. Production inbox behavior was not changed.
Interim failed or mixed-source test runs are not counted as successful gates.

## Not executed

- Physical desktop or Android/iOS WebGPU model loading and inference.
- Live Ollama inference with downloaded weights.
- Meta Model API or OpenRouter calls using a real account.
- Muse Code/Wonder Full subscription runtime or OpenClaw tool execution.
- RISC Zero/SP1 or another zkVM prover/verifier.
- Docker Compose startup, restart/restore drills or 24-hour operation.
- Production TLS, multi-user isolation, passkey step-up or independent review.

Docker and Rust tooling were unavailable. External providers/credentials were
not configured. Compose files and a private bootstrap path are provided for
subsequent host qualification. No paid calls or cloud resources were created.

## GitHub publication

The qualified source is prepared on `feat/inference-swarm`. See the repository's
pull requests and commit checks for live publication/CI state. Local results
above are not a claim that external provider or deployment gates passed.
