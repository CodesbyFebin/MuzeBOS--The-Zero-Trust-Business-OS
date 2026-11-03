<p align="center"><img src="docs/assets/muzebos-banner.png" alt="MuzeBOS banner" width="100%"></p>

# 🜂 MuzeBOS — The Zero-Trust Business OS

> **Your business, on your machine. Every action logged. Nothing runs without your approval.**

MuzeBOS is a self-hostable operating system for solo founders and small teams who want the leverage of AI agents without handing their data, money, or decisions to a third party. SQLite invoicing, inventory, CRM, approval-gated AI tasks, in-browser inference (WebLLM), Meta channel dispatch behind approval, and a hash-chained audit ledger — all in one Node process you can run on a laptop.

**Status:** Single-operator local preview. No model is configured by default, Meta sends are **DRY_RUN by default**, and live Meta use needs your own test-app tokens. Production qualification is not complete. Read [Honest Status](#-honest-status) before you build anything critical on top of it.

![License](https://img.shields.io/badge/license-MIT-FF2A2A) ![TypeScript](https://img.shields.io/badge/TypeScript-strict-FF2A2A) ![Tests](https://img.shields.io/badge/vitest-5%2C456%20passed%20%C2%B7%202%20known%20failures-FF2A2A) ![Runtime](https://img.shields.io/badge/runtime-Node%20%2B%20SQLite-0A0A0A)

> The test badge is the count from the last local `npx vitest run` on the `feat/business-open-server` branch (5,456 passed, 9 skipped). Two failures were already there on the base branch: `tests/lab-ledger-retention.test.ts` and `tests/lab-v2-g-copy.test.ts`. They are known and not yet fixed. CI badge numbers are not claimed.

---

## Table of Contents

1. [For Meta hackathon judges](#-for-meta-hackathon-judges)
2. [Why This Exists](#-why-this-exists)
3. [The Zero-Trust Model](#️-the-zero-trust-model)
4. [Feature Map](#️-feature-map)
5. [Architecture](#️-architecture)
6. [Quick Start](#-quick-start)
7. [Chatting With Muse](#-chatting-with-muse)
8. [The Inference Swarm](#-the-inference-swarm)
9. [Audit Ledger & Evidence](#-audit-ledger--evidence)
10. [Addon Catalog](#-addon-catalog)
11. [Muze Landing Widget (HTML)](#️-muze-landing-widget-html)
12. [Testing & Validation](#-testing--validation)
13. [Honest Status](#-honest-status)
14. [Known Gaps](#-known-gaps)
15. [Roadmap](#️-roadmap)
16. [Contributing](#-contributing)
17. [License & Attribution](#-license--attribution)

---

## 🧑‍⚖️ For Meta hackathon judges

- **How to judge it:** [docs/JUDGING.md](docs/JUDGING.md)
- **5-minute walkthrough:** [docs/DEMO-SCRIPT.md](docs/DEMO-SCRIPT.md)

What to expect when you run it:

- Out of the box, **no model is configured**. The UI says "Model not configured" instead of inventing a reply.
- **Meta sends are DRY_RUN.** An approved Messenger, Page or Instagram dispatch is recorded as evidence, and nothing goes to Meta.
- **Going live** needs your own Meta test-app tokens plus `MUZEBOS_META_DRY_RUN=0`. Lead retrieval also needs Meta App Review.

This project has **no partnership, endorsement or other relationship with Meta**. "Meta" names the Graph API and model APIs it calls.

---

## 🔥 Why This Exists

Most "AI business tools" ask you to do three things you should never do:

1. **Send your customer list to someone else's server** so their model can help you email them.
2. **Grant an agent write access** to your books, calendar, and bank-adjacent systems "for convenience."
3. **Trust a black box** when it says "I did this for you," with no way to replay why.

MuzeBOS refuses all three. It is built on a simple premise:

> An AI that works on your business must be able to *propose* anything and *execute* only what you explicitly approved — and every step must leave evidence you can read.

That constraint shapes everything below: the approval gate, the exact-payload binding, the durable job queue, the browser-local inference option, and the append-only ledger.

### Who it's for

- **Solo founders** running services, e-commerce, or consulting who need invoicing + CRM + automation but don't want five SaaS subscriptions leaking data.
- **Privacy-minded operators** who will self-host if the tool is honest about what it does.
- **Builders** who want a working reference for how to wire LLM agents into real business state safely.

### Who it's NOT for

- Teams needing full multi-user RBAC today. There are server-side role checks, but this is a single-operator preview.
- Anyone expecting a fully managed cloud product.
- Regulated environments requiring certified compliance controls.

---

## 🛡️ The Zero-Trust Model

"Zero trust" here is a design goal, not a certification. It comes down to four rules enforced in code.

### 1. No unapproved execution

Every AI-initiated mutation lands in a **pending** state, and a human approves the *exact payload*. If the payload changes by one byte after approval, the hash no longer matches and the job cannot run. The Business Open Server adds an optional **two-reviewer** gate: Reviewer A signs, then a *different* Reviewer B approves.

```text
Agent proposes → payload hashed → stored pending → operator approves (exact hash)
→ hash re-verified → worker claims / dispatch runs → result appended to ledger
```

### 2. Scoped capability registry

Nothing in the UI exposes a control for a capability that isn't implemented. The typed feature registry (`lib/metabos/registry.ts`, currently 248 pages) marks each page `available`, `existing`, `needs-credentials`, `planned` or `blocked`. Pages that depend on an external provider say so instead of looking half-working.

### 3. Local-first inference

Model calls route through an explicit transport chosen per task:

```
| Transport                               | Where compute happens         | Data leaves machine? |
| --------------------------------------- | ----------------------------- | -------------------- |
| WebLLM                                  | Your browser, GPU-accelerated | No                   |
| Ollama (MUZEBOS_OLLAMA_URL)             | Your local server             | No                   |
| Meta model API (muse-spark/muse-wonder) | Provider endpoint             | Yes — opt-in, logged |
| Baseten Muse Spark Open                 | Provider endpoint             | Yes — opt-in, paid   |
| OpenRouter (BYOK)                       | Provider endpoint             | Yes — opt-in, logged |
```

Classification decides which one is used. A draft of internal notes never needs to hit a paid API. None of these is configured by default.

### 4. Everything is evidence

Actions, approvals, rejections, dispatch results (including dry runs), reviewer signatures and worker leases are written to a **hash-chained audit ledger**. Each row references the previous row's digest, so tampering is detectable.

---

## 🗺️ Feature Map

### Core modules (implemented)

- **Invoicing** — atomic invoice issuance with inventory decrement and audit write in one transaction.
- **Inventory** — stock levels, reorder points, movement history.
- **CRM** — contacts, companies, interaction log, overdue-account flags.
- **Mission Control** — durable reminders, attention list, stale-state handling.
- **Navigation shell and search palette** — the menus and the search are built from the feature registry.

### Meta integration (implemented, DRY_RUN by default)

- **Graph API v25** client with token health check and asset discovery (Pages, IG accounts).
- **Messenger, Page and Instagram dispatch** through `/api/dispatch`. Each send only runs after a Jev approval of the exact payload, with an idempotency key. `MUZEBOS_META_DRY_RUN` is **on** unless set to `0`.
- **Webhooks:** Messenger messages go into the unified inbox, and leadgen notifications are received. Fetching lead contents needs Meta App Review.
- **Meta status monitor** — 17 Meta products with a circuit breaker and manual degraded marks.

### AgentVerse V3 and the combined MuZe build

- A server-and-channel console with a commit log, diffs and logs, plus intents that you commit through Jev.
- Also includes a 5-step ads draft wizard, an evidence vault, a firewall view and **server presets** you can deploy to the server rail.
- The **activity feed** is built from real records, and the MUSE Sanctum and Fleet console are folded into one build.

### Business Open Server (`/workspace/builder/business-open-server`)

- **Agent Office** — a 2.5D office with one desk per agent that has records. A desk shows working, waiting in Jev (glow), rejected or idle. If there are no agents, the office is empty.
- **MUSE Sanctum** — voice input (Web Speech) or typing → a plan from the configured model, or "Model not configured" → Jev → `/api/dispatch` → receipts.
- **Operator console** — mission scope, catalog coverage matrix, swarm radar and clan cards, plus a two-reviewer JEV gatekeeper and evidence receipts. The MUSE CLI shows **Not connected** until a real session exists.
- **Channels** — Discord-style Information, Governance (jev-approvals, audit-log, kill-switch, compliance) and Swarms groups. Messages are built from records and rendered as text only.
- **MCP directory** — read from `config/muse-catalog.json`, with connection status shown as it is.
- **Trust stack R0–R6 and verification pipeline** (propose → approve → sandbox → proof → receipt). Each layer is drawn from records and says "not attested" when nothing proves it.

### Reference content (documentation, not executable)

- **AI employee library** — role and routine documents loaded from an allowlist. These are texts to read, not schedulers or outreach bots.
- **Agent definition cards** in swarms are *definitions*, not running agents.

---

## 🏗️ Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│ Next.js 15 App Shell                                         │
│ Registry nav · Palette · AgentVerse · Business Open Server   │
└───────────────────────────┬──────────────────────────────────┘
                            │ authenticated requests (role checks on server)
┌───────────────────────────▼──────────────────────────────────┐
│ Backend                                                      │
│ ┌────────────┐  ┌───────────────┐  ┌───────────────────────┐ │
│ │ Job Queue  │→ │ Jev Approval  │→ │ Audit Ledger          │ │
│ │ (SQLite)   │  │ exact payload │  │ (hash-chained)        │ │
│ └─────┬──────┘  └──────┬────────┘  └───────────────────────┘ │
│       │                │ approved only                       │
│ ┌─────▼─────────┐ ┌────▼─────────────────────────────────┐   │
│ │ Inference     │ │ /api/dispatch (DRY_RUN default)      │   │
│ │ Router        │ │ Messenger · Page · Instagram · email │   │
│ └─┬───┬───┬───┬─┘ └──────────────────────────────────────┘   │
└───┼───┼───┼───┼──────────────────────────────────────────────┘
  WebLLM Ollama Meta model API  Baseten / OpenRouter  (all opt-in)
                            ▼
                       SQLite file
```

**Single SQLite file.** No Postgres, Redis or external queue. Back it up by copying one file.
**Registry over routes.** Navigation is generated from `lib/metabos/registry.ts`.
**Approval binds to payload, not intent.** Edit the amount after approval and the approval no longer applies.
**Workers are dumb and replaceable.** All state lives in SQLite, and leases are reclaimed via heartbeats.

---

## 🚀 Quick Start

### Prerequisites

- Node.js 20+ and npm
- Optional: a GPU and Chrome/Edge for WebLLM
- Optional: local Ollama (`MUZEBOS_OLLAMA_URL`)
- Optional: Meta test-app tokens (see [docs/PROVIDER-ENV.md](docs/PROVIDER-ENV.md))

### Install and run

```bash
git clone https://github.com/CodesbyFebin/MuzeBOS--The-Zero-Trust-Business-OS.git
cd MuzeBOS--The-Zero-Trust-Business-OS
npm install
npm run dev        # first run walks you through owner setup
```

### Production build

```bash
npm run build
```

Keep secrets in your environment, never in the repo. Meta stays in DRY_RUN until you set `MUZEBOS_META_DRY_RUN=0`.

---

## 💬 Chatting With Muse

> **Illustrative example — not real output.** It shows the shape of the approval flow. The names, amounts, hashes and row numbers below are made up. Your replies depend on the model you configure. With no model configured, Muse says so.

```text
You: create an invoice for Northwind Traders, 12 units of SKU-A, net 14
Muse: Drafted INV-2041. $1,440.00 due Nov 15.
      Inventory impact: SKU-A 40 → 28.
      ⏸ Pending your approval. Payload hash a3f9…c1e2
You: approve a3f9
Muse: ✓ Issued. Stock decremented atomically. Ledger row #8842.
```

Nothing is written until the approval references a specific hash.

### What it will not do

- Execute anything unapproved
- Silently switch to a paid transport
- Act on a payload you didn't sign off on
- Pretend a feature exists that the registry marks blocked, or present a fixture as live inference

---

## 🧠 The Inference Swarm

A bounded pipeline with named stages, not freelancing agents:

1. **Classify** the task by size.
2. **Assign** it to a draft agent by role.
3. **Route** it to a browser, local or cloud transport.
4. **Draft** the output under a durable lease.
5. **Gate** it through Jev on the exact payload.
6. **Commit** the result to the ledger.

Delegation is depth-limited and budget-limited, with daily caps per transport. Cancellation propagates to child tasks.

---

## 📜 Audit Ledger & Evidence

Append-only, hash-chained and exportable. Evidence actions include `dispatch.dry-run`, `dispatch.provider-accepted`, `dispatch.provider-failed`, `bos.review.signed` and `bos.review.rejected`. You can verify the chain from the app, and the Trust stack's R6 layer is checked against it. Earlier claims the code couldn't back up have been corrected, and this README states only what is enforced.

---

## 🧩 Addon Catalog

Thirteen companion projects extend MuzeBOS. They are pinned in a catalog with attribution; MuzeBOS remains the canonical base.

```
| Project                       | What it adds                                                                                     | Stack                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------- |
| **HackAsandboX**              | Hackathon discovery, attributed RSS readers, browser-local developer tools                       | React, Workers/D1, Python |
| **musebreak-core**            | Breakout/simulation core                                                                         | Python                    |
| **Meta-Ai-OS**                | Meta-layer AI orchestration                                                                      | TypeScript                |
| **BroCode**                   | Meta agentic orchestration                                                                       | HTML                      |
| **Worker-Agent**              | Cloud worker agent (fork)                                                                        | TypeScript                |
| **Metapen**                   | Deterministic authorization boundary for MCP orchestration *(private, unreviewed)*               | TypeScript                |
| **MeTaBos**                   | Meta-agentic business OS                                                                         | TypeScript                |
| **Coding-Agent**              | Local agentic engineering platform with MCP                                                      | TypeScript                |
| **Nirvana**                   | Utility                                                                                          | JavaScript                |
| **cua**                       | Computer-use sandboxes and benchmarks (fork)                                                     | Rust                      |
| **Open-Post**                 | Self-hosted social scheduler; one Node process, one SQLite file                                  | JavaScript                |
| **Jules-Claw**                | Async coding agent integrated with existing repos                                                | JavaScript                |
| **Open-Source-Ai-Full-Stack** | Curated catalog of LLM gateways, free APIs, chat UIs, local models, RAG, agent frameworks        | Python                    |
```

> **Security note:** Authorization gaps exist in Coding-Agent and BroCode; publishing controls in Open-Post need review; twelve dependency findings remain open including one critical. Metapen is private and has not been reviewed. Treat addons as untrusted until you audit them yourself.

---

## 🖼️ Muze Landing Widget (HTML)

A self-contained block with no build step, dependencies, external fonts or trackers. Paste it into an `.html` file.

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>MuzeBOS — The Zero-Trust Business OS</title>
<style>
:root{--bg:#0A0A0A;--panel:#111111;--line:#2a2a2a;--ink:#F2F2F2;--dim:#B0B0B0;--accent:#FF2A2A}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
.wrap{max-width:960px;margin:0 auto;padding:48px 20px 80px}
header{text-align:center;padding:64px 0 40px;border-bottom:1px solid var(--line)}
.sigil{font-size:56px;line-height:1;color:var(--accent)}
h1{font-size:clamp(2rem,6vw,3.2rem);margin:.3em 0 .2em}
.tag{color:var(--dim);max-width:640px;margin:0 auto}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin-top:40px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:20px}
.card h2{font-size:1rem;margin:0 0 8px;color:var(--accent)}
.card p{margin:0;color:var(--dim);font-size:.95rem}
.note{margin-top:32px;padding:16px;border-left:3px solid var(--accent);background:var(--panel);color:var(--dim)}
a.cta{display:inline-block;margin-top:24px;min-height:44px;padding:10px 20px;border:1px solid var(--accent);border-radius:10px;color:var(--ink);text-decoration:none}
a.cta:hover,a.cta:focus-visible{background:var(--accent);color:var(--bg);outline:none}
</style>
</head>
<body>
<div class="wrap">
<header>
  <div class="sigil" aria-hidden="true">🜂</div>
  <h1>MuzeBOS</h1>
  <p class="tag">The Zero-Trust Business OS. Your business, on your machine. Every action logged. Nothing runs without your approval.</p>
  <a class="cta" href="https://github.com/CodesbyFebin/MuzeBOS--The-Zero-Trust-Business-OS">View on GitHub</a>
</header>
<main class="grid">
  <section class="card"><h2>No unapproved execution</h2><p>AI proposes; you approve the exact payload. Change one byte and the approval no longer applies.</p></section>
  <section class="card"><h2>Local-first inference</h2><p>WebLLM in your browser or Ollama on your server. Cloud models are opt-in and logged.</p></section>
  <section class="card"><h2>Everything is evidence</h2><p>A hash-chained ledger records approvals, dispatches and dry runs.</p></section>
  <section class="card"><h2>One file to back up</h2><p>One Node process and one SQLite file. No Redis, no external queue.</p></section>
</main>
<p class="note">Single-operator local preview. No model is configured by default, and Meta sends are dry-run by default. Not affiliated with Meta.</p>
</div>
</body>
</html>
```

---

## 🧪 Testing & Validation

```bash
npx tsc --noEmit                 # typecheck
npm test                         # vitest
npm run build                    # next build
AXE=path/to/axe.min.js node scripts/e2e-bos.mjs http://localhost:<port> /tmp/shots-bos
```

Last local run:
- **Typecheck and `next build`:** passed.
- **vitest:** 5,456 passed, 9 skipped, 2 known failures that were already on the base branch (`lab-ledger-retention`, `lab-v2-g-copy`).
- **Business Open Server browser e2e:** passed across 10 views, with 0 axe WCAG 2.1 AA violations and 0 tap targets under 44px.

Provider adapters are fixture-tested; that is not live verification.

---

## 🧾 Honest Status

- **Model:** none is configured by default. You need WebLLM, Ollama or a provider key. Without one the UI says "Model not configured".
- **Meta:** `MUZEBOS_META_DRY_RUN` is on by default. Live sends need your own Meta test-app tokens and `MUZEBOS_META_DRY_RUN=0`. Live Meta delivery has not been verified in this repo.
- **Leads:** webhook notifications are received, but reading lead data needs Meta App Review.
- **Trust stack:** R0–R2 and R4 are **not attested**. R3 depends on configuration, R5 is enforced in code, and R6 is checked against the audit chain.
- **MUSE CLI:** not connected; there is no CLI session backend yet.
- **Users:** a single-operator preview, not production-qualified, with no compliance certification.
- **Traction:** no users, revenue or traction are claimed, and there is no relationship with Meta.

## ⚠️ Known Gaps

- There are 2 failing vitest suites (`lab-ledger-retention`, `lab-v2-g-copy`) that are not yet fixed.
- Lead retrieval is blocked on Meta App Review, and live Meta sends are unverified.
- The R0–R2 and R4 trust layers have no attestation.
- There is no CLI session backend, and the Operator console's Mission Scope only reads AgentVerse workspaces.
- Addons are unaudited; see the security note above.

## 🛣️ Roadmap

- Live Meta verification on a test app, then App Review for leads
- Attestation for the R0–R2/R4 trust layers
- A real MUSE CLI session backend
- Multi-user roles beyond the single operator

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Please keep claims evidence-backed: no mock data presented as live, and no "verified" without a record.

## 📄 License & Attribution

MIT. Upstream and third-party credits, including the owner-made AI Studio design references, are in [THIRD_PARTY.md](THIRD_PARTY.md).
