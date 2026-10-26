# MuzeBOS security and data boundaries

MuzeBOS is designed around explicit approvals, local durable records and
inspectable evidence. Its zero-trust name is a design goal, not an independent
certification or a claim of complete production security.

## Does all data stay on my device?

Local business records persist on the configured host. Browser WebLLM inference
runs on the capable browser after an explicit model download. Cloud model calls
send approved prompts to the configured provider, whose own retention terms
apply. Prompts and outputs in the persistent task workspace are durable operator
records. There is no blanket zero-retention guarantee.

## What does the audit chain prove?

The application can verify a local hash chain and detect inconsistencies relative
to its current records. A database administrator can rewrite an entire unanchored
chain. Hashes do not establish an external timestamp, a passkey signature or a
zero-knowledge proof of model computation.

## What protects the workspace?

The startup wrapper restricts network binding before operator setup. Sessions,
origin checks, transaction policies and payload-bound approvals protect specific
operations. Public Meta webhooks use their own signature checks and durable
intake. Crawling directives are privacy hygiene, not access control.

## What remains to qualify?

Individual accounts/RBAC, passkeys, multi-tenant isolation, production recovery,
retention/deletion policy, isolated tool execution and independent security
review remain separate gates. Provider-dependent workspaces do not remove those
requirements. Use private TLS and current dependency/security updates before a pilot.

See [threat model](../MUZEBOS-ARCHITECTURE.md), [operations](../MUZEBOS-OPERATIONS.md)
and [inference boundaries](../MUZEBOS-INFERENCE.md).
Return to the [documentation hub](README.md).
