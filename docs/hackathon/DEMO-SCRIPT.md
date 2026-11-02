# PR #22 video script

The maintained, timed three-minute script and live-run instructions are in
[DEMO.md](DEMO.md). This replaces the first revision's key-presence-triggered
runner. Set `META_MODEL_API_KEY` privately, opt into paid execution explicitly,
and review both exact hashes interactively. Never display a key on camera.
Record after a real run for submission; no live call is claimed by this PR yet.

## Gate 3 segment: overdue invoice (about 45 s, replaces the synthetic "fixed reminder" step)

1. Open `/workspace/money/overdue`. Show the Status panel. On a box with no key it
   reads "BLOCKED: no Meta model API key configured" and "drafts are FIXTURE
   templates". Say so on camera; do not call it live.
2. Expand "Sources and uncertainty" on an invoice. Point to the cited fields
   (number, createdAt, payment, reference, total, email) and to the derived due
   date and assumed-terms note.
3. Click **Draft reminder**. The label reads `FIXTURE — deterministic template`
   (or `LIVE — muse-spark-1.3, validated` only after a real, capped call).
4. **Send to Jev for approval**, then **Approve and send**. With no inbox
   connected, the run output is `{"sent":false,"reason":"No sending integration is connected"}`.
5. Open `/workspace/evidence` and show `overdue.reminder.proposed` /
   `overdue.reminder.not_sent` in the audit chain.
6. Optional: reconcile the invoice before approving to show "Payload changed
   since approval" and nothing sent.

Precondition: an invoice older than the payment terms. A fresh demo DB has
none, so either set terms to 0 days via the API (`{"action":"terms","days":0}`,
owner/manager), which makes every existing pending invoice overdue, or say on camera
that there is nothing to remind.
