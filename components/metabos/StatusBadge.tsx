import { STATUS_LABEL, type FeatureStatus } from '@/lib/metabos/registry';
export function StatusBadge({ status }: { status: FeatureStatus }) {
  return <span className={`mb-status mb-status-${status}`} data-status={status}>{STATUS_LABEL[status]}</span>;
}
export function StatusDot({ status }: { status: FeatureStatus }) {
  return <span className={`mb-status-dot mb-status-${status}`} role="img" aria-label={STATUS_LABEL[status]} title={STATUS_LABEL[status]} />;
}
