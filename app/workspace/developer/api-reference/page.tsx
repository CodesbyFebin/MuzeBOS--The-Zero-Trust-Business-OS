import ref from '@/lib/muzebos/api-reference.generated.json';
import type { ApiReference } from '@/lib/muzebos/api-reference';
export const dynamic = 'force-static';
const ACCESS: Record<string, string> = { session: 'Session cookie (or loopback with no password set)', token: 'Bearer token push endpoint', open: 'Open (sign-in)', webhook: 'Signed webhook receiver' };
/** Developer API reference generated from the real app/api route files (scripts/gen-api-reference.ts). Describes only what the source contains. */
export default function ApiReferencePage() {
  const r = ref as ApiReference;
  const groups = new Map<string, ApiReference['routes']>();
  for (const route of r.routes) { const g = route.path.split('/')[2] ?? 'api'; groups.set(g, [...(groups.get(g) ?? []), route]); }
  return <div className="mb-console mb-category">
    <header className="mb-panel"><h1>API reference</h1>
      <p>{r.count} route files under <code>app/api</code>, generated from source by <code>npx tsx scripts/gen-api-reference.ts</code>. A test fails if this list drifts from the route files.</p>
      <p>These are this install&apos;s internal HTTP endpoints. There is no public API product, SDK, plan or rate card. Flags below are detected from each file&apos;s source text and are a guide, not a contract; read the route file before relying on it.</p></header>
    {r.count === 0 ? <section className="mb-panel"><p>No route files were found.</p></section> : null}
    <nav className="mb-panel" aria-label="API groups"><ul className="mb-help-list">{[...groups.keys()].map((g) => <li key={g}><a href={`#api-${g}`}>{g}</a> ({groups.get(g)!.length})</li>)}</ul></nav>
    {[...groups.entries()].map(([g, routes]) => <section key={g} id={`api-${g}`} className="mb-panel"><h2>/api/{g}</h2>
      <div className="mb-table-wrap"><table className="mb-table"><thead><tr><th scope="col">Path</th><th scope="col">Methods</th><th scope="col">Access</th><th scope="col">Checks found in source</th><th scope="col">Description (from the file)</th></tr></thead><tbody>
        {routes.map((x) => <tr key={x.path}><td><code>{x.path}</code></td><td>{x.methods.join(', ')}</td><td>{ACCESS[x.access]}</td>
          <td>{[x.schemaValidated && 'schema validation', x.originCheck && 'origin/operator check', x.idempotencyKey && 'Idempotency-Key'].filter(Boolean).join(', ') || 'none detected'}</td>
          <td>{x.summary || <em>No doc comment in {x.file}</em>}</td></tr>)}
      </tbody></table></div></section>)}
  </div>;
}
