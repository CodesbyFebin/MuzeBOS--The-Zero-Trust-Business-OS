import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { BusinessStore } from '@/lib/metabos/store';
import { evidenceBundle, evidenceProof, verifyEvidenceBundle, verifyEvidenceProof } from '@/lib/metabos/evidence-bundle';
import { encryptEvidence, decryptEvidence } from '@/lib/metabos/evidence-encryption';

const stores: BusinessStore[] = [], dirs: string[] = [];
function records(count: number) { const store = new BusinessStore(':memory:'); stores.push(store); for (let i = 0; i < count; i++) store.reminder({ title: 'Private reminder ' + i }); return store.evidence(); }
const password = 'local export fixture password';
afterEach(() => { stores.splice(0).forEach(s => s.close()); dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })); });
describe('Portable audit commitments', () => {
  it.each([0, 1, 2, 3, 5, 16])('verifies real SQLite evidence and every leaf of a %i-event tree', count => {
    const rows = records(count), bundle = evidenceBundle(rows);
    expect(verifyEvidenceBundle(bundle)).toMatchObject({ valid: true, matchedExternalRoot: false, signatureVerified: false, zeroKnowledge: false });
    expect(verifyEvidenceBundle(bundle, bundle.rootHash).matchedExternalRoot).toBe(true);
    for (const row of rows) expect(verifyEvidenceProof(evidenceProof(rows, row.seq), bundle.rootHash)).toMatchObject({ valid: true, seq: row.seq, zeroKnowledge: false });
  });
  it('matches an independently calculated empty-tree commitment', () => {
    // SHA256(0x03 || uint64_be(0) || SHA256(0x02)); Node's public primitives, not the tree helper.
    const hash = createHash('sha256').update(Buffer.from([2])).digest();
    const expected = createHash('sha256').update(Buffer.concat([Buffer.from([3]), Buffer.alloc(8), hash])).digest('hex');
    expect(evidenceBundle([]).rootHash).toBe(expected);
  });
  it('rejects changed, reordered, missing and malformed chain events', () => {
    const rows = records(3);
    for (const changed of [[{ ...rows[0], detail: 'changed' }, ...rows.slice(1)], [...rows].reverse(), rows.slice(1), [rows[0], rows[2]], [{ ...rows[0], seq: -1 }]]) {
      expect(() => evidenceBundle(changed)).toThrow();
    }
  });
  it('detects a valid prefix truncated from a separately retained root', () => {
    const rows = records(3), original = evidenceBundle(rows), truncated = evidenceBundle(rows.slice(0, 2));
    expect(verifyEvidenceBundle(truncated).valid).toBe(true);
    expect(() => verifyEvidenceBundle(truncated, original.rootHash)).toThrow('commitment');
  });
  it.each(['rootHash', 'headHash', 'recordCount'] as const)('rejects changed bundle %s', field => {
    const bundle = evidenceBundle(records(3));
    expect(() => verifyEvidenceBundle({ ...bundle, [field]: field === 'recordCount' ? 4 : '0'.repeat(64) })).toThrow();
  });
  it('requires proof position, exact depth, record content and external root', () => {
    const rows = records(3), proof = evidenceProof(rows, rows[1].seq);
    for (const changed of [{ ...proof, index: 0 }, { ...proof, siblings: [] }, { ...proof, siblings: [...proof.siblings, '0'.repeat(64)] }, { ...proof, record: { ...proof.record, detail: 'changed' } }]) {
      expect(() => verifyEvidenceProof(changed, proof.rootHash)).toThrow();
    }
    expect(() => verifyEvidenceProof(proof, '0'.repeat(64))).toThrow();
    expect(() => evidenceProof(rows, 999)).toThrow('not found');
  });
  it('binds leaf count, preventing duplicate-odd tree ambiguity', () => {
    const rows = records(3), proof = evidenceProof(rows, rows[2].seq);
    expect(() => verifyEvidenceProof({ ...proof, recordCount: 4 }, proof.rootHash)).toThrow();
    expect(() => verifyEvidenceProof({ ...proof, recordCount: 4, index: 3 }, proof.rootHash)).toThrow();
  });
  it('rejects oversized sets and unknown fields', () => {
    const row = records(1)[0];
    expect(() => evidenceBundle(Array(50001).fill(row))).toThrow();
    expect(() => verifyEvidenceBundle({ ...evidenceBundle([row]), zkVerified: true })).toThrow();
  });
});
describe('Local authenticated export encryption', () => {
  it('roundtrips a bundle with independently random salt and nonce for each export', async () => {
    const data = JSON.stringify(evidenceBundle(records(3))), a = await encryptEvidence(data, password), b = await encryptEvidence(data, password);
    expect(a.salt).not.toBe(b.salt); expect(a.iv).not.toBe(b.iv); expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(JSON.stringify(a)).not.toContain('Private reminder'); expect(JSON.stringify(a)).not.toContain(password);
    expect(await decryptEvidence(a, password)).toBe(data);
  });
  it('fails closed for wrong passwords and altered ciphertext/salt/nonce', async () => {
    const data = await encryptEvidence('private data', password);
    await expect(decryptEvidence(data, 'different fixture password')).rejects.toThrow('Wrong password');
    for (const field of ['ciphertext', 'salt', 'iv'] as const) {
      const bytes = Buffer.from(data[field], 'base64'); bytes[0] ^= 1;
      await expect(decryptEvidence({ ...data, [field]: bytes.toString('base64') }, password)).rejects.toThrow('damaged');
    }
  });
  it('rejects attacker-selected KDF parameters, unknown fields and bad encoding before key derivation', async () => {
    const data = await encryptEvidence('x', password);
    for (const changed of [{ ...data, suite: 'slow-unbounded-kdf' }, { ...data, iterations: 1 }, { ...data, salt: 'AA==' }, { ...data, ciphertext: '!' }, { ...data, iv: 'A'.repeat(100) }]) {
      await expect(decryptEvidence(changed, password)).rejects.toThrow();
    }
    await expect(encryptEvidence('x', 'short')).rejects.toThrow('16');
    await expect(encryptEvidence('x', 'x'.repeat(1025))).rejects.toThrow('1024');
  });
  it('verifies encrypted and inclusion artifacts in a separate offline CLI process without printing plaintext', async () => {
    const rows = records(3), bundle = evidenceBundle(rows), encrypted = await encryptEvidence(JSON.stringify(bundle), password);
    const dir = mkdtempSync(path.join(tmpdir(), 'private-evidence-')); dirs.push(dir);
    const file = path.join(dir, 'encrypted.json'), proof = path.join(dir, 'proof.json');
    writeFileSync(file, JSON.stringify(encrypted), { mode: 0o600 }); writeFileSync(proof, JSON.stringify(evidenceProof(rows, rows[1].seq)));
    const result = execFileSync(process.execPath, ['--import', 'tsx', 'scripts/verify-evidence.ts', file, '--expected-root', bundle.rootHash], { input: password + '\n', encoding: 'utf8', timeout: 10000 });
    expect(JSON.parse(result)).toMatchObject({ valid: true, matchedExternalRoot: true, zeroKnowledge: false });
    expect(result).not.toContain('Private reminder'); expect(result).not.toContain(password);
    expect(JSON.parse(execFileSync(process.execPath, ['--import', 'tsx', 'scripts/verify-evidence.ts', proof, '--expected-root', bundle.rootHash], { encoding: 'utf8' })).valid).toBe(true);
    expect(spawnSync(process.execPath, ['--import', 'tsx', 'scripts/verify-evidence.ts', proof], { encoding: 'utf8' }).status).toBe(1);
  });
});
