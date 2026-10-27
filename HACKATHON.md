# MuzeBOS at the Meta Global AI Developer Hackathon (Oct 26 to Nov 4, 2026)

**Theme:** Build for Your World. **Track:** Indie developer (solo).
**One line:** a zero-trust business OS for solo founders. Meta models do the
thinking, and nothing they propose touches your books until you approve the
exact payload.

## Problem

A solo founder runs sales, invoicing, stock, follow-ups and support alone.
AI assistants can draft all of that, but handing an LLM write access to
invoices and inventory is a risk most founders won't take, so the work stays
manual. MuzeBOS lets Meta models plan and propose operations work. A
deterministic gate called **Jev** makes sure every write waits for a human who
approves the canonical hash of the exact proposal. If the payload is changed,
the hash no longer matches and the write is refused. There is no auto-approve
path.

## What was built during the hackathon vs. inherited (read this first)

The hackathon began at the kickoff on **Mon Oct 26, 12:00 PM ET (16:00 UTC)**.
The schedule lists the building period as Oct 27 to Nov 4. The commit dates
below are taken from `git log`.

| Range | Dates (UTC) | Origin | Contents |
| --- | --- | --- | --- |
| `fb4a953`..`0362e27` | Oct 25 12:36 to 17:50 | **Inherited / pre-event** | FounderOS fork (MIT, see `LICENSE`, `THIRD_PARTY_NOTICES.md`, `founderos/`), MuzeBOS reference UI, local commerce desk, 18-section navigation, 29 reviewed upstream sources |
| `c722dbe`..`9daa66b` (PRs #3 to #20) | Oct 25 23:54 to Oct 26 12:16 | **Pre-event** (all committed before the 16:00 UTC kickoff) | Feature registry, Meta webhook receiver, Mission Control, payload-bound approvals and atomic issuance, Brain templates, analytics, workflows and evidence, AI runtime (tier router, swarm sorter, Jev gate), module engine, provider and infra pages, 220-route crawl |
| `feat/hackathon-submission` (this PR) | Oct 27 onward | **Built during the hackathon** | Items listed below |

Per the rules, the demo shows **only the rows marked built during the
hackathon**. Pre-event screens may appear briefly as context and are labelled
that way.

### Built during the hackathon

1. `lib/muzebos/ai/meta.ts` contains the Meta Model API adapters:
   - Muse Spark (`muse-spark-1.3`) and Muse Wonder (`muse-wonder-1.0`) over the
     OpenAI-compatible `POST https://api.meta.ai/v1/chat/completions`.
   - Muse Image (`muse-image-1.0`, `POST /v1/images/generations`).
   - Muse Voice Transcribe (`muse-voice-transcribe-1.0`, `POST /v1/asr/transcribe`).
   - A Baseten adapter for open-weight **Muse Spark Open** (`meta-models/muse-spark-open-1026`,
     `https://inference.baseten.co/v1`).
2. `lib/muzebos/ai/ops-agent.ts` is the agentic ops flow:
   - The swarm splits one messy founder request into subtasks.
   - Write-like subtasks go to Muse Spark (small/medium tier), Muse Wonder
     (large tier) or Muse Spark Open on Baseten.
   - Model output is parsed as untrusted JSON against a strict schema.
   - Valid proposals are filed with Jev, and nothing executes.
3. `scripts/hackathon-demo.ts` (`npm run demo:agent`) runs that flow from the
   CLI. It calls the models live when a key is set. Otherwise it runs in a
   labelled `rule` mode and makes no model call.
4. `tests/hackathon-meta.test.ts` has 8 tests with mocked fetch. They cover the
   endpoints and model ids, the key alias, the Baseten id, Wonder/Spark routing,
   refusal of unlisted tools, and the no-key rule mode.
5. This file, the README judge section, and `docs/hackathon/*`: the demo
   script, X post and submission field drafts.

## Meta models: where and how

The ids and endpoints come from https://dev.meta.ai/docs/models,
https://dev.meta.ai/docs/protocols/chat-completions and the Baseten Muse Spark
Open docs, all read on 2026-10-27.

| Model | Id | Endpoint | Used for in MuzeBOS | Status |
| --- | --- | --- | --- | --- |
| Muse Spark 1.3 | `muse-spark-1.3` | `api.meta.ai/v1/chat/completions` | Small and medium subtasks in the ops agent | Code and mocked tests. **No live call made yet** |
| Muse Wonder | `muse-wonder-1.0` | same | Large, multi-step planning subtasks | Same |
| Muse Spark Open (open weights) | `meta-models/muse-spark-open-1026` | Baseten `inference.baseten.co/v1/chat/completions` | Alternative engine (`--baseten`), aimed at the open-weight bonus | Same |
| Muse Image | `muse-image-1.0` | `/v1/images/generations` | Adapter only (planned: product image drafts) | Response shape assumed OpenAI-style, unverified |
| Muse Voice Transcribe | `muse-voice-transcribe-1.0` | `/v1/asr/transcribe` | Adapter only (planned: voice memo to ops request) | Form field names unverified |
| SAM 3.1 | `sam-3.1` | `/v1/responses` | Not used yet | Not implemented |
| Muse Glimmer | open weights, self-host | vLLM/llama.cpp via `MUZEBOS_LOCAL_OPENAI_BASE_URL` (pre-event local provider) | Possible local engine | Not tested |

## Architecture

```
founder request ──► swarm sortTask (deterministic split, role + tier)
                     │ write-like subtasks only
                     ▼
        tier router: small/medium ─► Muse Spark 1.3      (Meta Model API)
                     large ────────► Muse Wonder 1.0     (Meta Model API)
                     --baseten ────► Muse Spark Open 1026 (Baseten)
                     ▼
        parseModelProposal: first JSON object, strict zod schema,
        tool allow-list (reminders.create only); task/role/model fixed by caller
                     ▼
        Jev gate: workflow run, approval bound to canonical payload hash
                     ▼
        human approves in Brain → one write, evidence logged; else nothing
```

## How to run

```bash
npm install
npm run demo:agent                       # no key: labelled rule mode, no model call
META_MODEL_API_KEY=... npm run demo:agent  # live Muse Spark / Wonder
BASETEN_API_KEY=... npm run demo:agent -- --baseten   # live Muse Spark Open
npm run dev                              # UI; Jev queue at /workspace/brain/runtime
npx vitest run tests/hackathon-meta.test.ts
```

## Honest limitations

- **No live Meta model call has been made from this repo yet.** The build box
  has no key. The demo video must be recorded after a live run.
- Jev can only approve `reminders.create`. Invoices are still issued through
  the pre-event human approval desk, not by agents.
- The Muse Image and Voice Transcribe adapters are not wired to the UI, and
  their request/response shapes are unverified. SAM 3.1 is not used.
- Single-operator local preview: no rate limiter, unencrypted SQLite, nothing
  sent to external messaging providers.
- This is not certified as zero-trust or production-ready. "Zero-trust" is the
  design goal: models are untrusted and every write needs a human-approved
  hash.
