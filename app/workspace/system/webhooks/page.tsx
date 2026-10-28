import { businessStore } from '@/lib/metabos/store';
import { WebhookDeliveries, WebhookHeader, WebhookLimits } from '@/components/metabos/WebhookDeliveries';
export const dynamic = 'force-dynamic';
export default function WebhookListenerPage() {
  return <div className="mb-console mb-category">
    <WebhookHeader title="Webhook Listener Pool" summary="Signature-verified Meta deliveries for WhatsApp, Instagram and Messenger." />
    <WebhookDeliveries deliveries={businessStore().webhookDeliveries()} />
    <WebhookLimits />
  </div>;
}
