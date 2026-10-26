import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { BusinessError, type BusinessStore, type Product } from '../store';
import { MODULES, moduleById, formatMoney, type FieldDef, type ModuleDef, type ModuleRecord, type ModuleView, type RefOption } from './index';
import { HOOKS } from './hooks';

const now = () => new Date().toISOString();
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
export const today = () => new Date().toISOString().slice(0, 10);

function fieldSchema(f: FieldDef): z.ZodTypeAny {
  const lo = f.min, hi = f.max;
  switch (f.kind) {
    case 'text': return z.string().trim().min(1).max(hi ?? 160);
    case 'longtext': return z.string().trim().min(1).max(hi ?? 4000);
    case 'int': return z.number().int().min(lo ?? 0).max(hi ?? 1_000_000_000);
    case 'money': return z.number().int().min(lo ?? 0).max(hi ?? 100_000_000_000);
    case 'bps': return z.number().int().min(lo ?? 0).max(hi ?? 10_000);
    case 'date': return z.string().regex(isoDate, 'Use YYYY-MM-DD').refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v), 'Invalid date');
    case 'enum': return z.enum(f.options as [string, ...string[]]);
    case 'bool': return z.boolean();
    case 'email': return z.string().trim().email().max(200);
    case 'url': return z.string().trim().url().max(500).refine((v) => /^https?:\/\//.test(v), 'http(s) URLs only');
    case 'code': return z.string().trim().toUpperCase().pipe(z.string().regex(/^[A-Z0-9][A-Z0-9_-]{0,39}$/, 'Letters, digits, dash or underscore; max 40'));
    case 'ref': return z.string().trim().min(1).max(64);
    case 'lines': return z.array(z.object({ productId: z.string().min(1).max(64), quantity: z.number().int().min(1).max(10_000) }).strict()).min(1).max(20);
  }
}
export function dataSchema(fields: FieldDef[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    if (f.system) continue;
    const s = fieldSchema(f);
    shape[f.name] = f.required ? s : (f.kind === 'bool' ? s.default(false) : s.optional().or(z.literal('').transform(() => undefined)));
  }
  return z.object(shape).strict();
}

type Row = { id: string; module: string; status: string; data: string; version: number; createdAt: string; updatedAt: string };
const parse = (r: Row): ModuleRecord => ({ ...r, data: JSON.parse(r.data) });
export function records(store: BusinessStore, moduleId: string): ModuleRecord[] {
  return (store.db.prepare('SELECT * FROM mb_module_records WHERE module=? ORDER BY createdAt DESC, rowid DESC').all(moduleId) as Row[]).map(parse);
}
export function record(store: BusinessStore, moduleId: string, id: string): ModuleRecord {
  const r = store.db.prepare('SELECT * FROM mb_module_records WHERE module=? AND id=?').get(moduleId, id) as Row | undefined;
  if (!r) throw new BusinessError('Record not found', 404);
  return parse(r);
}
export function productById(store: BusinessStore, id: string): Product {
  const p = store.db.prepare('SELECT * FROM mb_products WHERE id=?').get(id) as Product | undefined;
  if (!p) throw new BusinessError('Product not found', 404);
  return p;
}

function refOptions(store: BusinessStore, def: ModuleDef): Record<string, RefOption[]> {
  const out: Record<string, RefOption[]> = {};
  for (const f of def.fields) {
    const kind = f.kind === 'lines' ? 'product' : f.ref;
    if (!kind || out[kind]) continue;
    if (kind === 'customer') out[kind] = store.customers().map((c) => ({ id: c.id, label: c.name }));
    else if (kind === 'product') out[kind] = store.products().map((p) => ({ id: p.id, label: `${p.name} (${p.sku})` }));
    else if (kind === 'invoice') out[kind] = store.invoices().map((i) => ({ id: i.id, label: `${i.number} - ${i.payload.customer.name}` }));
    else if (kind.startsWith('module:')) {
      const m = moduleById(kind.slice(7));
      const labelField = m?.fields.find((x) => x.kind === 'code' || x.kind === 'text')?.name;
      out[kind] = records(store, kind.slice(7)).filter((r) => r.status === 'active' || !m?.states.includes('active')).map((r) => ({ id: r.id, label: String(r.data[labelField ?? 'id'] ?? r.id) }));
    }
  }
  return out;
}

function checkRefs(store: BusinessStore, def: ModuleDef, data: Record<string, unknown>) {
  const refs = refOptions(store, def);
  for (const f of def.fields) {
    const v = data[f.name];
    if (v === undefined || v === null || v === '') continue;
    if (f.kind === 'ref' && f.ref && !refs[f.ref]?.some((o) => o.id === v)) throw new BusinessError(`${f.label}: not found or not active`, 422);
    if (f.kind === 'lines') for (const l of v as { productId: string }[]) if (!refs.product?.some((o) => o.id === l.productId)) throw new BusinessError(`${f.label}: product not found`, 422);
  }
}

