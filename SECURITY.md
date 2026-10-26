# Security policy

MuzeBOS is a single-operator preview. No production security certification or
independent assessment is claimed. Read [security/data boundaries](docs/search/security-and-data.md)
and [the threat model](docs/MUZEBOS-ARCHITECTURE.md) before deployment.

## Report a vulnerability

Use the repository's private vulnerability reporting feature if enabled:
https://github.com/CodesbyFebin/MuzeBOS--The-Zero-Trust-Business-OS/security/advisories/new.
If that feature is unavailable, contact CodesbyFebin through the contact details
on https://codesbyfebin.github.io/ to arrange a private channel. Do not post
credentials, personal records or a working exploit publicly. No guaranteed
response SLA, bounty or private-reporting feature availability is promised.

Include the affected revision, a minimal sanitized reproduction, expected versus
actual authorization behavior and impact. Use disposable test records. Never
probe other people's deployments without authorization.

## Deployment limits

Keep the app private, initialize the operator before remote access, use TLS,
protect environment files and qualify backups/recovery. `noindex` is not access
control. Local audit hashes are not external attestations or zk proofs. Cloud
inference and integrations have provider-specific retention and permission rules.
Current dependency review and independent assessment remain release gates.
