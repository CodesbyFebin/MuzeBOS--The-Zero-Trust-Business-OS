# Voice assistant ("Hey MeTaBos")

Built during the event. The assistant is on Mission Control (`/`) and talks to `POST /api/voice`.

## How it works
- **Input:** hold the mic button or **Alt+M** to talk. There is also a typed fallback box. The wake phrase "Hey MeTaBos" is **off by default**. When the owner turns it on, it listens only while the tab is visible.
- **Speech to text:** `muse-voice-transcribe-1.0` via `POST https://api.meta.ai/v1/asr/transcribe`.
  - Multipart request with a `request` JSON part and an `audio` part. WAV only, 10 min / 32 MB max.
  - Confirmed against dev.meta.ai/docs/api-reference/voice/transcribe on 28 Oct 2026.
  - Without a key the server answers "Not connected", and the browser uses the Web Speech API instead.
  - Audio is never stored.
- **Brain:** a fixed tool set.
  - Read tools: `get_status`, `explain_item(id)` and `list_tasks`. They use DB counts only. When there is nothing to count, the reply is "No records yet / Insufficient data".
  - Write tools: `create_task`, which makes a pending Jev item, and `draft_message`, which writes an `mb_brain_drafts` row after a Llama Guard check.
  - Nothing is ever dispatched (`dispatched:false`). The module does not import dispatch.
- **Approvals are refused by voice:** "Open it to approve", plus a deep link to `/brain?run=<id>`.
- **Routing:** rules come first. Free text then goes to `metaCall` task `classify`, which uses the local Llama tier when configured and otherwise `muse-spark-1.3-contributor`. The USD cap, the token saver and low reasoning all apply.
- **Evidence chain:** `voice.stt`, `voice.command`, `voice.tool` and `voice.refused`.

## Verification
- `tests/voice-assistant.test.ts` has 12 unit tests covering gating, refusal, no dispatch, empty states and the wake phrase.
- `scripts/e2e-voice.sh` runs against the production build with a fresh SQLite DB, using the typed fallback. Output on 28 Oct 2026:
  - Anonymous request: 401. Setup: 200.
  - Status: "No records yet. Insufficient data…".
  - Create: pending Jev item, `dispatched:false`.
  - "approve it": refused with a deep link.
  - Status again: "1 Jev item waiting for approval…".
  - `/` returns 200 and contains the voice card.
- **Live round trip, 13:52 IST, 28 Oct 2026.** Two WAV clips were sent to the real STT endpoint:
  1. Heard as "Hey meta, boss, what is the status today?" (3.5 s of audio, 2.3 s latency) → `get_status`.
  2. Heard as "Could you remind me to call the flower supplier tomorrow morning?" ("flour" was misheard as "flower") → the model answered as `muse-spark-1.2-contributor` (a fallback from 1.3; the reason was not investigated) → `create_task` → pending Jev item.
  - Model spend was USD 0.000056. STT cost is unknown because the price is not verified.

## Known limits
- STT accuracy on short clips is imperfect, so the wake regex also accepts "Hey meta, boss".
- Realtime `wss://api.meta.ai/v1/asr/realtime` is not wired; only batch push-to-talk is.
- Registry entry `brain.voice-assistant` (available) with its own page at `/workspace/brain/voice`.
