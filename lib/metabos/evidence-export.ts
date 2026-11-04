/**
 * Portable export of the mb_audit hash chain plus an optional independent re-check by the
 * Rust `agenet-verify` CLI (tools/agenet-verify). Both are hash-commitment checks, not ZK.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Audit } from './store';

export const EXPORT_FORMAT = 'metabos-evidence-chain/v1';
export type ChainExport = {
  format: typeof EXPORT_FORMAT; exportedAt: string; genesis: 'GENESIS';
  hashing: string; method: 'hash-commitment, not ZK'; headHash: string | null; count: number;
  entries: Pick<Audit, 'seq' | 'action' | 'target' | 'detail' | 'createdAt' | 'previousHash' | 'hash'>[];
};
export function exportChain(events: Audit[], exportedAt = new Date().toISOString()): ChainExport {
  return {
    format: EXPORT_FORMAT, exportedAt, genesis: 'GENESIS',
    hashing: 'hash = sha256_hex(JSON.stringify({action,target,detail,createdAt,previousHash})); first previousHash = "GENESIS"',
    method: 'hash-commitment, not ZK', headHash: events.at(-1)?.hash ?? null, count: events.length,
    entries: events.map(({ seq, action, target, detail, createdAt, previousHash, hash }) => ({ seq, action, target, detail, createdAt, previousHash, hash })),
  };
}

export type Attestation =
  | { state: 'attested'; verifier: 'agenet-verify'; method: 'hash-commitment, not ZK'; count: number; headHash: string | null; checkedAt: string }
  | { state: 'not_attested'; reason: string }
  | { state: 'failed'; verifier: 'agenet-verify'; firstBrokenSeq: number | null; reason: string; checkedAt: string };

/** Path to a built verifier binary, if one exists. Never builds anything at request time. */
export function verifierBinary(env: Record<string, string | undefined> = process.env): string | null {
  const candidates = [env.MUZEBOS_AGENET_VERIFY_BIN, path.resolve(process.cwd(), 'tools/agenet-verify/target/release/agenet-verify'), path.resolve(process.cwd(), 'tools/agenet-verify/target/debug/agenet-verify')];
  for (const c of candidates) if (c && fs.existsSync(c)) return c;
  return null;
}

/** Run the Rust verifier on an export. "attested" only when the binary ran and reported pass. */
export function attestChain(x: ChainExport, env: Record<string, string | undefined> = process.env): Attestation {
  if (x.count === 0) return { state: 'not_attested', reason: 'No evidence rows to attest.' };
  const bin = verifierBinary(env);
  if (!bin) return { state: 'not_attested', reason: 'agenet-verify binary not built (cargo build --release in tools/agenet-verify).' };
  const r = spawnSync(bin, ['-'], { input: JSON.stringify(x), encoding: 'utf8', timeout: 10_000, maxBuffer: 64 * 1024 * 1024 });
  const checkedAt = new Date().toISOString();
  if (r.error || (r.status !== 0 && r.status !== 1)) return { state: 'not_attested', reason: 'Verifier did not run cleanly.' };
  try {
    const rep = JSON.parse(r.stdout) as { pass: boolean; count: number; firstBrokenSeq: number | null; headHash: string | null };
    if (r.status === 0 && rep.pass === true && rep.count === x.count && rep.headHash === x.headHash)
      return { state: 'attested', verifier: 'agenet-verify', method: 'hash-commitment, not ZK', count: rep.count, headHash: rep.headHash, checkedAt };
    return { state: 'failed', verifier: 'agenet-verify', firstBrokenSeq: rep.firstBrokenSeq ?? null, reason: 'Independent recomputation did not match the stored chain.', checkedAt };
  } catch { return { state: 'not_attested', reason: 'Verifier output unreadable.' }; }
}
