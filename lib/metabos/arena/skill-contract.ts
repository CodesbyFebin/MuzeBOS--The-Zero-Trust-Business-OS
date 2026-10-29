import { z } from 'zod';

/** Independent MeTaBos exchange format. Not a Refly runtime or executable skill script. */
export const SkillManifest = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^[a-z][a-z0-9-]{2,63}$/),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(300),
  tags: z.array(z.string().trim().min(1).max(30)).max(8),
  approval: z.literal('jev-exact-hash'),
  tools: z.tuple([z.literal('inference.draft')]),
  steps: z.array(z.object({
    name: z.string().trim().min(1).max(100), kind: z.enum(['draft', 'analysis', 'plan', 'code']),
    instructions: z.string().trim().min(1).max(2000),
    lane: z.enum(['browser', 'ollama']), maxTokens: z.number().int().min(32).max(512),
  }).strict()).min(1).max(5),
}).strict();
export type SkillManifest = z.infer<typeof SkillManifest>;
export type SkillVersion = { id: string; version: number; hash: string; manifest: SkillManifest; createdBy: string; createdAt: string };

export const STARTER_SKILLS: SkillManifest[] = [
  { schemaVersion: 1, id: 'invoice-review', name: 'Invoice review draft', description: 'Review merchant-supplied invoice context and list discrepancies. Does not issue invoices or verify payments.', tags: ['finance', 'review'], approval: 'jev-exact-hash', tools: ['inference.draft'], steps: [{ name: 'Review supplied invoice', kind: 'analysis', lane: 'browser', maxTokens: 256, instructions: 'Review only the supplied invoice text. Check quantities, arithmetic and missing fields. List uncertainties. Do not claim tax compliance or bank verification. Return a review draft for the merchant.' }] },
  { schemaVersion: 1, id: 'customer-reply', name: 'Customer reply draft', description: 'Draft a reply from the context supplied by the merchant. Never sends a message.', tags: ['talk'], approval: 'jev-exact-hash', tools: ['inference.draft'], steps: [{ name: 'Draft reply', kind: 'draft', lane: 'browser', maxTokens: 256, instructions: 'Draft a concise customer reply using supplied facts only. Flag any missing delivery, pricing or stock information. Never claim a message was sent.' }] },
  { schemaVersion: 1, id: 'incident-review', name: 'Incident review draft', description: 'Summarize supplied incident evidence and suggest a checklist. No self-healing execution.', tags: ['operations'], approval: 'jev-exact-hash', tools: ['inference.draft'], steps: [{ name: 'Review incident', kind: 'plan', lane: 'browser', maxTokens: 256, instructions: 'Summarize the supplied incident evidence and propose a recovery checklist. Separate observation from inference. Do not execute commands or claim a recovery happened.' }] },
];
