# WebLLM inference and model routing in MuzeBOS

MuzeBOS has a persistent inference workspace at `/workspace/brain/inference`.
It routes small drafts toward browser WebLLM, medium analysis toward configured
local inference, and large planning toward an explicitly configured cloud route.
The operator reviews the exact task and route before dispatch.

## What runs in the browser?

An explicitly loaded WebLLM Web Worker uses the catalogued Llama 3.2 1B model.
Weights download to the device only when Load is selected. Actual inference
requires WebGPU and enough memory. Browser/mobile controls have been tested;
physical GPU inference remains a separate gate. A sleeping phone or suspended
tab is not a persistent server worker.

## What runs on the server?

A separate Node process claims approved jobs from SQLite with expiring leases,
random tokens and bounded concurrency. Configured routes support local Ollama,
Meta Wonder API and an explicit OpenRouter model. No silent paid fallback is
allowed in this persistent workspace; failures need fresh approval. Token
reservations are workload limits, not a currency spending cap.

## What is Jev?

Jev names MuzeBOS's built-in approval boundary. Approval binds the task payload,
model and configuration fingerprint. Every delegated child needs separate
review. It is not a claim of connection to an external Jev service.

## Is Muse Wonder Full or Claw running?

No qualified Muse Code/Wonder Full runtime, Claw tool bridge or zkVM prover is
included in the verified flow. Meta documents Wonder Full as a Muse Code
subscription capability, separate from the Wonder API model. Audit hashes are
not zk proofs. Live model calls and continuous host operation remain unverified.

The merged stack also includes an experimental `/workspace/brain/runtime`
interactive proposal interface with different configuration and fallback
behavior. Its Jev gate governs proposed business writes; it is not the persistent
inference dispatch gate. Do not treat the two interfaces as equivalent or assume
one interface's cost policy protects the other.

Read [exact setup and limits](../MUZEBOS-INFERENCE.md) and
[verification](../MUZEBOS-INFERENCE-VERIFICATION.md).
Primary model reference: [Meta model documentation](https://dev.meta.ai/docs/models).
Return to the [documentation hub](README.md).
