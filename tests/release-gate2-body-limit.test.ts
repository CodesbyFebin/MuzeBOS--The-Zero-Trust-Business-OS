import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

// docs/SECURITY-TRIAGE.md: oversized API bodies are refused before any zod parse.
describe('API body size bound', () => {
  const req = (path: string, len: number) =>
    new NextRequest(`http://localhost:4100${path}`, { method: 'POST', headers: { 'content-length': String(len), host: 'localhost:4100' } });
  it('refuses a JSON API body over 2 MB with 413', async () => {
    const res = await middleware(req('/api/muzebos/expenses', 2_000_001));
    expect(res.status).toBe(413);
  });
  it('does not apply the JSON cap to upload routes (they enforce their own limits)', async () => {
    const res = await middleware(req('/api/content/upload', 50_000_000));
    expect(res.status).not.toBe(413);
  });
  it('lets a normal-sized body through to the auth gate', async () => {
    const res = await middleware(req('/api/muzebos/expenses', 500));
    expect(res.status).not.toBe(413);
  });
});