function assertUnique(store: BusinessStore, def: ModuleDef, data: Record<string, unknown>, selfId?: string) {
  for (const key of HOOKS[def.id]?.unique ?? []) {
    const fields = key.split('+');
    const clash = records(store, def.id).find((r) => r.id !== selfId && fields.every((f) => r.data[f] === data[f]));
    if (clash) throw new BusinessError(`${fields.map((f) => def.fields.find((x) => x.name === f)?.label ?? f).join(' + ')} already exists`, 409);
  }
}

export function view(store: BusinessStore, moduleId: string): ModuleView {
  const def = moduleById(moduleId);
  if (!def) throw new BusinessError('Unknown module', 404);
  const hooks = HOOKS[def.id];
  const list = records(store, def.id).map((r) => ({ ...r, computed: hooks?.compute?.(store, r) }));
  return { def, records: list, refs: refOptions(store, def), stats: hooks?.stats?.(store, list) ?? [], loadedAt: now() };
}

export const ActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), data: z.record(z.unknown()) }).strict(),
  z.object({ action: z.literal('update'), id: z.string().min(1).max(64), version: z.number().int().min(1), data: z.record(z.unknown()) }).strict(),
  z.object({ action: z.literal('transition'), id: z.string().min(1).max(64), version: z.number().int().min(1), transition: z.string().min(1).max(40), input: z.record(z.unknown()).default({}) }).strict(),
]);
export type ModuleAction = z.infer<typeof ActionSchema>;

function zodMessage(e: z.ZodError) { return e.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; '); }
function parseOr422<T>(s: z.ZodType<T>, v: unknown): T { const r = s.safeParse(v); if (!r.success) throw new BusinessError(zodMessage(r.error), 422); return r.data; }

export function perform(store: BusinessStore, moduleId: string, raw: unknown): ModuleRecord {
  const def = moduleById(moduleId);
  if (!def) throw new BusinessError('Unknown module', 404);
  const act = parseOr422(ActionSchema, raw);
  const hooks = HOOKS[def.id];
  return store.transact(() => {
    if (act.action === 'create') {
      const data = parseOr422(dataSchema(def.fields), act.data) as Record<string, unknown>;
      checkRefs(store, def, data); assertUnique(store, def, data);
      const extra = hooks?.validate?.(store, data, null) ?? {};
      const rec: ModuleRecord = { id: randomUUID(), module: def.id, status: def.initial, data: { ...data, ...extra }, version: 1, createdAt: now(), updatedAt: now() };
      store.db.prepare('INSERT INTO mb_module_records VALUES(?,?,?,?,?,?,?)').run(rec.id, rec.module, rec.status, JSON.stringify(rec.data), 1, rec.createdAt, rec.updatedAt);
      store.appendEvidence(`module.${def.id}.created`, rec.id, `${def.noun} created`);
      return rec;
    }
    const cur = record(store, def.id, act.id);
    if (cur.version !== act.version) throw new BusinessError(`Stale: this ${def.noun} changed since you loaded it (now version ${cur.version}). Reload and retry.`, 409);
    let status = cur.status, data = cur.data, detail: string;
    if (act.action === 'update') {
      if (!def.editableIn.includes(cur.status)) throw new BusinessError(`A ${def.noun} in state ${cur.status} cannot be edited`, 409);
      const next = parseOr422(dataSchema(def.fields), act.data) as Record<string, unknown>;
      checkRefs(store, def, next); assertUnique(store, def, next, cur.id);
      const sys = Object.fromEntries(def.fields.filter((f) => f.system).map((f) => [f.name, cur.data[f.name]]));
      data = { ...sys, ...next, ...(hooks?.validate?.(store, next, cur) ?? {}) };
      detail = `${def.noun} edited`;
    } else {
      const t = def.transitions[act.transition];
      if (!t) throw new BusinessError('Unknown transition', 422);
      if (!t.from.includes(cur.status)) throw new BusinessError(`Cannot ${t.label.toLowerCase()} a ${def.noun} in state ${cur.status}`, 409);
      const input = t.inputs ? parseOr422(dataSchema(t.inputs.map((f) => ({ ...f, system: false }))), act.input) as Record<string, unknown> : {};
      const patch = hooks?.transition?.(store, cur, act.transition, input) ?? {};
      // Inputs named after a system field are recorded on the record (e.g. a root cause or payment reference).
      const recorded = Object.fromEntries(Object.entries(input).filter(([k]) => def.fields.some((f) => f.system && f.name === k)));
      status = patch.status ?? t.to; data = { ...cur.data, ...recorded, ...patch.data };
      detail = `${act.transition}: ${cur.status} -> ${status}`;
    }
    const version = cur.version + 1;
    store.db.prepare('UPDATE mb_module_records SET status=?, data=?, version=?, updatedAt=? WHERE id=? AND version=?').run(status, JSON.stringify(data), version, now(), cur.id, cur.version);
    store.appendEvidence(`module.${def.id}.${act.action === 'update' ? 'updated' : act.transition}`, cur.id, detail);
    return { ...cur, status, data, version, updatedAt: now() };
  });
}
export { MODULES, formatMoney };
