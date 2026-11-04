/** Offline verifier: never imports records, executes tools or contacts a provider. */
import { readFileSync, readSync, statSync } from 'node:fs';
import { verifyEvidenceBundle, verifyEvidenceProof } from '../lib/metabos/evidence-bundle';
import { decryptEvidence } from '../lib/metabos/evidence-encryption';

async function main() {
  const args = process.argv.slice(2);
  if (![1, 3].includes(args.length) || (args.length === 3 && args[1] !== '--expected-root')) {
    throw new Error('Usage: npm run evidence:verify -- FILE [--expected-root SHA256]. Encrypted files read the password from stdin.');
  }
  const expectedRoot = args[2];
  if (expectedRoot !== undefined && !/^[a-f0-9]{64}$/.test(expectedRoot)) throw new Error('Expected root must be a lowercase SHA-256 digest');
  if (statSync(args[0]).size > 29 * 1024 * 1024) throw new Error('Evidence file exceeds verifier byte limit');
  let data = JSON.parse(readFileSync(args[0], 'utf8'));
  if (data?.format === 'metabos-encrypted-evidence-v1') {
    if (process.stdin.isTTY) throw new Error('Provide the export password through stdin, not command-line arguments');
    const bytes = Buffer.alloc(1027); let length = 0;
    try {
      while (length < bytes.length) { const n = readSync(0, bytes, length, bytes.length - length, null); if (!n) break; length += n; }
      if (length === bytes.length) throw new Error('Password input too large');
      data = JSON.parse(await decryptEvidence(data, bytes.subarray(0, length).toString('utf8').replace(/\r?\n$/, '')));
    } finally { bytes.fill(0); }
  }
  if (data?.format === 'metabos-inclusion-v1') {
    if (!expectedRoot) throw new Error('Inclusion verification requires --expected-root from a separately trusted copy');
    console.log(JSON.stringify(verifyEvidenceProof(data, expectedRoot)));
  } else console.log(JSON.stringify(verifyEvidenceBundle(data, expectedRoot)));
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Evidence verification failed'); process.exitCode = 1; });
