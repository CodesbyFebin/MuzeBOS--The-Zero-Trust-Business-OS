# MuZe V6 judge walkthrough

Use a fresh local demo workspace for recordings. The evidence download contains the workspace audit history.

1. Follow the MuzeBOS README, run `PORT=3000 npm run dev`, and open `/workspace/builder/demo` as the owner.
2. Create a workspace and insert the labeled fixture lead.
3. Generate the template reply, review or edit it, and propose it. Show the pending status and payload SHA-256.
4. Reject the proposal to demonstrate the human gate. Repeat with a fresh proposal and choose **Approve without dispatch** to show the positive decision.
5. Download the evidence bundle and run `npm run evidence:verify -- ./metabos-evidence-bundle.json`.
6. To demonstrate tamper detection, edit a copy of the exported record and run the verifier again. Use `--expected-root` with a separately trusted root when demonstrating provenance.

The BroCODE presentation at `/muze/` has the timed protocol map and submission desk. The token numbers are illustrative. The supplied repository atlas contains synthetic entries. The protocol map includes roadmap items such as ZkWorld, a zkVM receipt, and the MetaPenAudit release gate. Meta integrations require separate configuration and provider approval.
