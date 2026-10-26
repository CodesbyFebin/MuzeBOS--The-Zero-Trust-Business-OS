import Link from 'next/link';
import type { WebhookDelivery } from '@/lib/muzebos/store';
import { WEBHOOK_SOURCES } from '@/lib/muzebos/webhooks';
import { StatusBadge } from '@/components/muzebos/StatusBadge';

/** Signature-verified deliveries, newest first. Payloads stay in the database; only their hashes are shown. */
export function WebhookDeliveries({ deliveries }: { deliveries: WebhookDelivery[] }) {
  return <section className="mb-panel" aria-labelledby="mb-wh-log">
    <h2 id="mb-wh-log">Recent deliveries</h2>
    {deliveries.length === 0
      ? <p className="mb-muted">No signature-verified deliveries yet. Meta posts to {WEBHOOK_SOURCES.map((s) => `/api/webhooks/${s}`).join(', ')}.</p>
      : <table className="mb-table"><thead><tr><th scope="col">Received</th><th scope="col">Source</th><th scope="col">Events</th><th scope="col">New</th><th scope="col">Body SHA-256</th></tr></thead>
        <tbody>{deliveries.map((d) => <tr key={d.id}><td>{d.receivedAt}</td><td>{d.source}</td><td>{d.eventCount}</td><td>{d.newEvents === 0 ? 'duplicate' : d.newEvents}</td><td><code>{d.bodyHash.slice(0, 16)}…</code></td></tr>)}</tbody></table>}
  </section>;
}

export function WebhookHeader({ title, summary }: { title: string; summary: string }) {
  return <header className="mb-heading"><div><span className="mb-eyebrow">SYSTEM / META WEBHOOKS</span><h1>{title}</h1><p>{summary}</p></div><StatusBadge status="available" /></header>;
}

export const WebhookLimits = () => <section className="mb-panel"><h2>Limits</h2><ul className="mb-help-list">
  <li>Events are stored, not processed: nothing replies, routes or sends messages.</li>
  <li>Payloads are stored unredacted and there is no retention setting yet.</li>
  <li>Single workspace: every delivery is recorded in this instance&apos;s one business store.</li>
  <li><Link className="mb-link" href="/workspace/evidence/commerce-ledger">Each delivery writes an audit event</Link>.</li></ul></section>;
