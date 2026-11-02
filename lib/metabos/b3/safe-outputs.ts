/**
 * Safe outputs (batch 3 #3): every agent role declares the output types it may produce. Anything else
 * is refused and logged as evidence before it can reach Jev. Pattern idea from gh-aw "safe-outputs"
 * (MIT, GitHub); clean rebuild during the event, no gh-aw code.
 */
import { BusinessError, type BusinessStore } from '../store';
import type { AGENT_ROLES } from '../workflows';
export type Role = typeof AGENT_ROLES[number];
export const OUTPUT_TYPES = ['reminder', 'brain_draft', 'social_post', 'pipeline_draft', 'invoice_draft', 'stock_note'] as const;
export type OutputType = typeof OUTPUT_TYPES[number];
export const SAFE_OUTPUTS: Record<Role, readonly OutputType[]> = {
  writer: ['brain_draft', 'social_post', 'pipeline_draft'],
  operations: ['reminder', 'pipeline_draft'],
  finance: ['invoice_draft', 'reminder'],
  inventory: ['stock_note', 'reminder'],
  customers: ['brain_draft', 'reminder'],
};
export function allowed(role: string, type: string): boolean { return (SAFE_OUTPUTS as Record<string, readonly string[]>)[role]?.includes(type) ?? false; }
/** Throws 422 and appends evidence when the role has not declared this output type. */
export function assertSafeOutput(s: BusinessStore, role: string, type: string, target: string) {
  if (allowed(role, type)) return;
  s.transact(() => s.appendEvidence('ai.output.refused', target, `Role ${role} may not produce ${type}; refused before Jev`));
  throw new BusinessError(`Output refused: role ${role} has not declared ${type}`, 422);
}
