import { z } from 'zod';
import { normalizePermissionEntry } from '@/vendor/agentshield/permission-entries';

export type AgentFinding = { rule: string; severity: 'high' | 'medium'; message: string; index: number };
const configSchema = z.object({
  permissions: z.object({ allow: z.array(z.string().max(500)).max(100), deny: z.array(z.string().max(500)).max(100).optional() }).strict(),
}).strict();

/** Limited static review, not the full AgentShield scanner or an authorization engine. */
export function reviewAgentPermissions(value: unknown): AgentFinding[] {
  const { permissions } = configSchema.parse(value);
  const findings: AgentFinding[] = [];
  permissions.allow.forEach((entry, index) => {
    const normalized = normalizePermissionEntry(entry);
    if (/^(Bash|Write|Edit)\(\*\)$/i.test(normalized)) findings.push({ rule: 'unrestricted-tool', severity: 'high', index, message: 'Blanket command or write access needs a narrower scope.' });
    if (/^Bash\((sudo|curl|wget|ssh|scp|nc|bash|sh|python\d*|node|eval|exec)\b/i.test(normalized)) findings.push({ rule: 'powerful-command', severity: 'high', index, message: 'Interpreter, privileged or network command requires explicit review.' });
    if (/\.env\b|printenv|credentials|id_rsa|id_ed25519/i.test(entry)) findings.push({ rule: 'sensitive-access', severity: 'high', index, message: 'Rule may expose environment files or credentials.' });
    if (!/^[A-Za-z]+\(.+\)$/s.test(entry)) findings.push({ rule: 'unsupported-syntax', severity: 'medium', index, message: 'Unsupported permission syntax; inspect manually.' });
  });
  if (!permissions.deny?.length) findings.push({ rule: 'no-deny-rules', severity: 'medium', index: -1, message: 'No explicit deny rules supplied. This review cannot establish effective runtime policy.' });
  return findings;
}
