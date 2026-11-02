import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const access = vi.hoisted(() => ({ configured: true, valid: true }));
vi.mock('@/lib/auth', async (orig) => ({ ...(await orig<typeof import('@/lib/auth')>()), readAuthState: () => ({ configured: access.configured }), sessionIsValid: () => access.valid }));
import { setupWorkspace, USER_COOKIE } from '@/lib/muzebos/biz/accounts';
import { GET as bookings } from '@/app/api/bookings/route';
import { GET as library } from '@/app/api/employee-library/route';
import { POST } from '@/app/api/business/route';
import { GET as inferenceGet, POST as inferencePost } from '@/app/api/inference/route';
import { InferenceStore } from '@/lib/muzebos/inference/store';
import { routes } from '@/lib/muzebos/inference/routing';
import { runServerOnce } from '@/lib/muzebos/inference/providers';
import { businessStore } from '@/lib/muzebos/store';
const dir = mkdtempSync(path.join(tmpdir(), 'mb-integration-api-'));
let ownerToken = '';
const req = (route: string, token = ownerToken) => new Request(`http://localhost${route}`, { headers: token ? { cookie: `${USER_COOKIE}=${token}` } : {} });
const post = (payload: unknown, origin = 'http://localhost') => new Request('http://localhost/api/business', { method: 'POST', headers: { origin, 'content-type': 'application/json', 'idempotency-key': randomUUID() }, body: JSON.stringify(payload) });
beforeEach(() => { vi.stubEnv('MUZEBOS_DB', path.join(dir, 'business.sqlite')); access.configured = true; access.valid = true; const s = businessStore(); if (!ownerToken) ownerToken = setupWorkspace(s, { workspace: 'T', name: 'Owner', email: 'owner@example.com', password: 'long enough secret' }).token; });
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
    expect((await bookings(req('/api/bookings', ''))).status).toBe(401);
    const response = await bookings(req('/api/bookings')); expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await response.json()).bookings).toHaveLength(1);
    const booking = (await created.json()).result;
    expect((await POST(post({ action: 'cancelBooking', id: booking.id }))).status).toBe(200);
    expect(businessStore().verifyAudit()).toBe(true);
  });
  it('protects the server-output handoff and returns one unapproved workflow on replay', async () => {
    const env = { BASETEN_API_KEY: 'fixture', MUZEBOS_INFERENCE_PAID: '1' };
    const store = new InferenceStore(businessStore(), () => routes(env));
    const task = store.create({ title: 'API proposal', prompt: 'Propose a reminder', kind: 'draft', lane: 'baseten', paidConsent: true });
    store.approve(task.id, task.hash);
    await runServerOnce(store, 'fixture', env, (async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"tool":"reminders.create","args":{"title":"Review synthetic stock"}}' }, finish_reason: 'stop' }] }))) as typeof fetch);
    const payload = { action: 'proposeAction', id: task.id };
    const make = (origin = 'http://localhost', key = randomUUID()) => new Request('http://localhost/api/inference', { method: 'POST', headers: { origin, 'content-type': 'application/json', 'idempotency-key': key }, body: JSON.stringify(payload) });
    access.valid = false; expect((await inferencePost(make())).status).toBe(401); access.valid = true;
    expect((await inferencePost(make('https://other.example'))).status).toBe(403);
    const key = randomUUID(); const first = await inferencePost(make('http://localhost', key));
    expect(first.status).toBe(200); expect(first.headers.get('cache-control')).toBe('no-store');
    const run = (await first.json()).result; expect(run.status).toBe('awaiting_approval');
    expect((await (await inferencePost(make('http://localhost', key))).json()).result.id).toBe(run.id);
    expect((await (await inferencePost(make())).json()).result.id).toBe(run.id);
    expect(businessStore().db.prepare('SELECT COUNT(*) n FROM mb_reminders').get()).toEqual({ n: 0 });
    expect(businessStore().verifyAudit()).toBe(true);
  });

  it('gates inference access and exact-task approval without leaking leases', async () => {
    access.valid = false;
    expect((await inferenceGet(req('/api/inference'))).status).toBe(401);
    access.valid = true;
    const make = (payload: unknown, key = randomUUID()) => new Request('http://localhost/api/inference', { method:'POST', headers:{origin:'http://localhost','content-type':'application/json','idempotency-key':key}, body:JSON.stringify(payload) });
    const payload = { action:'create', data:{title:'API draft',prompt:'Draft a greeting',kind:'draft'} };
    const key = randomUUID();
    const first = await inferencePost(make(payload,key)); expect(first.status).toBe(200);
    const task = (await first.json()).result;
    expect((await (await inferencePost(make(payload,key))).json()).result.id).toBe(task.id);
    expect((await inferencePost(make({action:'approve',id:task.id,hash:'0'.repeat(64)}))).status).toBe(409);
    expect((await inferencePost(make({action:'approve',id:task.id,hash:task.hash}))).status).toBe(200);
    const lease = (await (await inferencePost(make({action:'claimBrowser',workerId:'api-browser'}))).json()).result;
    const state = await inferenceGet(req('/api/inference')); expect(state.headers.get('cache-control')).toBe('no-store');
    expect(JSON.stringify(await state.json())).not.toContain(lease.token);
    expect((await inferencePost(make({action:'completeBrowser',id:task.id,token:lease.token,output:'API fixture draft'}))).status).toBe(200);
    expect((await inferencePost(make({action:'completeBrowser',id:task.id,token:lease.token,output:'Duplicate'}))).status).toBe(409);
    expect(businessStore().verifyAudit()).toBe(true);
  });

});
