/**
 * Inbound send proposals from Rakazo bots. A bot calls MuZe's propose_send (OpenAPI tool source); MuZe turns it
 * into a pending /api/dispatch record marked "[MUSE plan]", so the existing two-reviewer gate (muse-gate.ts) applies:
 * Reviewer A signs, a different Reviewer B approves, and only then can /api/dispatch run it (DRY_RUN on by default
 * for Meta channels). The bot never sends directly. Evidence rows are written for every proposal.
 */
import { timingSafeEqual, createHash } from 'node:crypto';
import { z } from 'zod';
import type { BusinessStore } from '../store';
import { BusinessError } from '../store';
import { propose } from '../dispatch/service';
export const ProposeSend = z.discriminatedUnion('channel', [
  z.object({ channel: z.literal('whatsapp'), botId: z.string().min(1).max(64), botName: z.string().max(80).default(''), to: z.string().max(20), body: z.string().min(1).max(3800) }).strict(),
  z.object({ channel: z.literal('email'), botId: z.string().min(1).max(64), botName: z.string().max(80).default(''), to: z.string().max(200), subject: z.string().min(1).max(160), body: z.string().min(1).max(19000) }).strict(),
]);
const digest = (v: string) => createHash('sha256').update(v).digest();
/** Shared secret the Rakazo tool source sends in x-muzebos-runtime-secret. Missing secret means the endpoint is closed. */
export function checkSecret(env: Record<string, string | undefined>, presented: string | null) {
  const want = env.RAKAZO_PROPOSAL_SECRET?.trim(); if (!want) throw new BusinessError('Rakazo proposals are closed: RAKAZO_PROPOSAL_SECRET is not set', 503);
  if (!presented || !timingSafeEqual(digest(presented), digest(want))) throw new BusinessError('Unauthorized', 401);
}
export function proposeFromRakazo(s: BusinessStore, raw: unknown) {
  const p = ProposeSend.parse(raw); const tag = `[MUSE plan] [rakazo:${p.botId}]`;
  const d = p.channel === 'whatsapp' ? propose(s, `rakazo:${p.botId}`, 'whatsapp', { to: p.to, body: `${tag} ${p.body}` })
    : propose(s, `rakazo:${p.botId}`, 'email', { to: p.to, subject: p.subject, body: `${tag} ${p.body}` });
  s.transact(() => s.appendEvidence('runtime.rakazo.proposal', d.id, JSON.stringify({ botId: p.botId, botName: p.botName, channel: p.channel, payloadHash: d.payloadHash.slice(0, 12), needs: 'two reviewers' })));
  return { dispatchId: d.id, status: d.status, payloadHash: d.payloadHash, next: 'Two different reviewers must approve in Sanctum before /api/dispatch can run it.' };
}
/** OpenAPI 3.1 document a Rakazo user installs as a tool source. */
export function proposalOpenApi(origin: string) {
  return { openapi: '3.1.0', info: { title: 'MuZe propose_send', version: '1.0.0', description: 'Ask MuZe to send a message. Nothing is sent until two people approve it in MuZe.' }, servers: [{ url: origin }],
    paths: { '/api/runtime/rakazo/propose': { post: { operationId: 'propose_send', summary: 'Propose a WhatsApp or email send for human approval', security: [{ muzeSecret: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: { oneOf: [
        { type: 'object', required: ['channel', 'botId', 'to', 'body'], properties: { channel: { const: 'whatsapp' }, botId: { type: 'string' }, botName: { type: 'string' }, to: { type: 'string', description: 'E.164 phone' }, body: { type: 'string' } } },
        { type: 'object', required: ['channel', 'botId', 'to', 'subject', 'body'], properties: { channel: { const: 'email' }, botId: { type: 'string' }, botName: { type: 'string' }, to: { type: 'string', format: 'email' }, subject: { type: 'string' }, body: { type: 'string' } } }] } } } },
      responses: { '202': { description: 'Recorded as a pending proposal' }, '401': { description: 'Bad secret' }, '422': { description: 'Invalid payload' } } } } },
    components: { securitySchemes: { muzeSecret: { type: 'apiKey', in: 'header', name: 'x-muzebos-runtime-secret' } } } };
}
