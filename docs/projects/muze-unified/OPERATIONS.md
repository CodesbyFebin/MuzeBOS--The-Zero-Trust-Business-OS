# Running MuZe continuously

The browser companion is a control surface. Continuous processing belongs to
`scripts/inference-worker.ts`, supervised on a persistent host, with the same
SQLite volume as the application. The current worker only executes approved
inference drafts. It does not invent tasks, approve its own outputs, or run
arbitrary operating-system tools.

1. Use Node 22, install dependencies with `npm ci`, and configure the application
   locally, including the operator password before permitting remote access.
2. Copy `.env.inference.example` to the ignored `.env.inference`; supply only the
   providers you actually use. Keep `MUZEBOS_META_DRY_RUN=1` during qualification.
3. On your own Docker host, use the existing packaging:

   docker compose -f compose.inference.yml up --build -d

   Docker was not available for deployment qualification here. Validate the
   image, filesystem permissions, credentials and host firewall before use.
4. Create a task from the MuZe brain panel. Review its exact payload/hash in
   Inference. Until approved it must stay awaiting approval, even with a running
   worker. Paid routes additionally require paid consent and configured limits.
5. Observe an actual server-worker heartbeat in the panel. "Enabled" is merely
   configuration; a heartbeat within 90 seconds is the displayed liveness signal.
6. Close the browser, check worker logs, and re-open the application to verify
   that the task record remains. Test process termination/restart and lease
   recovery before asserting unattended availability.
7. Keep the persistent business-data volume backed up using a consistent SQLite
   backup. Test restore in a separate environment. Never mount an unreviewed
   production archive over live data.

Without a configured provider, worker, supervisor and online host, 24/7
execution is not established. The panel makes that state visible rather than
showing an unconditional "always running" badge.
