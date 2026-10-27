# Reference projects and how MuzeBOS differs

Sources: each project's GitHub repo, README and license file (read via the
GitHub API on 2026-10-28), plus https://businessos.dev/. Star counts are as of
that date. **No code, assets or text from these projects is copied into
MuzeBOS.** That is required by the hackathon's new-work and rights rules, and
also by their licenses (see the notes column).

| Project | License | Stack | What it does | AI usage | License note for us |
| --- | --- | --- | --- | --- | --- |
| [coreBOS](https://github.com/tsolucio/corebos) | Sugar Public License 1.1.2 (MPL 1.1 derivative, `licence/LICENSE.txt`) | PHP (vtiger lineage), Smarty | CRM/ERP for SMBs: contacts, quotes, invoices, workflow engine, DMN decision tables, Kanban tickets, many integrations (WhatsApp, WooCommerce, Mautic…) | None described in README | **Archived.** README says continued use conflicts with EU rules (NIS2) and development moved to a closed license. File-level copyleft, so don't copy. |
| [Miosa-osa/BusinessOS](https://github.com/Miosa-osa/BusinessOS) / [businessos.dev](https://businessos.dev/) | Apache-2.0 | Go backend, SvelteKit, PostgreSQL, Redis, Elixir parts | Local-first desktop with module windows, CRM, projects, tasks, docs, PTY terminal, custom-module builder; paid cloud computer plans ($40 to $200/mo) | BYO keys; hosts agent runtimes (Claude Code, Codex, OSA-Agent…) running automations 24/7; "self-learning" from signals | Permissive, but attribution and NOTICE are required if code is ever used. We use none. |
| [Operately](https://github.com/operately/operately) | Apache-2.0, plus a separate Enterprise license for `ee/` | Elixir/Phoenix, React/TS | Company OS: goals/OKRs, projects, check-ins, team spaces, message boards, docs | CLI + API + published agent skills so external agents can create goals and post check-ins | `ee/` is not open source. Don't touch it. |

## Where MuzeBOS is different

1. **The approval gate is the product.** In MuzeBOS an agent can only *propose*.
   Jev binds a human approval to the canonical payload hash, so a tampered
   proposal is refused, and there is no auto-approve path. BusinessOS runs
   agents autonomously 24/7, and Operately gives agents direct API write
   access. Neither documents a payload-bound human gate.
2. **Model output is treated as untrusted ("zero-trust" as a design goal, not
   a certification).** The first JSON object is parsed against a strict
   schema, with a tool allow-list, and the caller fixes the task, role and
   model fields.
3. **Meta model routing.** A swarm sorter assigns small and medium subtasks to
   Muse Spark 1.3 and large ones to Muse Wonder 1.0. Open-weight Muse Spark
   Open can run on Baseten instead. The others are model-agnostic (BYO keys)
   or have no model integration.
4. **Solo-founder scope with money integrity.** Integer minor-unit money,
   payload-hash approval and 8-step atomic invoice issuance were inherited and
   built before the event. coreBOS has broader ERP coverage. Operately targets
   teams, not solo founders.

## Where they are ahead (honest gaps)

- **Real multi-user auth, roles and teams** (BusinessOS, Operately). MuzeBOS
  is a single-operator local preview.
- **Production deployments and integrations.** coreBOS has dozens of
  integrations, and BusinessOS ships a desktop app and cloud hosting. MuzeBOS
  sends nothing to external providers yet.
- **External agent access.** Operately publishes a CLI, an API and agent
  skills.
- **Maturity.** About 596 stars for Operately, 162 for coreBOS (archived) and
  136 for BusinessOS, with years of history. MuzeBOS is days old.
- **Proposal breadth.** MuzeBOS agents can only propose `reminders.create`.
