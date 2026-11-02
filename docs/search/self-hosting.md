# How to self-host MeTaBos

MeTaBos runs as a Node.js application with local SQLite storage. Use Node.js 22,
install the locked dependencies, and start the private local workspace. Hosting
and inference hardware are supplied by the operator.

```sh
npm ci
npm run dev
```

Open `http://localhost:4100`. The startup wrapper binds to loopback until an
operator password is configured under Settings → Security. Keep the instance
private. For a production build use `npm run build` followed by `npm start`.
A public website is not the business workspace: never expose a fresh setup page
or private records to crawlers.

## What persists?

`MUZEBOS_DB` selects the commerce database; `GLADOS_DB` selects inherited workspace
storage. Preserve the configured paths, local settings and secrets. Back up
SQLite with its backup API or stop all writers before copying a database; a
live WAL database cannot safely be backed up by copying its main file alone.
Secrets belong in ignored environment files, not repository commits.

## Can it run on mobile?

The interface is responsive web software. Remote/mobile access needs a private,
authenticated HTTPS deployment and the correct origin configuration. Browser
model inference separately requires actual WebGPU support and an active browser.
A responsive layout is not a native Android/iOS release or an offline-sync guarantee.

## What is not included?

The preview has a single-operator authentication model. Production TLS,
monitoring, multi-user isolation, independent security review and host recovery
must be qualified before a real deployment. No free cloud or 24-hour uptime is
promised. Prepared [deployment instructions](../METABOS-OPERATIONS.md) and
[inference hosting](../METABOS-INFERENCE.md) list their separate limits.

Next: [invoice approvals](invoice-approvals.md), [security and data](security-and-data.md).
Return to the [documentation hub](README.md).
