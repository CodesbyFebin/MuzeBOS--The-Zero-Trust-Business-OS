import { describe, expect, it, beforeAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { BusinessStore, digest } from '@/lib/metabos/store';
import { annotate } from '@/lib/metabos/evidence';
import { attestChain, exportChain, verifierBinary } from '@/lib/metabos/evidence-export';
import { trustStack } from '@/lib/metabos/bos/core';
import { propose, decide } from '@/lib/metabos/dispatch/service';

const crate = path.resolve(__dirname, '..', 'tools', 'agenet-verify');
function seeded() {
  const s = new BusinessStore(':memory:');
  const d = propose(s, 'owner', 'whatsapp', { to: '+919999999999', body: 'Order "42" ready\nnext line ✓' });
  decide(s, 'owner', d.id, d.payloadHash, true);
  propose(s, 'owner', 'whatsapp', { to: '+919999999998', body: 'second' });
  return s;
}
let bin: string | null = null;
beforeAll(() => {
  bin = verifierBinary({});
  if (!bin && spawnSync('cargo', ['--version']).status === 0) { execFileSync('cargo', ['build', '--quiet'], { cwd: crate }); bin = verifierBinary({}); }
}, 300_000);

describe('evidence export (hash-commitment, not ZK)', () => {
  it('exports a chain whose links recompute in TS exactly as stored', () => {
    const s = seeded(); const x = exportChain(s.evidence());
    expect(x.count).toBeGreaterThanOrEqual(3); expect(x.method).toBe('hash-commitment, not ZK');
    let prev = 'GENESIS';
    for (const e of x.entries) { const { seq: _s, hash, ...body } = e; expect(body.previousHash).toBe(prev); expect(digest(body)).toBe(hash); prev = hash; }
    expect(x.headHash).toBe(prev); expect(annotate(s.evidence()).valid).toBe(true);
    if (process.env.WRITE_AGENET_FIXTURE) fs.writeFileSync(path.join(crate, 'tests/fixtures/real-export.json'), JSON.stringify(x, null, 2) + '\n');
  });
  it('empty store is never attested', () => {
    expect(attestChain(exportChain([]), {}).state).toBe('not_attested');
    expect(trustStack(new BusinessStore(':memory:'), {}).find((l) => l.id === 'R6')!.state).toBe('empty');
  });
});

describe('independent Rust verifier (agenet-verify)', () => {
  it('attests a real exported chain and marks R6 attested', () => {
    if (!bin) { expect(attestChain(exportChain(seeded().evidence()), {}).state).toBe('not_attested'); return; }
    const s = seeded(); const a = attestChain(exportChain(s.evidence()), {});
    expect(a.state).toBe('attested');
    const r6 = trustStack(s, {}).find((l) => l.id === 'R6')!;
    expect(r6.state).toBe('attested_hash_commitment'); expect(r6.detail).toMatch(/Hash-commitment, not ZK/);
  });
  it('a tampered export fails and is never attested', () => {
    if (!bin) return;
    const x = exportChain(seeded().evidence());
    x.entries[1] = { ...x.entries[1], detail: x.entries[1].detail + ' (edited)' };
    const a = attestChain(x, {}); expect(a.state).toBe('failed');
    if (a.state === 'failed') expect(a.firstBrokenSeq).toBe(x.entries[1].seq);
    const r6 = trustStack(seeded(), {}, a).find((l) => l.id === 'R6')!;
    expect(r6.state).toBe('chain_broken');
  });
  it('R0–R2 and R4 stay not attested', () => {
    const t = trustStack(seeded(), {});
    expect(t.filter((l) => ['R0', 'R1', 'R2', 'R4'].includes(l.id)).every((l) => l.state === 'not_attested')).toBe(true);
  });
});
