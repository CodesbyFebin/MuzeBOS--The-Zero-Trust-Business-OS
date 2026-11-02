# Arena architecture and exchange format

The office is a projection of existing records, not an agent runtime. It is mounted under Brain and uses the same business database and member cookie as the rest of MeTaBos. The 18 primary destinations remain unchanged.

## Data path

1. `GET /api/metabos/arena` verifies operator/loopback access, workspace membership and `finance.read`. It reads existing inference tasks, worker heartbeat records, the local evidence chain and saved skill versions. Lease tokens and prompt/output bodies are not included in the observer response.
2. The client refreshes every 15 seconds while visible and on focus. Aborted/older reads cannot replace a newer snapshot. Authorization failures clear private content; other failures keep the last timestamped snapshot.
3. `ArenaOffice` defaults to dynamically loaded Three.js 3D robots; its selectable `ArenaFloor` fallback dynamically imports Pixi.js. Original geometric station cards and robot avatars use the app's theme tokens. No asset pack or remote sprite/font CDN is loaded.
4. An avatar represents a task assignment. Placement follows stored state and task kind. Only a running task with a future lease is marked leased. Movement occurs when a later snapshot changes a task's station. New parent/child rows can show a delegation envelope from the completed-parent staging dock; that is not evidence of a peer messaging transport.
5. The HTML list is authoritative and accessible when WebGL is unavailable. Up to 24 nonterminal assignments are returned for the floor and at most four are painted per station; the list shows up to the latest 100 stored tasks. This is not a claim to display or run 500 agents.

## Skill format

`skill.schema.json` is generated from `lib/metabos/arena/skill-contract.ts`. `starter-pack/` holds three original manifests: invoice review, customer reply and incident review. These are editor examples, never silently installed or run.

A manifest has a stable slug, human-readable name/description, tags, schema version 1, mandatory `jev-exact-hash` approval, exactly one allowed tool (`inference.draft`), and one to five bounded steps. Each step specifies draft/analysis/plan/code, instructions, a browser or Ollama lane and 32–512 output tokens. No executable scripts, credential fields, arbitrary URLs, shell tools or external publish rights exist in this schema.

Saved versions are append-only through the API. The caller supplies the expected previous version; a stale writer gets 409. SHA-256 covers canonical JSON. Old versions remain readable. Local database administrators can still alter database files; verification rejects a changed content/hash combination before export or proposal. This is tamper evidence, not an independently anchored proof.

JSON export includes version/hash/author metadata and the manifest. YAML export uses JSON-quoted scalars and flow collections, valid YAML 1.2, with version/hash comments. Markdown adds the same manifest as frontmatter plus readable step descriptions. The editor accepts a manifest, not an executable package. Refly/Nakama/Claude/Codex runtime compatibility has not been certified. Exporting instructions into another runtime does not preserve MeTaBos policy enforcement.

## Proposal path

`POST /api/metabos/arena` requires `finance.read` plus `jev.decide`, same-origin JSON, a 32KB body limit and a UUID idempotency key. The actor comes from the session. Saving creates a version and evidence. Proposing rechecks its hash, then atomically creates one independent inference draft per step with paid consent false. Every task remains `awaiting_approval`; no model is called and no worker is launched by this operation. A per-step failure rolls back the whole proposal. Lost acknowledgements can be retried with the same unchanged body/key.

The existing inference queue performs exact-task approval, route/budget checks and worker leasing. Tasks can be reviewed there. Those existing services must be configured and separately qualified. This Arena patch does not fix all pre-existing authorization issues in other routes, or turn the application into a production-qualified isolated execution system.

## Computers, sandboxes and identity

OpenBot's dedicated-computer pattern is a future adapter boundary, not an implementation included here. Before adding it, require an authenticated broker, scoped tool grants, per-task isolation, network policy, resource/time quotas, exact-payload approval, lease fencing, cancellation and independently checked artifacts. A worker ID string is not a DID or hardware attestation. A hash chain is not a zkVM proof.

No privileged installers, host OS changes, terminal spawning, AG-UI gateway, self-training, automatic repairs, cross-dojo mailbox, external skill publication or blanket agent autonomy was added.

For 3D rendering, picking, mobile and lifecycle details see `3D-AGENTS.md`. The observer API and Jev proposal path are unchanged.
