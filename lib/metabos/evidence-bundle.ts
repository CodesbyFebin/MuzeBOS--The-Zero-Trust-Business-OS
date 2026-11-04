/** Original portable SHA-256 evidence format. Not ICS23, a SNARK, or a signature. */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Audit } from './store';

export const MAX_EVIDENCE_RECORDS = 50_000;
export const MAX_EVIDENCE_BYTES = 16 * 1024 * 1024;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const record = z.object({ seq: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), action: z.string().max(1000),
  target: z.string().max(10000), detail: z.string().max(100000), createdAt: z.string().max(100),
  previousHash: z.union([hash, z.literal('GENESIS')]), hash }).strict();
const algorithms = { tree: 'sha256-domain-separated-duplicate-odd-v1', chain: 'metabos-json-sha256-v1' } as const;
const sha = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex');
// Fixed record order is part of this wire format. The legacy chain's JSON order is different.
function recordBytes(r: Audit) { return JSON.stringify([r.seq, r.action, r.target, r.detail, r.createdAt, r.previousHash, r.hash]); }
function leaf(r: Audit) { return sha(Buffer.concat([Buffer.from([0]), Buffer.from(recordBytes(r))])); }
function parent(a: string, b: string) { return sha(Buffer.concat([Buffer.from([1]), Buffer.from(a, 'hex'), Buffer.from(b, 'hex')])); }
const EMPTY_ROOT = sha(Buffer.from([2]));
function commitment(treeRoot: string, count: number) {
  const size = Buffer.alloc(8); size.writeBigUInt64BE(BigInt(count));
  return sha(Buffer.concat([Buffer.from([3]), size, Buffer.from(treeRoot, 'hex')]));
}
function levels(rows: Audit[]) {
  const result: string[][] = [rows.map(leaf)];
  while (result.at(-1)!.length > 1) {
    const previous = result.at(-1)!, next: string[] = [];
    for (let i = 0; i < previous.length; i += 2) next.push(parent(previous[i], previous[i + 1] ?? previous[i]));
    result.push(next);
  }
  return result;
}
function checkedRows(input: unknown): Audit[] {
  const rows = z.array(record).max(MAX_EVIDENCE_RECORDS).parse(input);
  if (Buffer.byteLength(JSON.stringify(rows)) > MAX_EVIDENCE_BYTES) throw new Error('Evidence exceeds export byte limit');
  let previous = 'GENESIS', seq = 0;
  for (const r of rows) {
    const body = { action: r.action, target: r.target, detail: r.detail, createdAt: r.createdAt, previousHash: r.previousHash };
    if (r.seq <= seq || r.previousHash !== previous || sha(JSON.stringify(body)) !== r.hash) throw new Error('Evidence chain is invalid');
    previous = r.hash; seq = r.seq;
  }
  return rows;
}
export function evidenceBundle(input: unknown) {
  const records = checkedRows(input), tree = levels(records);
  return { format: 'metabos-evidence-v1' as const, algorithms, recordCount: records.length,
    rootHash: commitment(tree.at(-1)![0] ?? EMPTY_ROOT, records.length), headHash: records.at(-1)?.hash ?? null, records };
}
const bundleSchema = z.object({ format: z.literal('metabos-evidence-v1'),
  algorithms: z.object({ tree: z.literal(algorithms.tree), chain: z.literal(algorithms.chain) }).strict(),
  recordCount: z.number().int().min(0).max(MAX_EVIDENCE_RECORDS), rootHash: hash, headHash: hash.nullable(),
  records: z.array(record).max(MAX_EVIDENCE_RECORDS) }).strict();
/** expectedRoot must come from a separately retained trusted copy, never the same supplied file. */
export function verifyEvidenceBundle(input: unknown, expectedRoot?: string) {
  const value = bundleSchema.parse(input), rebuilt = evidenceBundle(value.records);
  if (expectedRoot !== undefined) hash.parse(expectedRoot);
  if (value.recordCount !== rebuilt.recordCount || value.rootHash !== rebuilt.rootHash || value.headHash !== rebuilt.headHash ||
      (expectedRoot !== undefined && value.rootHash !== expectedRoot)) throw new Error('Evidence commitment mismatch');
  return { valid: true as const, rootHash: value.rootHash, recordCount: value.recordCount,
    matchedExternalRoot: expectedRoot !== undefined, signatureVerified: false as const, zeroKnowledge: false as const };
}
export function evidenceProof(input: unknown, seq: number) {
  const records = checkedRows(input), index = records.findIndex(r => r.seq === seq);
  if (index < 0) throw new Error('Evidence event not found');
  const tree = levels(records), siblings: string[] = []; let cursor = index;
  for (let depth = 0; depth < tree.length - 1; depth++) {
    const layer = tree[depth]; siblings.push(layer[cursor ^ 1] ?? layer[cursor]); cursor = Math.floor(cursor / 2);
  }
  return { format: 'metabos-inclusion-v1' as const, tree: algorithms.tree, record: records[index], index,
    recordCount: records.length, siblings, rootHash: commitment(tree.at(-1)![0], records.length) };
}
const proofSchema = z.object({ format: z.literal('metabos-inclusion-v1'), tree: z.literal(algorithms.tree), record,
  index: z.number().int().min(0), recordCount: z.number().int().min(1).max(MAX_EVIDENCE_RECORDS),
  siblings: z.array(hash).max(16), rootHash: hash }).strict();
/** Inclusion reveals the selected event and its neighbour commitments; it is not zero-knowledge. */
export function verifyEvidenceProof(input: unknown, expectedRoot: string) {
  const proof = proofSchema.parse(input); hash.parse(expectedRoot);
  if (proof.index >= proof.recordCount) throw new Error('Invalid proof position');
  let width = proof.recordCount, cursor = proof.index, value = leaf(proof.record), depth = 0;
  while (width > 1) {
    const sibling = proof.siblings[depth++]; if (!sibling) throw new Error('Incomplete proof');
    if (!(cursor & 1) && cursor + 1 === width && sibling !== value) throw new Error('Invalid duplicate sibling');
    value = cursor & 1 ? parent(sibling, value) : parent(value, sibling);
    cursor = Math.floor(cursor / 2); width = Math.ceil(width / 2);
  }
  const root = commitment(value, proof.recordCount);
  if (depth !== proof.siblings.length || root !== proof.rootHash || root !== expectedRoot) throw new Error('Inclusion proof mismatch');
  return { valid: true as const, seq: proof.record.seq, rootHash: root, zeroKnowledge: false as const };
}
