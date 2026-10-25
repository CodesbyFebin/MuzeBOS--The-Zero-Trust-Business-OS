import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { BusinessStore } from '@/lib/muzebos/store';
import { reviewAgentPermissions } from '@/lib/muzebos/agent-review';
import { normalizePermissionEntry } from '@/vendor/agentshield/permission-entries';
import catalog from '@/lib/muzebos/source-catalog.json';
import library from '@/lib/muzebos/employee-index.json';
import index from '@/lib/muzebos/employee-index.json';
import { SIDEBAR_ENTRIES, workspaceActive } from '@/lib/muzebos/navigation';
const stores: BusinessStore[] = [];
const dirs: string[] = [];
const fresh = (file = ':memory:') => { const s = new BusinessStore(file); stores.push(s); return s; };
const date = (hour: number) => `2026-11-01T${String(hour).padStart(2, '0')}:00:00Z`;
afterEach(() => { stores.splice(0).forEach(s => { if (s.db.open) s.close(); }); dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })); });

describe('Pinned, attributed source consolidation', () => {
  it('records all 29 requested sources with exact revisions and explicit disposition', () => {
    expect(catalog).toHaveLength(29); expect(new Set(catalog.map(x => x.repo)).size).toBe(29);
    for (const source of catalog) { expect(source.sha).toMatch(/^[a-f0-9]{40}$/); expect(source.remaining.length).toBeGreaterThan(20); }
    expect(catalog.filter(s => s.mode === 'imported')).toHaveLength(4);
    expect(catalog.find(s => s.repo === 'hypaware/Hypastack')?.mode).toBe('excluded');
    expect(catalog.find(s => s.repo.includes('Wave-Bookkeeping'))?.mode).toBe('excluded');
  });
  it('imports 8 roles, 60 routine documents and 16 templates with content hashes', () => {
    expect(library.roles).toHaveLength(8); expect(library.roles.flatMap(r => r.routines)).toHaveLength(60); expect(library.templates).toHaveLength(16);
    for (const doc of [...library.roles.flatMap(r => r.routines), ...library.templates]) expect(createHash('sha256').update(readFileSync(path.join('vendor/reference-documents',doc.id+'.txt'))).digest('hex')).toBe(doc.sha256);
    expect(JSON.stringify(index)).not.toContain('"content"');
    for (const dir of ['agentshield', 'ai-employees', 'founder-skill', 'ai-agent-onboarding']) expect(readFileSync(path.join('vendor', dir, 'LICENSE'), 'utf8')).toContain('Permission is hereby granted');
  });
  it('preserves exactly 18 destinations and resolves nested pages to their owning menu', () => {
    expect(SIDEBAR_ENTRIES).toHaveLength(18);
    expect(workspaceActive('/workspace/brain/employees')).toBe('brain');
    expect(workspaceActive('/workspace/orders/bookings')).toBe('orders');
    expect(workspaceActive('/workspace/system/sources')).toBe('system');
  });
});

describe('Limited static permission review', () => {
  it('normalizes prefix and absolute command spellings through imported AgentShield code', () => {
    expect(normalizePermissionEntry('Bash(/usr/bin/curl:*)')).toBe('Bash(curl *)');
    expect(reviewAgentPermissions({ permissions: { allow: ['Bash(/usr/bin/curl:*)'], deny: [] } }).map(f => f.rule)).toContain('powerful-command');
  });
  it('flags broad writes and sensitive files without echoing input into findings', () => {
    const findings = reviewAgentPermissions({ permissions: { allow: ['Write(*)', 'Read(.env.secret-value)'], deny: ['Bash(sudo *)'] } });
    expect(findings.map(f => f.rule)).toEqual(['unrestricted-tool', 'sensitive-access']);
    expect(JSON.stringify(findings)).not.toContain('secret-value');
  });
  it('accepts a narrow read rule without asserting runtime safety', () => {
    expect(reviewAgentPermissions({ permissions: { allow: ['Read(./src/*)'], deny: ['Bash(sudo *)'] } })).toEqual([]);
  });
  it('rejects malformed input and excessive allow lists', () => {
    expect(() => reviewAgentPermissions({ permissions: { allow: 'all' } })).toThrow();
    expect(() => reviewAgentPermissions({ permissions: { allow: Array(101).fill('Read(*)') } })).toThrow();
    expect(reviewAgentPermissions({ permissions: { allow: ['unknown'] } }).map(f => f.rule)).toContain('unsupported-syntax');
  });
});

