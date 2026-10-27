# Project story (Devpost-style sections)

Scope: **hackathon work = PR #22** (`feat/hackathon-submission`). Everything
earlier is inherited: the FounderOS fork, plus MuzeBOS commits made before the
Oct 26 kickoff. See HACKATHON.md. No metrics below are invented. Anything not
measured is not stated.

## Inspiration
I run my business alone, so I do sales, invoices, stock and follow-ups myself.
AI could draft most of that, but I won't give a model write access to my
books. I wanted AI that does the thinking while I stay the only one who can
make anything happen.

## What it does
You type one messy request, such as "Invoice Acme for 3 lamps, then remind me
to chase payment Friday; restock LAMP-01". MuzeBOS splits it into agent
subtasks. Small subtasks go to Muse Spark 1.3, large planning ones go to Muse
Wonder 1.0, and you can choose open-weight Muse Spark Open on Baseten instead.
Each model's answer is treated as untrusted JSON and checked against a strict
schema and a tool allow-list. Valid proposals wait at **Jev**, an approval gate
bound to the hash of the exact payload. Nothing executes until you approve.

## How we built it
- TypeScript/Next.js and SQLite. The app, workflow engine and Jev gate were
  inherited from before the event.
- New during the hackathon:
  - Meta Model API adapters (`api.meta.ai/v1/chat/completions` for
    Spark/Wonder, plus image generation and transcription adapters).
  - A Baseten adapter (`meta-models/muse-spark-open-1026`).
  - The ops-agent flow and the `npm run demo:agent` CLI.
  - 8 tests that use mocked network calls.
- Endpoints and model ids were taken from Meta's and Baseten's public docs,
  not guessed.

## Challenges we ran into
- Keeping the demo honest. Without a key, the flow runs in a labelled "rule"
  mode instead of faking model output.
- Separating new work from inherited work in a forked codebase. Commit
  timestamps showed that all of the earlier work predates kickoff.
- Making approvals tamper-evident: an approval binds to a canonical payload
  hash, not to a record id.

## Accomplishments that we're proud of
- A model can't execute anything. A proposal that calls an unlisted tool is
  refused before it reaches the gate, and a test covers this.
- One flow runs on both the hosted Meta Model API and open-weight Muse Spark
  Open.

## What we learned
- Meta's Model API is OpenAI-compatible, so one adapter shape covered Spark,
  Wonder and Baseten.
- Being explicit about what's untested makes the project easier to trust.

## What's next
- A recorded live run with real Muse Spark and Wonder output. As of writing,
  no live call has been made.
- A Muse Voice Transcribe screen that turns a voice memo into an ops request.
- More proposable tools behind Jev, such as invoice drafts. Issuance stays
  human-only.
- Multi-user roles.

## Built With
typescript, next.js, react, sqlite (better-sqlite3), zod, vitest, playwright,
meta-model-api, muse-spark, muse-wonder, muse-spark-open, baseten

## Try it out
- Repo: https://github.com/CodesbyFebin/MuzeBOS--The-Zero-Trust-Business-OS
  (must be public before submitting)
- `npm install && npm run demo:agent`. Set `META_MODEL_API_KEY` or
  `BASETEN_API_KEY` for a live run.
