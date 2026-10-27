# Demo runbook and three-minute video script

## Before recording

- Confirm the permitted track and all current official rules. The supplied guide
  permits existing products only with clear attribution in the appropriate track.
- Use Node 22, `npm ci`, then the fixture run below. The runner creates a **new
  temporary SQLite business** each invocation; it never opens the founder's DB.
- Store server keys privately using `provider.env.example` as a template. Leave
  `MUZEBOS_INFERENCE_PAID=0` until billing and provider account controls are reviewed.
  Credit offers/access are conditional. Do not record secrets or a billing screen.
- The new code retains the pre-event Jev engine. The first hash approves the cost
  and exact task; the second hash approves only the proposed local reminder.
- Baseten may reason before producing content. This runner allows at most 2048
  output tokens per request and rejects incomplete output. This token bound is not
  a dollar cap. If the model needs more, stop and review the design; never quietly
  increase the budget or claim success from a reasoning-only/truncated response.

## Rehearse without any model call

```sh
npm run hackathon:demo -- --fixture both
```

Expected: clear FIXTURE labels, two scripted gate reviews per provider, one local
reminder per provider, `auditValid: true`, and a temporary `report.json` with
`evidenceMode: fixture`. Fixture latency is local test time only. There is no
fabricated token usage. Reports and DBs remain private, disposable local artifacts.

## Real API demonstration — founder-operated

Configure `META_MODEL_API_KEY`, `BASETEN_API_KEY` and `MUZEBOS_INFERENCE_PAID=1`
privately. The script sets the reviewed Meta model to `muse-spark-1.3`; the Baseten
ID is pinned to `meta-models/muse-spark-open-1026` from the participant guide.
Both must actually be available to the account. A 404 or exhausted reasoning
budget is a failure, not permission to substitute another model.

```sh
npm run hackathon:demo -- --live meta
npm run hackathon:demo -- --live baseten
# Or one invocation with two separately reviewed provider calls:
npm run hackathon:demo -- --live both
```

Live mode requires a terminal. Read the displayed task/model/token limit/hash;
type the exact hash only if authorizing that request. Read the returned draft
and action plan; type the **different action hash** only if authorizing the
reminder. Any other answer stops the run. At most one request per selected
provider; no retries or fallback. Failed responses and invalid proposals stop
before the action gate. In-flight billing cannot be undone by cancellation.

Review the private report. It is operator-generated local evidence, not a provider
signature. Publish only a redacted report with genuine `live` results if both calls
actually completed. Keep fixture/live reports separate. No key, customer data,
lease token, raw reasoning trace or fabricated usage belongs in the submission.

## Interface walkthrough

`npm run dev` → `/workspace/brain/inference`. Choose `meta` or `baseten`, opt into
the paid task only after reviewing costs, create and inspect the exact draft.
Use the existing `MUZEBOS_WORKER_ENABLED=1 npm run inference:once` **only with a
known queue**: it claims one approved server task, not necessarily your latest
one. Review completed JSON, click **Send proposal to Jev**, then **Open Jev action
approvals**. Review source hashes/input/plan, approve and execute the reminder.
The handoff does not itself execute. Existing shell/approval UI is pre-event;
only the new controls and pipeline delta are part of this entry.

## Video script (180 seconds maximum)

| Time | Screen | Narration |
| --- | --- | --- |
| 0:00–0:20 | Provenance table and baseline SHA | “MuzeBOS already existed on FounderOS. This event contribution is the new Meta/Baseten-to-Jev handoff, its controls and reproducible demo. The existing Business OS and approval engine are credited as pre-event work.” |
| 0:20–0:45 | New route selector and model identities | “A founder can request help without giving a model write access. This change adds Baseten Muse Spark Open and selects Meta Spark through the existing API adapter.” |
| 0:45–1:15 | First exact task hash, model and token limit | “Jev requires review before the model call. This is [a live API call / a clearly labeled offline fixture]. The task authorizes one draft, with no tool access or automatic paid fallback.” |
| 1:15–1:45 | Returned JSON and Send proposal to Jev | “The client validates a narrow reminder schema. It rejects extra permissions, invoice tools, tool calls and incomplete responses. A completed draft can propose an action but cannot approve it.” |
| 1:45–2:15 | Second approval and reminder evidence | “This separate approval binds the exact action to the source payload and output hashes. Only now is one local reminder committed. Repeating the proposal returns the same run.” |
| 2:15–2:40 | Refusal tests and report mode | “These tests show missing consent, tampered evidence and disallowed actions failing closed. This report labels fixtures and live observations separately. It is local evidence, not a zk proof.” |
| 2:40–3:00 | New diff and limitations | “This is a small, reviewable step toward useful business agents. Credentials, spending controls and broader tools stay explicit. No autonomous payments, 24/7 deployment or whole-product event authorship claim.” |

Choose the correct live/fixture line; never read both as if both occurred.
Edit waiting time honestly and label any pre-recorded call. Do not hide a failed
call behind a fixture response. The demonstration should highlight only new code
and functionality, with inherited screens providing credited context.
