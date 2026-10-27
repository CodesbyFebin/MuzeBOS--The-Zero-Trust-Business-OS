# Production dependency triage

Scan command: `npm audit --omit=dev` (also run with `--json`). Package manager: npm 11.21.1 on Node v20.19.2 (CI uses Node 22). Lockfile: `package-lock.json` (committed). Date: 2026-10-28 (IST).

## Before (branch base 41dc9c9)

12 findings: 1 critical, 7 high, 1 moderate, 3 low.

| Package (installed) | Severity | Path | Resolution |
|---|---|---|---|
| next 14.2.35 | critical | direct | upgraded to **15.5.28** |
| nodemailer 9.0.1 | high | direct | upgraded to **10.2.1** |
| axios 1.19.0 | high | @slack/web-api | resolved to 1.21.0 (`npm audit fix`) |
| follow-redirects 1.16.0 | high | axios | resolved to 1.16.2 |
| undici 7.30.0 | high | @miosa/sdk | resolved to 7.30.1 |
| postcss 8.4.31 | high | nested in next | `overrides.postcss = "$postcss"`, so next uses the root postcss (8.5.32) |
| source-map-js 1.2.1 | high | postcss | resolved to 1.2.2 |
| zod 3.25.76 | high | direct | **open, see below** |
| ip-address 10.5.0 | moderate | imapflow > socks | resolved to 10.7.5 |
| ai, @ai-sdk/gateway, @ai-sdk/provider-utils | low | direct | ai upgraded to 6.0.317 (same major version; 7.x was not adopted) |

### GHSA-2464-fhr4-w9xw (Next image optimizer RCE with SVG)
- Advisory: https://github.com/advisories/GHSA-2464-fhr4-w9xw. Affected versions: `>=10.0.0 <=15.5.27`. Patched in 15.5.28 and 16.4.1.
- Installed before: 14.2.35, which is affected. Installed now: 15.5.28, which is patched.
- Image-optimizer config: `next.config.mjs` has no `images` block. That means the default optimizer is on, `dangerouslyAllowSVG` is false and there are no `remotePatterns`. Six files import `next/image`. The defaults lower the exposure, but the version was still in the affected range, so we upgraded rather than rely on the config.

### Next 15 migration done in this PR
- The official codemod `@next/codemod@15 next-async-request-api` changed 65 files to async `params` / `searchParams`.
- The two synchronous `headers()` / `cookies()` readers use the documented `UnsafeUnwrapped*` cast.
- next.config keys moved out of `experimental` (`serverExternalPackages`, `outputFileTracingIncludes`). The instrumentation hook is now on by default.
- Tests that call pages or routes directly now pass Promise params and await async pages. No assertion was removed.

## After

1 finding: 1 high.

| Field | Value |
|---|---|
| Advisory | GHSA-mrhx-c7xc-m3w5: zod `<4.6.6`, high. A large array checked against an array schema with no length limit builds an unbounded issue list, which can cause an out-of-memory crash. |
| Installed | zod 3.25.76 |
| Fix | zod 4.6.6+, a major version with breaking API changes. 154 source files import zod. |
| Exposure | Every JSON API route parses request bodies with zod after the middleware auth gate. With no password set, the app is loopback-only (see `middleware.ts`). |
| Mitigation added | `middleware.ts` rejects `/api/*` bodies whose Content-Length is over 2 MB with a 413, before any parser runs. Upload routes are exempt because they enforce their own byte limits. Tested in `tests/release-gate2-body-limit.test.ts`. **Limit:** a chunked body without a Content-Length header is not capped by this check. |
| Owner | CodesbyFebin (repo owner) |
| Why it is still open | Moving to zod 4 means changing about 154 files the week before the deadline, and it has not been tested here. Planned next action: migrate to zod 4 on a separate branch and drop this entry once `npm audit --omit=dev` reports 0. |

Nothing is suppressed. There is no `audit-level` override and no ignore file, and the scan still exits 1 because of this finding.
