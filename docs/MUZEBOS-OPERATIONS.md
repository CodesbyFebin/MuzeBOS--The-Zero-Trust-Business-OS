# Local deployment and recovery

Use Node 22 LTS. Install with `npm ci`, check types/tests, then `npm run build`.
Run through `npm start`, which preserves the inherited bind safety check.

The extension's native SQLite dependency is tested on Node 22. Do not assume
Node 24 native-addon compatibility from the upstream `.node-version` history.

## Private deployment

1. Start on localhost; set an operator password in Settings → Security.
2. Set `GLADOS_HOST` to the intended private interface and restart.
3. Terminate TLS on a trusted reverse proxy/private access layer.
4. Configure `MUZEBOS_ORIGIN` to exactly match the browser origin.
5. Preserve `.env.local` and `data/` on persistent storage.
6. Do not publicly expose inherited execution tools without a separate review.

Passkeys, multi-user authorization, external settlement callbacks, production
monitoring, and hardened Docker deployment remain release gates.

## Backup

Use SQLite's online backup API for a live commerce database. Copying only a
live `.db` while WAL writes are active is unsafe. Example:

```bash
node scripts/business-backup.mjs /absolute/path/to/backup.sqlite
```

Store the backup away from the source volume with restricted access. It contains
customer, invoice and audit data. Back up the inherited application data stores
and credentials separately under their own retention policies.

## Restore

1. Stop the application and every worker using the target database.
2. Preserve the existing DB and its `-wal`/`-shm` sidecars as a rollback set.
3. Restore the backup to a new file; set `MUZEBOS_DB` to that absolute path.
4. Start the application privately.
5. Check invoice counts, stock, and audit chain status before reopening access.

The automated commerce tests perform online backup and verify a restored store
matches the source snapshot. A real staging disaster-recovery drill has not
been executed.
