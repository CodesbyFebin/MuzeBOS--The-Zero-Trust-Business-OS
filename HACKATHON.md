# MuzeBOS hackathon contribution disclosure

**Submission candidate, not a statement of eligibility or acceptance.** This
project extends an existing product. Track selection and permission to build on
an existing product must be confirmed with the organizers before submission.
Do not submit it as a wholly new codebase or call every existing feature event work.

## Frozen pre-event baseline

Everything reachable from `1105e64ca6c6791170e619d9f446c81b9e6aec22` is pre-event
work for this submission. That commit is dated 2026-10-26 (14:05:01 UTC).
Its tree is `1820a253be4ea5f91a50d650954ae0b460331816`.
The participant guide supplied by the founder describes an October 27–November 4
build period. We use this conservative boundary even though the public event
page describes an October 26 kickoff. Git timestamps alone are not independent
proof of when work was performed; reviewers can inspect the actual diff.

```sh
git show 1105e64ca6c6791170e619d9f446c81b9e6aec22 --stat
git diff --stat 1105e64ca6c6791170e619d9f446c81b9e6aec22...HEAD
git diff 1105e64ca6c6791170e619d9f446c81b9e6aec22...HEAD -- lib/muzebos/inference
```

| Origin | Scope | Submission treatment |
| --- | --- | --- |
| FounderOS/GladOS inherited source | Existing Next.js workspace, Brain/chat and integration foundations; original copyright retained in `LICENSE` | Inherited, not event-built. Initial MuzeBOS history already contains this source; a pristine separately pinned FounderOS import was not supplied, so no unsupported line-by-line authorship claim is made |
| Pre-event MuzeBOS development | Entire frozen baseline: 18-destination shell, business records, invoice/stock transactions, evidence, Jev/workflow engine, browser/local/Meta Wonder/OpenRouter inference, worker leases, bounded delegation, reference imports and public docs | Existing product, not claimed as new hackathon functionality |
| Other upstream material | Precisely scoped imports and references in `THIRD_PARTY_NOTICES.md` and `docs/MUZEBOS-UPSTREAM-INTEGRATIONS.md` | Their notices and restrictions remain; not represented as original or as 29 integrated services |
| New submission work, October 27–28 | Baseten Muse Spark Open transport/routing; allowlisted Meta Spark selection; provider-response rejection checks; completed-server-output → Jev reminder proposal handoff; interface controls; bounded demo runner, tests and submission materials | Only this diff is claimed as event work, subject to organizer track/rule confirmation |

The initial #22 head `2db8d32bba207565efe095abd5394f9241511b99` is also
part of the event contribution, not the frozen pre-event baseline. Its model
constants, operations sorter and form/video drafts are retained or revised here.
The original key-presence-triggered API runner is replaced by the approved-lease
path; unqualified image/voice sketches are disabled until their contracts and
approval bridge are verified. This is a hardening of #22, not a second entry.

The October 28 follow-up audit patch corrects the browser handoff to the existing
Jev approval tab and adds a complete browser/API/SQLite reminder regression.
See [submission audit](docs/hackathon/SUBMISSION-AUDIT.md) for the remaining live,
security and final-artifact gates. This follow-up is also event-window work;
the existing Jev engine remains credited as pre-event.

## New work and reproducibility

- `lib/muzebos/inference/routing.ts`, `types.ts`, `store.ts`: add the Baseten lane
  and Meta Spark configuration while retaining the prior routing and approval core.
- `providers.ts`: Baseten transport on its fixed HTTPS origin, with no redirect,
  tool call, legacy function call or truncated-output acceptance. The existing Meta
  transport is extended, not presented as newly invented.
- `jev-bridge.ts`: completed Meta/Baseten drafts with matching payload and output
  hashes can propose **one local reminder**. Strict JSON validation is performed
  locally; model structured-output enforcement is not assumed. The proposal is
  bound to source hashes and awaits a **separate** exact-payload approval in the
  existing Jev workflow engine. Repeating it returns the same workflow run.
- `app/api/inference/route.ts`, `InferenceWorkspace.tsx`: protected proposal command,
  Baseten route selector and a handoff to the existing governed-workflow desk.
- `lib/muzebos/ai/ops-agent.ts`: preserves the request sorter as a bounded draft-only
  intake. Key presence never dispatches calls; each task awaits Jev. Selected
  workspace model is explicit; no mixed-model live-swarm claim.
- `scripts/hackathon-demo.ts`: isolated synthetic-business demonstration, two gates
  per provider, at most one API request per provider per invocation, no retries or
  paid fallback. It never sends money, issues invoices, publishes or messages people.
- `tests/muzebos-hackathon.test.ts` and related qualification: protocol fixtures,
  approval boundaries, provenance tampering, refusal and replay tests.

## What is actually verified?

Read [qualification](docs/hackathon/VERIFICATION.md) for measured checks. **No live
Meta or Baseten call is claimed by this PR.** The real HTTPS adapters exist, but
credentials, access to the event model and billing readiness require a live test.
A fixture report is not evidence of model inference or Meta-credit usage.

| Route | Exact model in this demo | Evidence boundary |
| --- | --- | --- |
| Meta Model API | `muse-spark-1.3` | Documented API; fixture-tested locally, live account execution unverified |
| Baseten Inference | `meta-models/muse-spark-open-1026` | Exact ID in supplied participant guide; live availability unverified, no silent replacement with a different slug |
| Existing Meta default | `muse-wonder-1.0` | Pre-event adapter retained; not Wonder Full and not new event work |

All model calls and business effects **in the submission demo path** pass the
existing Jev approval mechanism. This is not a claim that every legacy route in
the inherited application uses this new pipeline. Inference is draft-only; the
new handoff grants no arbitrary tool, shell, payment, invoice or messaging scope.
Approvals use the existing single-operator trust boundary, not new WebAuthn or
multi-tenant authorization. The local chain is unanchored and is not a zk proof.

## Judge entry point

Start with [the judge guide](docs/hackathon/JUDGES.md), then
[the demo runbook and timed script](docs/hackathon/DEMO.md).
An offline fixture walkthrough is reproducible without keys:

```sh
npm ci
npm run hackathon:demo -- --fixture both
```

The generated report is explicitly `evidenceMode: fixture`. Only after configuring
credentials and provider-side spending controls should the founder run interactive
`--live` mode, review exact hashes and assess the resulting live evidence. A
provider credit notification is not a hard dollar cap.

## Rules, sources and founder-owned steps

The founder supplied a participant-guide attachment on October 27, 2026. It is
context, not an independently authenticated copy of all binding rules. Confirm
latest eligibility, track, build period, team and submission requirements at:

- [Meta event page](https://dev.meta.ai/events/global-hackathon)
- [Cerebral Valley event details](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details)
- [Meta API quickstart](https://dev.meta.ai/docs/quickstart)
- [Baseten model API overview](https://docs.baseten.co/inference/model-apis/overview)
- [Baseten reasoning behavior](https://docs.baseten.co/inference/model-apis/reasoning)

The public repo and earlier stacked PR merges are already complete. The new
submission PR is #22; its final tested revision is reviewed separately. The founder must claim their own credits,
confirm model access and spending controls, record an honest ≤3-minute video,
list all actual contributors, confirm the permitted track and submit on Cerebral
Valley. The X post is a draft only. No judging score, prize, eligibility, compliance,
24/7 uptime, native-mobile capability, physical WebGPU execution or zkVM operation
is promised. No claim that the application is entirely Meta open source is made.
