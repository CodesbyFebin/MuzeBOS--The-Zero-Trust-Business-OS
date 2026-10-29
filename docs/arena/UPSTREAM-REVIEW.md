# Arena upstream review — 2026-10-29

Reviewed source revisions, not star counts or unqualified runtime claims. These are design references, not bundled services.

| Repository | Pinned revision | License observed |
|---|---|---|
| [HarnessMD/munder-difflin](https://github.com/HarnessMD/munder-difflin/tree/f797048cc88ca2ff94bfc6c8c93b16f47a201f15) | `f797048cc88ca2ff94bfc6c8c93b16f47a201f15` | MIT source |
| [ahmadrosid/nakama](https://github.com/ahmadrosid/nakama/tree/724df73a6e36511cff67845cc0704ef4cfcb2837) | `724df73a6e36511cff67845cc0704ef4cfcb2837` | MIT source |
| [omacom/omarchy](https://github.com/omacom/omarchy/tree/1676904e4f1d2fec52c316dee580722079a663fe) | `1676904e4f1d2fec52c316dee580722079a663fe` | MIT source |
| [CopilotKit/OpenBot](https://github.com/CopilotKit/OpenBot/tree/4766e4247675eb73ff80d525ff645dd8a9da815f) | `4766e4247675eb73ff80d525ff645dd8a9da815f` | MIT source |
| [refly-ai/refly](https://github.com/refly-ai/refly/tree/52c200e217acaefbb7c88095f25e394544c8ec4d) | `52c200e217acaefbb7c88095f25e394544c8ec4d` | Modified Apache terms; commercial/branding restrictions |

## Decisions

- **Munder Difflin:** a genuine Electron/React/Pixi.js office with CLI-backed agents. Office motion and message visualization are useful patterns. Its `LICENSE-ASSETS` excludes bundled LimeZu tilesets/maps from the MIT source grant. No tilesets, maps, portraits, character names, office code or pathfinding code were imported. Its pathfinding file itself credits another upstream; copying it was unnecessary. MeTaBos uses original procedural Pixi.js artwork and its own persisted inference states. Envelopes only visualize newly observed parent/child draft delegation.
- **Nakama:** team agent identities, scoped permissions and shared Markdown skills are relevant. MeTaBos keeps its existing member/permission system and independently defines an explicit draft-only skill contract. No Nakama server, tools or organization layer imported.
- **Omarchy:** an actual desktop Linux distribution; useful launcher/keyboard/workspace ideas. No install scripts, host configuration or desktop packages run or bundled. It is not an inference runtime or a sandbox provider for MeTaBos.
- **OpenBot:** per-coworker computers and before/after action governance are useful architecture references. No computer is provisioned here; the page explicitly reports isolation not configured. Existing task hashes, leases and durable evidence are displayed. No AG-UI runtime or OpenBot implementation integrated.
- **Refly:** inspected README, LICENSE and CLI skill types. Its license adds organizational commercial-use and frontend branding conditions. No Refly code or frontend design copied. The MeTaBos format is independent and not a Refly import/export compatibility claim. Versioned manifests do not make model output deterministic.

## Implemented scope

Route: `/workspace/brain/arena`, nested in Brain; 18 primary destinations remain. Authenticated API: `/api/metabos/arena`.

- Observer view: stored inference tasks, up to 24 nonterminal task assignments, up to four visible avatars per station; exact states are available in the accessible list. Only a running task with a future lease is presented as leased. Failed/expired work is shown at Healing without claiming repairs occurred.
- Skill Forge: strict Zod schema, immutable API versions, expected-version concurrency guard, canonical SHA-256 binding, JSON/YAML/Markdown downloads, three original starter examples. No executable script paths, shell/network tools, automatic approval or arbitrary provider routes.
- Proposals create at most five independent, bounded inference drafts in one transaction; each remains `awaiting_approval` and needs its own Jev approval. No automatic multi-step sequencing, training, or tool execution.
- Arena reads/exports require workspace membership and finance.read. Writes additionally require jev.decide, same-origin access, bounded JSON, UUID idempotency and server-derived actor identity.
- Visible-tab polling every 15 seconds; last snapshot labeled on errors and cleared on authorization failures. Pixi loads only on this page. Motion obeys reduced-motion settings; the record list remains available without GPU support.

## Still absent

No 500-agent fleet, 20 isolated computers, shell terminals, OpenClaw bridge, self-heal execution, external skill marketplace, DID attestation, zkVM proof, 24/7 uptime or live model qualification. The existing inference worker must be configured separately. Exporting a skill elsewhere does not transfer MeTaBos policy enforcement. Existing audited authorization gaps in older API routes and approval-bundle behavior are outside this feature.

## Qualification

See `VERIFICATION.md` for the completed checks and known baseline failures. The entire app is not claimed production-ready.

