# Repository audit and readiness rubric

Branch `chore/repo-hygiene`, stacked on `feat/muze-home` (`ec80ea7`, PR #82). Checked Nov 3 2026, 6:30 to 7:00 AM IST, on a fresh clone. Local checks ran on Node 20.19.2 (the only Node on the audit machine); the repo pins Node 22.

## 1. Tracked junk

| Check | Evidence | Result |
|---|---|---|
| `.next`, `out`, `dist`, coverage, `test-results`, `playwright-report` | `git ls-files` matched none | Clean |
| `*.db`, `*.sqlite`, zips, tarballs, videos | none tracked | Clean |
| Logs | 1: `tests/fixtures/brand-deals/bdpilot.log`, a synthetic test fixture (`*.example` addresses) | Kept, allow-listed in `.gitignore` |
| Images | 5 brand/icon PNGs in `public/`, `docs/design/logo-reference.png` (referenced by `components/metabos/BrandMark.tsx`) | Kept, in use |
| Largest files | `config/muse-catalog.json` 4.1 MB, `app/globals.css` 0.9 MB, `lib/metabos/b3/swarms/agents.json` 0.7 MB. All are imported by the app | Kept; see recommendations |
| Stale evidence dumps | Removed: `docs/verification/results.json` (pre-kickoff Oct 25 run, Next 14 era), `docs/VERIFICATION-REPORT-MASTER-PROMPT.md` (Oct 28 "NOT READY" report), `docs/SLICE8-PLAN.md`, `docs/SLICE9-AUDIT.md`. None were referenced by code or docs. 20,870 bytes total; copies kept off-repo | Removed |
| Stray root file | `MOCK-AUDIT.md` (5-line section missing from `docs/MOCK-AUDIT.md`) was merged into `docs/MOCK-AUDIT.md` and removed from the root | Fixed |
| Process notes | `docs/MERGE.md`, `docs/PR46-SHELL-RESTORATION.md`, `docs/VERIFICATION-REPORT.md` moved to `docs/archive/` with links updated | Moved |

`.gitignore` now also covers build dirs, test reports, logs, databases, zips and split zip parts, tarballs, `.vercel/`, `.netlify/` and `/tmp/`. `git ls-files -ci --exclude-standard` returns nothing, so no tracked file is newly ignored.

## 2. Secrets (gitleaks 8, full history, `--redact`)

7 findings, all triaged by hand; no values are reproduced here.

| Rule | File | Assessment |
|---|---|---|
| private-key | `vendor/muse-skills/.../secret-handling/SKILL.md` | Documentation of the PEM header pattern, no key |
| generic-api-key | `.env.example` line 117 (commit `6a69c59`) | Line has an empty value; multi-line false positive |
| generic-api-key | `tests/creds.test.ts`, `tests/keys.test.ts`, `tests/lab-setup-keys.test.ts`, `tests/lab-v2-sheet-models.test.ts`, `tests/muzebos-modules-b.test.ts` | Test fixture strings |

No real credential was found. Recommendation: add a `.gitleaks.toml` allow-list for these paths and a gitleaks step in CI. No history was rewritten.

## 3. Files and practices

| Item | Finding |
|---|---|
| LICENSE | MIT, holder "FounderOS" (the upstream this repo forked). **Recommendation:** keep that line, and if the owner wants, add a `Copyright (c) 2026 CodesbyFebin` line for new work. Not changed here because it is a legal choice |
| THIRD_PARTY | `THIRD_PARTY.md` (125 lines) and `THIRD_PARTY_NOTICES.md` present |
| Pre-kickoff label | `HACKATHON.md` labels commit ranges before Oct 26 2026 16:00 UTC (9:30 PM IST); README now links it from the first screen. Its third row still says "`feat/hackathon-submission` (this PR)"; recommend updating to the current branch names |
| CONTRIBUTING, SECURITY | Present |
| CODE_OF_CONDUCT | **Added** (Contributor Covenant 2.1 reference) |
| Issue / PR templates | Bug template and PR template existed; **added** feature request template and `config.yml` routing security reports to private advisories |
| CI | `.github/workflows/ci.yml` on Node 22. **Failing on every recent run** (`gh run list`): `npm test -- --minWorkers=1` is rejected by Vitest 4.1.12 (`CACError: Unknown option --minWorkers`). MeTaPen holds the fix on `ci/node-fix`; not duplicated here |
| Node version | `.node-version` 22 and CI 22; `package.json` had no `engines`. **Added** `"engines": {"node": ">=22.0.0"}` (and in the lockfile root) because `lab-v2-g` uses `fs.globSync` (Node 22+). README now says Node 22 |
| Lockfile | `package-lock.json` present; `npm ci` succeeds |
| Lint | No ESLint config; `next build` lint step has nothing to check. Recommendation: add `next lint` config |
| `.env.example` | 120 env vars read via `process.env.X` in app code; 24 app-facing ones were missing and are **now documented** (Meta webhook secret/verify token, approval signing secret, passkey origin, storage paths, Ollama/OpenRouter, Paperclip). `MUZEBOS_META_DRY_RUN=1` added explicitly. The rest are test/script-only (e.g. `TEST_BASE_URL`, `CDP_PORT`) or platform (`VERCEL`, `NODE_ENV`). Vars read through an injected `env` object were not fully enumerated |
| README | Judges-first block added: what it is, pre-existing label, a quick start, real-vs-keys table, licence. Fixed stale test badge (it claimed numbers from an older branch). Existing architecture diagram kept |
| Docs sprawl | 34 top-level docs; **added** `docs/README.md` index grouped by purpose |
| `archive/`, `vendor/` | `archive/` (18 files, old prototypes with READMEs) and `vendor/` (655 files: skill packs and reference documents) are read at runtime by catalogue code. Left in place; recommendation: confirm `archive/` is unused by the build and then drop it |
| Dependencies | `npm audit`: 0 vulnerabilities (0 low, moderate, high, critical) |

## 4. Check results (this branch, Node 20.19.2)

| Check | Result |
|---|---|
| `npm ci` | pass |
| `tsc --noEmit` | pass (needs `--max-old-space-size=6144` on a busy 16 GB box; the default heap was OOM-killed) |
| `next build` | pass, compiled with warnings |
| `vitest run` | 5,521 passed, 9 skipped, 2 failed; 437 of 440 files passed. Failing: `lab-ledger-retention`, `lab-v2-g-copy` (known, also on `main`), and `lab-v2-g` (needs Node 22 `fs.globSync`; expected on Node 20) |
| `e2e-home.mjs` | pass, 0 axe violations |
| `e2e-canvas.mjs` | pass, 0 axe violations |
| `e2e-board.mjs` | **fail**: one of the OpenRouter/Stripe/Slack/Notion tiles read "down" where the script expects "not configured" on a fresh store. Not investigated; may depend on the audit machine's environment |
| `e2e-bos.mjs` | incomplete (run interrupted); no result claimed |

## 5. Readiness rubric

| # | Criterion | Result | Evidence / what blocks it |
|---|---|---|---|
| 1 | No tracked build output, DBs, logs or dumps | PASS | Section 1 |
| 2 | No secrets in history | PASS | gitleaks: 7 findings, all fixtures/false positives |
| 3 | Licence and third-party attribution | PASS | MIT + THIRD_PARTY files (holder note above) |
| 4 | Community files and templates | PASS | CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, issue/PR templates |
| 5 | README accurate, judges-first, pre-kickoff label | PASS | README top block, HACKATHON.md |
| 6 | `.env.example` complete, test mode on by default | PASS | Section 3 |
| 7 | Typecheck and build pass | PASS | Section 4 |
| 8 | Full test suite green | FAIL | 2 known lab failures + Node 22-only file |
| 9 | CI green | FAIL | `--minWorkers` invalid; fix pending on `ci/node-fix` |
| 10 | All e2e scripts pass | FAIL | board failed, bos not completed |
| 11 | Lint configured | FAIL | no ESLint config |
| 12 | Live demo proof | FAIL (owner-only) | Needs a model key, Meta test-app tokens with DRY_RUN off for a live send, and the demo video |

**Score: 7 of 12 criteria pass.** Not rounded up.
