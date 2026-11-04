# Private evidence and ZK source review — 2026-11-03

## Scope and source decisions

Requested sources were cloned as shallow sparse checkouts outside the application. Revisions, reviewed paths and checksums are recorded in [sources.json](sources.json). No upstream build/install scripts were run. This is a targeted review, not a full security audit of these large repositories.

| Source | Useful finding | Integration decision |
| --- | --- | --- |
| Ente | Encrypt before data is uploaded/shared; keep export secrets on the client | Original browser-side encrypted export using platform Web Crypto. No Ente source, dependencies, branding or AGPL implementation copied. The application database is still server-readable; this is not Ente-compatible E2EE storage. |
| Union | Explicit proof specifications, commitment checks and failure on mismatched roots | Strict portable evidence bundle and offline verification against a separately retained root. No Union chain, wallet, ICS23 verifier or token bridge installed. |
| Tachyon | Binary Merkle paths and native prover/runtime separation | Original bounded SHA-256 inclusion format for business events. No native/GPU prover or vendor code installed. Root MIT does not cover every subtree: reviewed Merkle headers name LICENSE.lambdaworks. |
| GitHub zk topic | Discovery includes cryptography and unrelated uses of zk | Not treated as a dependency list or permission to copy every project. |

No source from these repositories is incorporated into the MIT application. The implementation uses Node SHA-256 and platform Web Crypto rather than importing custom cryptographic arithmetic, native runtimes or incompatible proof formats. No external verifier URL or shell runner is introduced.

## Delivered behavior

- Evidence explorer offers a full-chain encrypted download, unencrypted verification bundle, and per-event inclusion proof downloads.
- Exports require the existing operator gate, workspace membership and `finance.read`. Invalid chains and exports over 50,000 events / 16 MiB of record JSON are refused. New formats always use the full chain, not the visible filter subset.
- Passwords stay in browser memory and are never sent in application requests. Encryption uses PBKDF2-HMAC-SHA256 (600,000 iterations), random 16-byte salt, AES-256-GCM, random 12-byte IV, 128-bit tag and fixed associated data. Export passwords must contain 16–1024 UTF-8 bytes. There is no password recovery. Encrypted envelope parameters are fixed and strictly checked before derivation.
- No encryption password, ciphertext or export bundle is written into the business database. Downloads are generated locally. The server still holds plaintext records and serves them to the authorized browser; this change does not encrypt the live SQLite database.
- The standalone offline CLI verifies plain or encrypted bundles and individual inclusion proofs. It prints verification metadata, not business rows or passwords. It never restores data or executes imported content.

## Protocol v1

Event leaves use SHA-256 of `0x00 || UTF8(JSON.stringify([seq, action, target, detail, createdAt, previousHash, hash]))`. Parent nodes use SHA-256 of `0x01 || left_digest_bytes || right_digest_bytes`; duplicate an odd final node. The empty tree value is SHA-256 of `0x02`. The exported commitment is SHA-256 of `0x03 || uint64_be(record_count) || tree_root_bytes`. Binding the count prevents duplicate-odd proofs from changing a three-leaf tree into an alleged four-leaf tree.

Bundles include the original ordered audit records, count, head hash, root and explicit algorithm identifiers. Offline verification also recomputes the existing audit hash chain. Its legacy event digest covers the JSON object in this order: action, target, detail, createdAt, previousHash. Sequence numbers are additionally bound by the export tree. Proofs carry one disclosed event, its index, the total count and sibling digests; exact path length and odd-node duplication are checked. Proofs use this format only: they are not ICS23, Tendermint, Ethereum, SNARK or Tachyon proof encodings.

## Use

Open Evidence explorer → Private evidence exports. Enter a strong unique export password and download the encrypted full chain. Keep its password and displayed root separately. Each event's Proof link exports a small inclusion artifact; it reveals that event's content.

```sh
npm run evidence:verify -- metabos-evidence-bundle.json --expected-root SAVED_SHA256_ROOT
npm run evidence:verify -- metabos-evidence-proof.json --expected-root SAVED_SHA256_ROOT
```

For encrypted files, the verifier reads the password from standard input and refuses interactive terminal input. Use a private password-manager pipe or a shell's non-echoing password prompt; do not put the password in command-line arguments or commit it. No decrypted plaintext file is emitted. Omit `--expected-root` for a full bundle only if you intend to check internal consistency without asserting authenticity.

## Trust limits

This is authenticated encrypted export and hash-based inclusion verification, **not zero-knowledge proving, signing, external anchoring, hardware attestation or independent timestamps**. A proof reveals its selected record and neighbour commitments. A root supplied by the same untrusted file is not a trust anchor. A privileged operator can rewrite SQLite and generate a new consistent bundle. A root retained independently can detect changes or tail truncation relative to that retained checkpoint; it does not establish that events were true or complete before that checkpoint. Password security depends on password strength and the browser/device. These new primitives have not had an independent cryptographic audit.

## Validation

- Full suite: 437 test files passed; 5,535 tests passed and 9 skipped. Includes 32 new evidence-domain and permission/API tests.
- TypeScript check and clean production build passed. Build used the existing NEXT_DIST_DIR option to isolate its output; no machine-specific type config is committed.
- Production HTTP smoke passed: real fresh workspace/session, anonymous export refusal, real SQLite audit events, authorized full-chain and per-event proof endpoints, export UI in server-rendered HTML, platform Web Crypto roundtrip. This is HTTP/HTML verification, not physical browser interaction.
- A separate offline CLI process verified encrypted and inclusion artifacts without printing business rows or passwords.
- Node 22 qualified the existing native SQLite dependency. This restricted host lacks Node's RSS interface, so checks used a scratch-only V8 heap/RSS fallback. A 2 GiB build heap exhausted; the clean 4 GiB build passed. No fallback was added to application startup.
- Chromium was unavailable, so browser interaction/download behavior was not visually qualified. Native Ente, Union and Tachyon runtimes were not built or deployed; no external account or production business data was used.

See [verification.json](verification.json) for the machine-readable results and log hashes.

### Existing-main qualification repairs

Five failures reproduced on unchanged main: stale 248-page/198-available registry assertions, a stale API reference, a shell test expecting the superseded color comment, and a test depending on `/workspace/claw-local`. The assertions now match the existing 249-page/199-available registry and neutral shell while retaining geometry and rendering checks. The Claw argv test uses a temporary executable fixture with an injected exec function; it still tests argument isolation without invoking a shell.

Two existing network-boundary integration fixtures invoked 2,000 bootstrap resamples. Those tests now run the real evaluator with B=10 for every predictor/window, retaining their network/retention assertions. Dedicated statistics tests and the production default remain unchanged. The first GitHub CI run exposed three existing full-fixture test/setup timeouts. Global test/hook budgets are now bounded at 90/60 seconds for shared runners; no assertions were removed, no tests skipped and no retries enabled. API reference and static documentation exports were regenerated. CI's unsupported Vitest 4 `--minWorkers` option was removed and its heap budget set to 4 GiB. No unrelated runtime/UI behavior was changed.
