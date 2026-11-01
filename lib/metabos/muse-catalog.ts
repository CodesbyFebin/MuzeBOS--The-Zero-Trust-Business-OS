/**
 * MUSE skill + MCP catalog (config/muse-catalog.json, built from anthropics/skills, modelcontextprotocol/servers,
 * the MCP registry, CodesbyFebin/Agent-tools, Agentic-Workflow, awesome-harness and MeTaBos' own MCP wiring).
 * Read-only metadata. Nothing here executes skill scripts or launches MCP servers: an entry can only be
 * listed, searched, and (for writes / external-send risk) proposed through Jev via /api/dispatch channel "tool-call".
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

export type CatalogKind = 'skill' | 'mcp';
export type CatalogStatus = 'adoptable' | 'reference' | 'blocked';
export type CatalogRisk = 'read-only' | 'writes' | 'external-send';
export type CatalogEntry = { id: string; kind: CatalogKind; subkind?: string; name: string; purpose: string; source: string; license: string; status: CatalogStatus; env: string[]; risk: CatalogRisk; riskBasis: string; origin: string; fits: string[]; vendorPath?: string; launch?: string; version?: string; registryStatus?: string };
type Catalog = { generatedAt: string; notes: string[]; entries: CatalogEntry[] };

let cache: Catalog | null = null;
export function loadCatalog(file = path.join(process.cwd(), 'config', 'muse-catalog.json')): Catalog {
  if (!cache) {
    const c = JSON.parse(readFileSync(file, 'utf8')) as Catalog;
    // GPL-family licences are never adoptable, whatever the build script said.
    for (const e of c.entries) if (/\bA?GPL\b|LGPL/i.test(e.license) && e.status === 'adoptable') e.status = 'reference';
    cache = c;
  }
  return cache;
}
export const getEntry = (id: string) => loadCatalog().entries.find((e) => e.id === id) ?? null;

/** Env vars that must be set before an entry can be called. Header-style requirements count as env too. */
export function missingFor(e: CatalogEntry, env: Record<string, string | undefined> = process.env) {
  return e.env.filter((k) => !env[k.startsWith('header:') ? `MUSE_MCP_HEADER_${k.slice(7).toUpperCase().replace(/[^A-Z0-9]/g, '_')}` : k]?.trim());
}
export function connectionLabel(e: CatalogEntry, env: Record<string, string | undefined> = process.env) {
  if (e.status === 'blocked') return 'Blocked (licence or deprecated)';
  if (e.kind === 'skill') return e.vendorPath ? 'Vendored (instructions only)' : 'Reference only';
  const m = missingFor(e, env);
  if (m.length) return `Not connected — add ${m.join(', ')}`;
  return e.origin === 'muze' && e.id === 'mcp:muze/gst' ? 'Built in (read-only)' : 'Not connected — needs an operator to start and register it';
}
/** Writes or external-send entries must go through Jev; read-only ones still never auto-run. */
export const needsJev = (e: CatalogEntry) => e.risk !== 'read-only';

export function counts(entries = loadCatalog().entries) {
  const out: Record<string, number> = {};
  for (const e of entries) { out[`${e.kind}.${e.status}`] = (out[`${e.kind}.${e.status}`] ?? 0) + 1; out[e.kind] = (out[e.kind] ?? 0) + 1; }
  return out;
}
export function searchCatalog(opts: { q?: string; kind?: CatalogKind; status?: CatalogStatus; fit?: string; limit?: number; offset?: number }, env: Record<string, string | undefined> = {}) {
  const q = opts.q?.trim().toLowerCase() ?? '';
  const rows = loadCatalog().entries.filter((e) => (!opts.kind || e.kind === opts.kind) && (!opts.status || e.status === opts.status) && (!opts.fit || e.fits.includes(opts.fit)) && (!q || `${e.name} ${e.purpose} ${e.id}`.toLowerCase().includes(q)));
  // Adoptable and in-house first, then MeTaBos fit, then name.
  const rank = (e: CatalogEntry) => (e.status === 'adoptable' ? 0 : e.status === 'reference' ? 1 : 2) * 10 - Math.min(e.fits.length, 5);
  rows.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  const offset = Math.max(0, opts.offset ?? 0); const limit = Math.min(100, Math.max(1, opts.limit ?? 30));
  return { total: rows.length, items: rows.slice(offset, offset + limit).map((e) => ({ ...e, connection: connectionLabel(e, env), needsJev: needsJev(e) })) };
}
