/**
 * Per-agent spend metering for completion dispatches. Usage and cost come from the provider response
 * (OpenRouter `usage.cost`, USD), stored as integer micro-USD. No estimate is invented when the provider omits cost.
 * Pattern idea: open-agents-builder (MIT) per-agent usage; clean-room.
 */
import { BusinessError, type BusinessStore } from '../store';
import type { Usage } from '../dispatch/adapters';

export function ensureMetering(s: BusinessStore) {
  s.db.exec(`CREATE TABLE IF NOT EXISTS mb_agents(code TEXT PRIMARY KEY, name TEXT NOT NULL, monthlyCapMicroUsd INTEGER NOT NULL, createdBy TEXT NOT NULL, createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS mb_agent_dispatches(dispatchId TEXT PRIMARY KEY, agentCode TEXT NOT NULL, tier TEXT NOT NULL, routedModel TEXT, routeReasons TEXT NOT NULL, createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS mb_agent_usage(dispatchId TEXT PRIMARY KEY, agentCode TEXT, model TEXT NOT NULL, promptTokens INTEGER NOT NULL, completionTokens INTEGER NOT NULL, costMicroUsd INTEGER, at TEXT NOT NULL);`);
}
export function meterDispatch(s: BusinessStore, dispatchId: string, u: Usage) {
  ensureMetering(s);
  const link = s.db.prepare('SELECT agentCode FROM mb_agent_dispatches WHERE dispatchId=?').get(dispatchId) as { agentCode: string } | undefined;
  s.db.prepare('INSERT OR IGNORE INTO mb_agent_usage VALUES(?,?,?,?,?,?,?)').run(dispatchId, link?.agentCode ?? null, u.model, u.promptTokens, u.completionTokens, u.costMicroUsd, new Date().toISOString());
}
const monthStart = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
export function agentSpend(s: BusinessStore, code: string, now = new Date()) {
  ensureMetering(s);
  const r = s.db.prepare('SELECT COUNT(*) calls, COALESCE(SUM(promptTokens),0) prompt, COALESCE(SUM(completionTokens),0) completion, COALESCE(SUM(costMicroUsd),0) cost, SUM(costMicroUsd IS NULL) unpriced FROM mb_agent_usage WHERE agentCode=? AND at>=?').get(code, monthStart(now)) as { calls: number; prompt: number; completion: number; cost: number; unpriced: number | null };
  return { ...r, unpriced: r.unpriced ?? 0 };
}
export function upsertAgent(s: BusinessStore, actor: string, code: string, name: string, monthlyCapMicroUsd: number) {
  ensureMetering(s);
  if (!/^[a-z][a-z0-9-]{1,39}$/.test(code)) throw new BusinessError('Agent code: lowercase letters, digits, dashes', 422);
  if (!Number.isSafeInteger(monthlyCapMicroUsd) || monthlyCapMicroUsd < 0) throw new BusinessError('Monthly cap must be whole micro-USD', 422);
  s.db.prepare('INSERT INTO mb_agents VALUES(?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET name=excluded.name, monthlyCapMicroUsd=excluded.monthlyCapMicroUsd').run(code, name.slice(0, 80), monthlyCapMicroUsd, actor, new Date().toISOString());
  s.appendEvidence('brain.agent-cap-set', code, `${name}: monthly cap ${monthlyCapMicroUsd} micro-USD by ${actor}`);
}
export function listAgents(s: BusinessStore) {
  ensureMetering(s);
  return (s.db.prepare('SELECT * FROM mb_agents ORDER BY code').all() as { code: string; name: string; monthlyCapMicroUsd: number }[]).map((a) => ({ ...a, month: agentSpend(s, a.code) }));
}
