import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { readJsonBounded, BodyTooLargeError } from '@/lib/bounded-body';

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

describe('zod 4 and API-boundary bounds', () => {
  it('runs zod 4.6.6 or later (GHSA-mrhx-c7xc-m3w5 fixed)', () => {
    const v = JSON.parse(fs.readFileSync('node_modules/zod/package.json', 'utf8')).version as string;
    const [maj, min, pat] = v.split('.').map(Number);
    expect(maj > 4 || (maj === 4 && (min > 6 || (min === 6 && pat >= 6)))).toBe(true);
  });

  it('every z.array in app/api and lib/muzebos has an upper bound', () => {
    const offenders: string[] = [];
    for (const f of [...walk('app/api'), ...walk('lib/muzebos')]) {
      const s = fs.readFileSync(f, 'utf8');
      let i = 0;
      for (;;) {
        const j = s.indexOf('z.array(', i);
        if (j < 0) break;
        let k = j + 8, d = 1;
        while (d) { if (s[k] === '(') d++; else if (s[k] === ')') d--; k++; }
        const tail = s.slice(k, k + 200);
        if (!/^(\s*\.(min|nonempty)\([^)]*\))*\s*\.(max|length)\(/.test(tail)) offenders.push(`${f}:${s.slice(0, j).split('\n').length}`);
        i = k;
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no API route reads an unbounded JSON body', () => {
    const raw = walk('app/api').filter((f) => /await (req|request)\.json\(\)/.test(fs.readFileSync(f, 'utf8')));
    expect(raw).toEqual([]);
  });

  it('a bounded array schema rejects an oversized array', () => {
    const s = z.array(z.string()).max(1000);
    expect(s.safeParse(Array.from({ length: 1001 }, () => 'x')).success).toBe(false);
  });

  it('caps a chunked body with no Content-Length', async () => {
    const chunk = new Uint8Array(64 * 1024).fill(32);
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(c) { if (sent > 4_000_000) { c.close(); return; } sent += chunk.byteLength; c.enqueue(chunk); },
    });
    const req = new Request('http://localhost/api/x', { method: 'POST', body, duplex: 'half' } as RequestInit);
    expect(req.headers.get('content-length')).toBeNull();
    await expect(readJsonBounded(req)).rejects.toBeInstanceOf(BodyTooLargeError);
    expect(sent).toBeLessThan(4_000_000); // stopped reading early
  });

  it('parses a normal body and keeps SyntaxError for bad JSON', async () => {
    const ok = new Request('http://localhost/api/x', { method: 'POST', body: JSON.stringify({ a: [1] }) });
    expect(await readJsonBounded(ok)).toEqual({ a: [1] });
    await expect(readJsonBounded(new Request('http://localhost/api/x', { method: 'POST', body: '{' }))).rejects.toBeInstanceOf(SyntaxError);
  });
});
