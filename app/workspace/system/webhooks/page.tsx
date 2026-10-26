import { businessStore } from '@/lib/muzebos/store';
import { WebhookDeliveries, WebhookHeader, WebhookLimits } from '@/components/muzebos/WebhookDeliveries';
export const dynamic = 'force-dynamic';
export default function WebhookListenerPage() {
  return <div className="mb-console mb-category">
    <WebhookHeader title="Webhook Listener Pool" summary="Signature-verified Meta deliveries for WhatsApp, Instagram and Messenger." />
    <WebhookDeliveries deliveries={businessStore().webhookDeliveries()} />
    <WebhookLimits />
  </div>;
}
