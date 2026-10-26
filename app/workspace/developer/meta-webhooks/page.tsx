import { businessStore } from '@/lib/muzebos/store';
import { metaWebhookConfig, WEBHOOK_SOURCES } from '@/lib/muzebos/webhooks';
import { WebhookDeliveries, WebhookHeader, WebhookLimits } from '@/components/muzebos/WebhookDeliveries';
export const dynamic = 'force-dynamic';
/** Integration status: booleans for each variable, never its value. */
export default function MetaWebhookStatusPage() {
  const c = metaWebhookConfig();
  const row = (name: string, set: boolean, why: string) => <tr key={name}><td><code>{name}</code></td><td>{set ? 'Set' : 'Not set'}</td><td>{why}</td></tr>;
  return <div className="mb-console mb-category">
    <WebhookHeader title="Meta webhook status" summary={c.appSecret && c.verifyToken ? 'Configured. The receiver accepts signed deliveries.' : 'Requires configuration. Until both variables are set the receiver answers 503 and stores nothing.'} />
    <section className="mb-panel"><h2>Configuration</h2><table className="mb-table"><thead><tr><th scope="col">Variable</th><th scope="col">State</th><th scope="col">Used for</th></tr></thead><tbody>
      {row('META_APP_SECRET', c.appSecret, 'HMAC-SHA256 check of X-Hub-Signature-256 on every POST')}
      {row('META_VERIFY_TOKEN', c.verifyToken, 'GET subscription handshake (hub.verify_token)')}</tbody></table>
      <h2>Endpoints</h2><ul className="mb-help-list">{WEBHOOK_SOURCES.map((s) => <li key={s}><code>/api/webhooks/{s}</code></li>)}</ul></section>
    <WebhookDeliveries deliveries={businessStore().webhookDeliveries(20)} />
    <WebhookLimits />
  </div>;
}
