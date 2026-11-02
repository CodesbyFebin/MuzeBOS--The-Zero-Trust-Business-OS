import { BusinessError, type BusinessStore } from '../store';
import type { ModuleRecord } from './types';
import { records } from './engine';
import type { Hooks } from './hooks';

const HEX = /^#[0-9A-Fa-f]{6}$/;
/** Retire whichever other record of the module is active (one active at a time). */
function retireOthers(store: BusinessStore, rec: ModuleRecord, sameKey?: string) {
  for (const o of records(store, rec.module)) {
    if (o.id === rec.id || o.status !== 'active') continue;
    if (sameKey && o.data[sameKey] !== rec.data[sameKey]) continue;
    store.db.prepare("UPDATE mb_module_records SET status='retired', version=version+1, updatedAt=? WHERE id=?").run(new Date().toISOString(), o.id);
    store.appendEvidence(`module.${rec.module}.retired`, o.id, 'retired: another record became active');
  }
}
export const WORKSPACE_HOOKS: Record<string, Hooks> = {
  'builder.theme-customizer': {
    unique: ['name'],
    validate: (_s, d) => { for (const k of ['background', 'surface', 'accent']) if (!HEX.test(String(d[k]))) throw new BusinessError(`${k} must be a #RRGGBB colour`, 422); },
    transition: (s, r, name) => { if (name === 'activate') retireOthers(s, r); },
  },
  'brain.tool-registry': { unique: ['code'] },
  'foundation.settings-and-sovereignty': {
    validate: (s, d, cur) => {
      if (d.key === 'retention_days' && !/^\d{1,5}$/.test(String(d.value))) throw new BusinessError('retention_days must be a whole number of days', 422);
      const clash = records(s, 'foundation.settings-and-sovereignty').find((o) => o.status === 'active' && o.data.key === d.key && o.id !== cur?.id);
      if (clash) throw new BusinessError(`An active ${String(d.key)} policy exists; retire it first`, 409);
    },
  },
  'system.integrations-and-adapters': { unique: ['code'] },
  'settings.application-settings': { unique: ['key'] },
  'settings.merchant-profile': {
    validate: (_s, d) => { if (d.gstin && !/^[0-9]{2}[A-Z0-9]{13}$/.test(String(d.gstin))) throw new BusinessError('GSTIN must be 15 characters starting with a 2-digit state code', 422); },
    transition: (s, r, name) => {
      if (name !== 'activate') return;
      retireOthers(s, r);
      const merchant = { name: String(r.data.legalName), address: String(r.data.address ?? ''), taxId: String(r.data.gstin ?? ''), upi: String(r.data.upi ?? '') };
      s.db.prepare("INSERT INTO mb_settings VALUES('merchant',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(merchant));
      s.appendEvidence('merchant.configured', 'merchant', `Invoice header set from merchant profile ${r.id}`);
    },
  },
  'settings.connections': { unique: ['envRef'], validate: (_s, d) => ({ envSet: !!process.env[String(d.envRef)] }) },
  'upgrade.inspect-usage': {
    validate: (s, d, cur) => {
      if (records(s, 'upgrade.inspect-usage').some((o) => o.status === 'active' && o.data.metric === d.metric && o.id !== cur?.id)) throw new BusinessError(`An active limit for ${String(d.metric)} exists; edit or retire it`, 409);
    },
  },
  'support.project-roadmap': { validate: (_s, d) => { if (!/^20\d\d-Q[1-4]$/.test(String(d.quarter))) throw new BusinessError('quarter must look like 2026-Q4', 422); } },
  'developer.integration-directory': { unique: ['code'] },
  'operations.tasks-and-goals': {},
};
