import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { OPEN_PATHS, TOKEN_PATHS } from '../auth-gate';

/** One HTTP route file under app/api, described only from what its source actually contains. */
export type ApiRoute = {
  path: string; file: string; methods: string[]; summary: string;
  idempotencyKey: boolean; originCheck: boolean; schemaValidated: boolean; /** Middleware gate: session cookie, bearer-token push endpoint, open (login/check), or signed webhook receiver. */
  access: 'session' | 'token' | 'open' | 'webhook';
};
export type ApiReference = { source: 'app/api'; count: number; routes: ApiRoute[] };

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

function walk(dir: string): string[] {
  return readdirSync(dir).sort().flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : n === 'route.ts' || n === 'route.tsx' ? [p] : []; });
}

/** First JSDoc block in the file, flattened to one line (the route's own description). */
function summaryOf(src: string): string {
  const m = src.match(/\/\*\*([\s\S]*?)\*\//);
  if (!m) return '';
  const t = m[1].split('\n').map((l) => l.replace(/^\s*\*\s?/, '').trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  return t.length > 320 ? `${t.slice(0, 317)}...` : t;
}

export function describeRoute(root: string, file: string): ApiRoute {
  const src = readFileSync(file, 'utf8');
  const rel = relative(root, file).split(sep).join('/');
  const path = `/${rel.replace(/^app\//, '').replace(/\/route\.tsx?$/, '')}`.replace(/\[([^\]]+)\]/g, '{$1}');
  const methods = METHODS.filter((m) => new RegExp(`export\\s+(async\\s+)?(function|const)\\s+${m}\\b`).test(src) || new RegExp(`export\\s*\\{[^}]*\\bas\\s+${m}\\b`).test(src));
  return {
    path, file: rel, methods, summary: summaryOf(src),
    idempotencyKey: /idempotency-key/i.test(src) || /idempotencyKey|withIdempotency|requireIdempotency/.test(src),
    originCheck: /businessAccess\(|headers\.get\(\s*['"]origin['"]\s*\)|sameOrigin|isSameOrigin|assertOrigin|checkOrigin/i.test(src),
    schemaValidated: /from\s+['"]zod['"]|\.safeParse\(|Schema\.parse\(/.test(src),
    access: (OPEN_PATHS as readonly string[]).includes(path) ? 'open' : (TOKEN_PATHS as readonly string[]).includes(path) ? 'token' : path.startsWith('/api/webhooks/') ? 'webhook' : 'session',
  };
}

/** Scan `<root>/app/api` for route files. Deterministic: sorted, no timestamps. */
export function scanApiRoutes(root: string): ApiReference {
  const routes = walk(join(root, 'app', 'api')).map((f) => describeRoute(root, f)).sort((a, b) => a.path.localeCompare(b.path));
  return { source: 'app/api', count: routes.length, routes };
}
