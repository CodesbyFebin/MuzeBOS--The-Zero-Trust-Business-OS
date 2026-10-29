# Technical notes from the pinned references

Read with [UPSTREAM-REVIEW.md](UPSTREAM-REVIEW.md), which records exact revisions and reuse boundaries. These notes describe the reviewed sources, not capabilities installed into MeTaBos.

## Munder Difflin: office visualization

The inspected `OfficeFloor.tsx` owns a Pixi Application, layers, seat claims and transient message envelopes, while `Character.ts` manages direction/animation state and path traversal. The scene also handles hidden-floor pausing and WebGL context recovery. `MessageEnvelope.ts` animates a lightweight graphic between world-space endpoints and tracks completion so the scene can retire it. `pathfinding.ts` explicitly credits another upstream project; it is not an unattributed utility to copy blindly.

That renderer belongs to an Electron harness with its own state store, IPC, terminal lifecycles and asset paths. Dropping the component into Next.js would not connect those lifecycles to MeTaBos. The Arena therefore uses its own small Pixi scene and existing inference rows. It adds no terminal emulator or PTY, copies no tilesets and presents no agent as running merely because an avatar exists. A future full office should add camera controls, context-loss recovery, visibility-based renderer suspension and retained event cursors before scaling to hundreds of entities.

## Nakama: scoped skills and approval configuration

The reviewed core skill types distinguish a parsed Markdown body from frontmatter, explicit invocation, matching behavior and declared script tools. Its server skill-write approval helper resolves profile and organization settings; absent configuration is not the same as a mandatory owner gate. These are useful product distinctions, but they cannot replace MeTaBos server-side permissions.

The Arena intentionally has no script path field and no automatic matching. Its sole declared tool is `inference.draft`. Its write API requires session-derived `finance.read` and `jev.decide`, while each generated task still awaits its own exact-payload Jev approval.

## OpenBot: the computer is not the authorization boundary

The architecture describes a React surface, Hono server, PostgreSQL, AG-UI endpoints and a supervisor for per-bot browser/workspace containers. Tool requests return through the server gateway: resolve the target, evaluate policy, record a decision, then forward or refuse; failed forwards get a further audit row.

An important configuration distinction: its policy evaluator is described as fail-closed for missing/broken policy, but the documented shipped startup default explicitly permits all through its allow list unless overridden. That default should not be mistaken for a restrictive production policy. A MeTaBos adapter would need its own deny-by-default grants, tenant checks, budgets, approval binding and cancellation/lease rules.

No such supervisor is connected in this patch. Worker IDs and hashes in the Arena are ordinary records, not DID credentials, isolated computers or external attestations.

## Refly: reuse the concept, not restricted source or a claimed wire format

The reviewed CLI types include stable skill names, descriptive metadata, workflow binding, optional version metadata and local/cloud source distinctions. They also label an older registry structure deprecated in favor of discovery through links. Consequently a generic JSON/YAML manifest is not automatically a compatible Refly skill package.

MeTaBos has an independently written schema and explicitly does not import a Refly workflow. Its API version is an integer, and its bounded steps produce independent pending drafts. A saved hash makes the manifest reproducible to inspect; it does not make an LLM response deterministic. JSON Schema is provided for validation, and YAML/Markdown are inspection/export formats, not script execution formats.

## Omarchy: desktop affordances, not backend isolation

The reviewed AI manual lists coding-agent launchers and describes lazy CLI installation/authentication behavior. This is a host desktop workflow, not a safe way to create 500 remotely controlled business-agent computers. No Omarchy command or installer was run. Its keyboard-first launcher/workspace approach fits the existing MeTaBos palette and sidebar without changing the host OS.
