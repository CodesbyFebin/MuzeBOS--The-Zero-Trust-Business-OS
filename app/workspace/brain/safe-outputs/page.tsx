import { SAFE_OUTPUTS } from '@/lib/metabos/b3/safe-outputs';
export default function SafeOutputsPage() {
  return <main className="mb-page mb-v3" aria-labelledby="so-h"><h1 id="so-h" className="mb-heading">Safe outputs</h1>
    <p className="mb-muted">Each agent role may only produce the output types listed. Anything else is refused and logged as evidence before it reaches Jev.</p>
    <table><caption className="mb-muted">Declared output types by role</caption><thead><tr><th scope="col">Role</th><th scope="col">Allowed outputs</th></tr></thead>
      <tbody>{Object.entries(SAFE_OUTPUTS).map(([r, o]) => <tr key={r}><td>{r}</td><td>{o.join(', ')}</td></tr>)}</tbody></table>
    <p className="mb-muted">Pattern idea from gh-aw safe-outputs (MIT, GitHub); rebuilt during the event.</p></main>;
}
