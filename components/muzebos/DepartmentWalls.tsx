'use client';
import { useEffect, useState } from 'react';
type Wall = { department: string; scopes: { scope: string; allowed: boolean }[] };
export function DepartmentWalls() {
  const [walls, setWalls] = useState<Wall[] | null>(null); const [error, setError] = useState<string | null>(null); const [probe, setProbe] = useState<string | null>(null);
  useEffect(() => { fetch('/api/muzebos/walls').then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setWalls(j.walls); }).catch((e) => setError((e as Error).message)); }, []);
  const test = async (d: string, sc: string) => { setProbe(null); const r = await fetch(`/api/muzebos/walls?department=${d}&scope=${sc}`); const j = await r.json(); setProbe(r.ok ? `${d} read ${sc}: ${j.count} record(s)` : `Refused (${r.status}): ${j.error}. This was recorded as evidence.`); };
  return <div className="mb-console mb-category">
    <span className="mb-eyebrow">BRAIN / DEPARTMENT WALLS</span><h1>Department permission walls</h1>
    <p className="mb-muted">Each department agent reads only the data mapped to it. A read outside that is refused and logged in the evidence ledger. Agent memory follows the same walls.</p>
    {error && <p className="mb-alert" role="alert">{error}</p>}
    {probe && <p className="mb-panel" role="status">{probe}</p>}
    {walls && <table className="mb-table"><thead><tr><th>Department</th>{walls[0].scopes.map((x) => <th key={x.scope}>{x.scope}</th>)}</tr></thead>
      <tbody>{walls.map((w) => <tr key={w.department}><th>{w.department}</th>{w.scopes.map((x) => <td key={x.scope}><button aria-label={`Test ${w.department} reading ${x.scope}`} onClick={() => void test(w.department, x.scope)}>{x.allowed ? 'Allowed' : 'Walled'}</button></td>)}</tr>)}</tbody></table>}
  </div>;
}
