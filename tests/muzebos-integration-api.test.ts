import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const access = vi.hoisted(() => ({ configured: true, valid: true }));
vi.mock('@/lib/auth', () => ({ readAuthState: () => ({ configured: access.configured }), sessionIsValid: () => access.valid, cookieFromHeader: () => undefined }));
import { GET as bookings } from '@/app/api/bookings/route';
import { GET as library } from '@/app/api/employee-library/route';
import { POST } from '@/app/api/business/route';
import { businessStore } from '@/lib/muzebos/store';
const dir = mkdtempSync(path.join(tmpdir(), 'mb-integration-api-'));
const req = (route: string) => new Request(`http://localhost${route}`);
const post = (payload: unknown, origin = 'http://localhost') => new Request('http://localhost/api/business', { method: 'POST', headers: { origin, 'content-type': 'application/json', 'idempotency-key': randomUUID() }, body: JSON.stringify(payload) });
beforeEach(() => { vi.stubEnv('MUZEBOS_DB', path.join(dir, 'business.sqlite')); access.configured = true; access.valid = true; });
afterAll(() => { const s = businessStore(); if (s.db.open) s.close(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
describe('New integration API boundaries', () => {
  it('requires an operator session on both new data endpoints', async () => {
    access.valid = false;
    expect((await bookings(req('/api/bookings'))).status).toBe(401);
    expect((await library(req('/api/employee-library'))).status).toBe(401);
  });
  it('refuses remote access before operator configuration', async () => {
    access.configured = false;
    expect((await bookings(new Request('http://public.example/api/bookings'))).status).toBe(503);
    expect((await library(new Request('http://public.example/api/employee-library'))).status).toBe(503);
  });
  it('returns metadata separately from individual inert documents', async () => {
    const response = await library(req('/api/employee-library'));
    expect(response.headers.get('cache-control')).toBe('no-store');
    const index = await response.json(); expect(index.roles).toHaveLength(8); expect(JSON.stringify(index)).not.toContain('"content"');
    const document = await library(req('/api/employee-library?document=founder-skill-founder-board'));
    expect(document.status).toBe(200); expect((await document.json()).content.length).toBeGreaterThan(100);
    expect((await library(req('/api/employee-library?document=../../.env'))).status).toBe(404);
  });
  it('creates reservations through the authenticated idempotent command boundary', async () => {
    const customerResponse = await POST(post({ action: 'customer', data: { name: 'API booking customer' } }));
    const customer = (await customerResponse.json()).result;
    const payload = { action: 'booking', data: { customerId: customer.id, resource: 'API room', startsAt: '2030-01-01T09:00:00Z', endsAt: '2030-01-01T10:00:00Z' } };
    expect((await POST(post(payload, 'https://other.example'))).status).toBe(403);
    const created = await POST(post(payload)); expect(created.status).toBe(200);
    expect((await POST(post(payload))).status).toBe(409);
    const response = await bookings(req('/api/bookings')); expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await response.json()).bookings).toHaveLength(1);
    const booking = (await created.json()).result;
    expect((await POST(post({ action: 'cancelBooking', id: booking.id }))).status).toBe(200);
    expect(businessStore().verifyAudit()).toBe(true);
  });
});