describe('Persistent resource booking transactions', () => {
  it('starts blank, rejects overlap, permits adjacency and audits cancellation', () => {
    const s = fresh(), customer = s.customer({ name: 'Customer' }); expect(s.bookings()).toEqual([]);
    const b = s.booking({ customerId: customer.id, resource: ' Room A ', startsAt: date(9), endsAt: date(10) });
    expect(b.resource).toBe('room a');
    expect(() => s.booking({ customerId: customer.id, resource: 'ROOM A', startsAt: date(9), endsAt: date(11) })).toThrow('already booked');
    s.booking({ customerId: customer.id, resource: 'room a', startsAt: date(10), endsAt: date(11) });
    s.cancelBooking(b.id); s.booking({ customerId: customer.id, resource: 'room a', startsAt: date(9), endsAt: date(10) });
    expect(s.evidence().filter(e => e.action === 'booking.created')).toHaveLength(3); expect(s.verifyAudit()).toBe(true);
  });
  it('normalizes offsets and rejects all overlapping interval shapes', () => {
    const s = fresh(), customer = s.customer({ name: 'Customer' });
    s.booking({ customerId: customer.id, resource: 'Desk', startsAt: '2026-11-01T14:30:00+05:30', endsAt: '2026-11-01T16:30:00+05:30' });
    for (const [start, end] of [[8, 10], [10, 12], [8, 12], [9, 11]]) expect(() => s.booking({ customerId: customer.id, resource: 'desk', startsAt: date(start), endsAt: date(end) })).toThrow('already booked');
    expect(s.bookings()[0].startsAt).toBe('2026-11-01T09:00:00.000Z');
    s.booking({ customerId: customer.id, resource: 'Other desk', startsAt: date(9), endsAt: date(11) });
  });
  it('rejects missing customers, invalid intervals and repeated cancellation', () => {
    const s = fresh(), customer = s.customer({ name: 'Customer' });
    expect(() => s.booking({ customerId: randomUUID(), resource: 'x', startsAt: date(9), endsAt: date(10) })).toThrow('Customer not found');
    expect(() => s.booking({ customerId: customer.id, resource: 'x', startsAt: date(10), endsAt: date(9) })).toThrow('after start');
    expect(() => s.booking({ customerId: customer.id, resource: '', startsAt: 'invalid', endsAt: date(10) })).toThrow();
    expect(() => s.cancelBooking(randomUUID())).toThrow('not found');
  });
  it('persists bookings and idempotent creation across reopening', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'mb-booking-')); dirs.push(dir); const filename = path.join(dir, 'business.sqlite');
    const s = fresh(filename), customer = s.customer({ name: 'Persisted' }), key = randomUUID();
    const input = { customerId: customer.id, resource: 'Desk', startsAt: date(9), endsAt: date(10) };
    const first = s.command(key, input, () => s.booking(input));
    expect(s.command(key, input, () => s.booking(input))).toEqual(first); s.close();
    const reopened = fresh(filename); expect(reopened.bookings()).toHaveLength(1); expect(reopened.verifyAudit()).toBe(true);
  });
  it('prevents a real two-process race for the same interval', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'mb-race-')); dirs.push(dir); const filename = path.join(dir, 'business.sqlite');
    const s = fresh(filename), customer = s.customer({ name: 'Racing customer' });
    const script = path.join(dir, 'race.ts');
    writeFileSync(script, `import { BusinessStore } from ${JSON.stringify(path.resolve('lib/muzebos/store.ts'))}; const s=new BusinessStore(${JSON.stringify(filename)}); const input=${JSON.stringify({ customerId: customer.id, resource: 'Desk', startsAt: date(9), endsAt: date(10) })}; try{s.booking(input); console.log('BOOKED');}catch(e){console.log('REJECTED');}finally{s.close();}`);
    const run = () => new Promise<string>((resolve, reject) => { const child = spawn(process.execPath, ['--import', 'tsx', script], { cwd: process.cwd() }); let out = '', err = ''; child.stdout.on('data', b => out += b); child.stderr.on('data', b => err += b); child.on('error', reject); child.on('close', code => code === 0 ? resolve(out.trim()) : reject(new Error(err))); });
    expect((await Promise.all([run(), run()])).sort()).toEqual(['BOOKED', 'REJECTED']); expect(s.bookings()).toHaveLength(1);
  }, 20_000);
});
