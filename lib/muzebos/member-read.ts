import { businessAccess } from './http';
import { businessStore } from './store';
import { requireMember, requirePermission, type Permission } from './biz/accounts';

/**
 * Gate for any read of business records: operator/loopback access (businessAccess)
 * AND a signed-in member of this workspace (401), AND, when given, a role permission (403).
 */
export function memberRead(req: Request, permission?: Permission) {
  businessAccess(req);
  const s = businessStore(); const me = requireMember(s, req);
  if (permission) requirePermission(me, permission);
  return { s, me };
}
