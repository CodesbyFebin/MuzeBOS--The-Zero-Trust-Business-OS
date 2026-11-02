import { HubOverview } from '@/components/metabos/HubOverview';
export default function Page() { return <div className="mb-console mb-category"><span className="mb-eyebrow">AI / JEV</span><h1>Jev approvals & activity</h1><p className="mb-muted">Runs waiting for a person, deadlines and the latest evidence events, read from the hash-chained ledger.</p><HubOverview hub="activity"/></div>; }
