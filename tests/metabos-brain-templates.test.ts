import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BusinessStore } from '@/lib/metabos/store';
import { FOUNDER_TEMPLATES, BRAIN_ROLES } from '@/lib/metabos/brain-templates';
import { featureByRoute } from '@/lib/metabos/registry';
const dirs: string[] = []; const open: BusinessStore[] = [];
const file = () => { const d = mkdtempSync(path.join(tmpdir(), 'mb-brain-')); dirs.push(d); return path.join(d, 'db.sqlite'); };
const store = (f: string) => { const s = new BusinessStore(f); open.push(s); return s; };
afterEach(() => { open.splice(0).forEach((s) => s.db.open && s.close()); dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })); });

describe('founder templates catalogue', () => {
  it('has 12 unique templates, each with roles, body and an existing reference document when linked', () => {
    expect(FOUNDER_TEMPLATES).toHaveLength(12);
    expect(new Set(FOUNDER_TEMPLATES.map((t) => t.id)).size).toBe(12);
    for (const t of FOUNDER_TEMPLATES) {
      expect(t.roles.length).toBeGreaterThan(0);
      t.roles.forEach((r) => expect(BRAIN_ROLES).toContain(r));
      expect(t.body).toContain(t.name);
      if (t.referenceId) expect(existsSync(path.join(process.cwd(), 'vendor/reference-documents', `${t.referenceId}.txt`))).toBe(true);
    }
    for (const r of BRAIN_ROLES) expect(FOUNDER_TEMPLATES.some((t) => t.roles.includes(r))).toBe(true);
  });
});

describe('favorites, role preference and use-template', () => {
  it('favorite persists across reload, role persists, use template creates a draft only', () => {
    const f = file(); let s = store(f);
    expect(s.templateFavorites()).toEqual([]);
    expect(s.rolePreference()).toBe('founder');
    s.favoriteTemplate({ id: 'founder-cfo', favorite: true });
    s.favoriteTemplate({ id: 'founder-cfo', favorite: true }); // idempotent
    s.favoriteTemplate({ id: 'weekly-review', favorite: true });
    s.setRolePreference('finance');
    s.close();
    s = store(f); // reload from disk
    expect(s.templateFavorites()).toEqual(['founder-cfo', 'weekly-review']);
    expect(s.rolePreference()).toBe('finance');
    s.favoriteTemplate({ id: 'weekly-review', favorite: false });
    expect(s.templateFavorites()).toEqual(['founder-cfo']);
    const before = { invoices: s.invoices().length, orders: s.orders().length, reminders: s.reminders().length };
    const d = s.useTemplate({ id: 'founder-cfo' });
    expect(d).toMatchObject({ templateId: 'founder-cfo', status: 'draft', role: 'finance', title: 'Unit economics draft' });
    expect(d.body).toContain('Break-even');
    expect(s.brainDrafts()).toEqual([d]);
    expect({ invoices: s.invoices().length, orders: s.orders().length, reminders: s.reminders().length }).toEqual(before);
    expect(s.evidence().map((e) => e.action)).toEqual(['template.favorited', 'template.favorited', 'brain.role.set', 'template.unfavorited', 'brain.draft.created']);
    expect(s.verifyAudit()).toBe(true);
    expect(() => s.db.prepare("UPDATE mb_brain_drafts SET status='sent'").run()).toThrow(); // only drafts can exist
  });
  it('rejects unknown templates and roles', () => {
    const s = store(':memory:');
    expect(() => s.favoriteTemplate({ id: 'nope', favorite: true })).toThrow('Template not found');
    expect(() => s.useTemplate({ id: 'nope' })).toThrow('Template not found');
    expect(() => s.setRolePreference('ceo')).toThrow();
    expect(s.brainDrafts()).toEqual([]);
  });
  it('is registered as an available Brain page', () => {
    expect(featureByRoute('/workspace/brain/templates')).toMatchObject({ id: 'brain.founder-templates', status: 'available' });
  });
});
