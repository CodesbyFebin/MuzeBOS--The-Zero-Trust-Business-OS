# Reference projects and how MuzeBOS differs

Sources: each project's GitHub repo, README and license file (read via the
GitHub API on 2026-10-28), plus https://businessos.dev/, operately.com (200) and corebos.org (200; says the open-source project is discontinued; demo.corebos.com unreachable). Star counts are as of
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

## Second set of reference projects (analysed 2026-10-28)

Each repo was read via the GitHub API (metadata, README, license). None
returned 404 and none is empty, but two are only tiny seeds (marked below).
Live URLs were fetched where a README named one. **No code, assets or text is
copied.** Repos with no license (all rights reserved) and AGPL repos were
studied for observed behaviour only.

| Project | License | Stack, stars | Live URL | Notable features (observed) |
| --- | --- | --- | --- | --- |
| [desplega-ai/agent-swarm](https://github.com/desplega-ai/agent-swarm) | MIT | TypeScript, 954 | docs.agent-swarm.dev (200) | Lead delegates to workers, schema-validated task results, deferred tasks that wake on all/any outcome, Docker workers, memory, schedules |
| [Claw-Company/clawcompany](https://github.com/Claw-Company/clawcompany) | MIT | TypeScript, 488 | clawcompany.org | 38 agent roles, 6 company templates, 4-layer memory (chairman / company / archive / session), 9 agent tools, desktop app |
| [BoSMark/BoS_OS_Advancing_Skills](https://github.com/BoSMark) | MIT | Shell, 3 | none | Add-on skills for the BoS OS starter |
| BoSMark/BoSOS-Bootstrap | MIT | none, 3 | none | **Tiny seed** (~18 KB): one bootstrap skill |
| BoSMark/BoS_OS_Start | MIT | Shell, 25 | none | Bootstrap, then workshop, then run layer for a business OS |
| [getnao/sylph](https://github.com/getnao/sylph) | **No license** (all rights reserved) | JavaScript, 216 | none | Company brain: skills, background agents, self-improving knowledge base, daily/weekly todo planning |
| [Workflowsio/company-os-starter-kit](https://github.com/Workflowsio/company-os-starter-kit) | MIT | Shell, 92 | none | CLAUDE.md blueprint, 5 go-to-market skills, safety hooks |
| [Boom-Vitt/boombignose-erp-harness-ai](https://github.com/Boom-Vitt/boombignose-erp-harness-ai) | **AGPL-3.0** | Next.js 16 + Supabase, 54 | none | Founder dashboard (cash, burn, runway, MRR, weighted pipeline), deal kanban with win probability, quote to invoice, invoices frozen once issued, expenses where nobody approves their own, timesheets to invoices, n8n outbox, Cmd+K, integer money |
| [simonlin1212/Agent-Staff](https://github.com/simonlin1212/Agent-Staff) | MIT | Python, 45 | none | One agent per department plus a CEO chief of staff; per-department permission walls and data isolation; contract-expiry cron reminders; P&L rollup |
| dswh/company-os | **No license** | none, 30 | none | **Tiny seed**: AGENTS.md resolver, doctrine, rules (may / must-ask / must-never), append-only inbox, brain pages, tool registry with access tiers |
| [felipeluissalgueiro/hive](https://github.com/felipeluissalgueiro/hive) | MIT | HTML, 22 | hive.cadencia.ia.br (200) | 11 squads led by a chief-of-staff orchestrator, L1/L2/L3 memory, hooks, cron workers |
| [Hyper-AI-Lab/cyber-ai-team](https://github.com/Hyper-AI-Lab/cyber-ai-team) | MIT | Python, 19 | none | Chief operating agent, an independent observer agent that critiques decisions for prompt injection and goal drift, owner approvals with replay protection, ERPNext as system of record, owner console |
| rojenwai/CompanyOS | MIT | Python, 17 | none | Handbook of 20 departments plus an AI side |
| [gquthier/company-os](https://github.com/gquthier/company-os) | MIT | Shell, 7 | none | Agent bus and inbox, task claims, decisions registry, trusted vs draft knowledge, tiered autonomy (T1 acts, T2 notifies, T3 waits; money always T3), loops with verify/state/stop |
| [townsquare-os](https://github.com/townsquare-os) (org, 1 repo: townsquare) | Apache-2.0 | Python, 2 | none | Self-hosted; Google SSO; questions fan out to teammates, each answered under that person's own credentials, with citations; federation |

### Deduped feature matrix and what we did

| Feature (deduped) | Seen in | Hackathon value | MuzeBOS status |
| --- | --- | --- | --- |
| Lead/worker delegation with dependent tasks | agent-swarm, hive, clawcompany, Agent-Staff | High | **Built during the event** (Missions, PR #25) |
| Goals, linked projects, check-ins | Operately, cyber-ai-team (KPIs) | High | **Built during the event** (Goals, PR #25) |
| Chief-of-staff rollup brief | Agent-Staff, hive, gquthier, cyber-ai-team | High | **Built during the event** (Chief of Staff, PR #26) |
| Decisions registry (lookup before asking) | gquthier | Medium | **Built during the event** (PR #26) |
| Observer critique of agent proposals (injection, drift) | cyber-ai-team | High (fits zero-trust) | **Built during the event** (PR #26); advisory only |
| Tiered autonomy | gquthier, cyber-ai-team, dswh | Medium | Adopted as an **advisory label only**; MuzeBOS never auto-approves |
| Human approval bound to the exact payload | cyber-ai-team (replay protection) | Already ours | Inherited before the event (Jev) |
| Deal pipeline with win probability, founder dashboard (runway, MRR) | BoomBigNose (AGPL), coreBOS | High | **Built during the event** (PR #27), clean-room |
| Expenses where nobody approves their own | BoomBigNose (AGPL) | Medium | **Built during the event** (PR #27), multi-member rules |
| Per-department permission walls | Agent-Staff, dswh | Medium | **Built during the event** (batch 5 PR), clean-room |
| Layered memory | clawcompany, hive, cyber-ai-team | Medium | **Built during the event** (batch 5 PR), clean-room |
| Per-user credential fan-out, federation, SSO | townsquare | Low for a solo founder | Skipped |
| Skills/CLAUDE.md starter kits | BoS_OS_*, company-os-starter-kit, sylph, rojenwai | Low (docs, not product) | Skipped |
