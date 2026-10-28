/**
 * Jev: the deterministic approval gate for AI agents, built on the governed workflow engine.
 * Agents call propose() only. Approval is a separate human action (WorkflowEngine.approve with the
 * exact payload hash, sent from the Brain UI); this module has no approve or execute function.
 */
import { BusinessError, type BusinessStore } from '../store';
import { AgentProposalSchema, JEV_AGENT_WRITE, WorkflowEngine } from '../workflows';

export function propose(store: BusinessStore, raw: unknown) {
  const r = AgentProposalSchema.safeParse(raw);
  if (!r.success) {
    const reason = r.error.issues.map((i) => `${i.path.join('.') || 'proposal'} ${i.message}`).join('; ').slice(0, 400);
    store.transact(() => store.appendEvidence('ai.proposal.refused', 'jev', reason));
    throw new BusinessError(`Proposal refused by Jev: ${reason}`, 422);
  }
  return new WorkflowEngine(store).start(JEV_AGENT_WRITE.id, r.data);
}

export function queue(store: BusinessStore) {
  const e = new WorkflowEngine(store);
  return e.runs(200).filter((r) => r.workflowId === JEV_AGENT_WRITE.id).map((r) => ({ ...r, steps: e.steps(r.id), events: e.events(r.id) }));
}
