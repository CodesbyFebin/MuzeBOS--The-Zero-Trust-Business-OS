/** Judge demo path. Everything here is either a real record the owner creates by clicking, or a
 *  clearly labelled FIXTURE. Fixtures are stored with kind='fixture', an externalId starting with
 *  'fixture:', a reserved +91 00000 number and the name "Fixture lead (demo)", so they can never be
 *  mistaken for a real customer. The drafted reply is a fixed template, not model output.
 *  Sending still goes through approveReply -> Jev decide (payload hash) -> POST /api/dispatch. */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { BusinessError, type BusinessStore } from '../store';
import { conversationFor, ensureTalk } from '../talk/core';
import { missingEnv, type Env } from '../dispatch/adapters';

export const FIXTURE_ADDRESS = '+910000000000';
export const FIXTURE_NAME = 'Fixture lead (demo)';
export const FIXTURE_BODY = 'Hi, do you do pickups this week? (FIXTURE — demo message, not a real customer)';
export const fixturesEnabled = (env: Env) => env.MUZE_DEMO_FIXTURES !== 'off';
/** Template reply. Labelled as a template so it is never presented as model output. */
export const templateDraft = (brand: string) => `Hi! Thanks for messaging ${brand}. Yes, we can help this week. What day and area suits you? — ${brand} team`;

export const DemoInput = z.discriminatedUnion('action', [
  z.object({ action: z.literal('status') }).strict(),
  z.object({ action: z.literal('fixtureLead') }).strict(),
  z.object({ action: z.literal('draft'), conversationId: z.string().min(1).max(80), brand: z.string().trim().min(1).max(80) }).strict(),
  z.object({ action: z.literal('held'), dispatchId: z.string().uuid(), reason: z.string().max(300) }).strict(),
]);

export function demoStatus(s: BusinessStore, env: Env) {
  ensureTalk(s);
  const real = s.db.prepare("SELECT COUNT(*) n FROM mb_messages m JOIN mb_conversations c ON c.id=m.conversationId WHERE c.channel='whatsapp' AND m.direction='in' AND m.kind<>'fixture'").get() as { n: number };
  const wa = missingEnv('whatsapp', env);
  return { whatsappSend: wa.length ? `Not connected — add ${wa.join(', ')}` : 'Configured (env vars present; not a delivery claim)',
    webhook: env.META_APP_SECRET && env.META_VERIFY_TOKEN ? 'Webhook env present' : 'Webhook not configured — the demo uses a labelled fixture lead', realInbound: real.n, fixtures: fixturesEnabled(env) };
}
export function fixtureLead(s: BusinessStore, actor: string, env: Env) {
  if (!fixturesEnabled(env)) throw new BusinessError('Demo fixtures are off (MUZE_DEMO_FIXTURES=off)', 403);
  const c = conversationFor(s, 'whatsapp', FIXTURE_ADDRESS, FIXTURE_NAME); const at = new Date().toISOString(); const id = randomUUID();
  s.transact(() => {
    s.db.prepare("INSERT INTO mb_messages(id,conversationId,direction,author,body,kind,externalId,at) VALUES(?,?,'in','customer',?,'fixture',?,?)").run(id, c.id, FIXTURE_BODY, `fixture:${id}`, at);
    s.db.prepare('UPDATE mb_conversations SET lastInboundAt=?, updatedAt=? WHERE id=?').run(at, at, c.id);
    s.appendEvidence('demo.fixture.inbound', c.id, `FIXTURE WhatsApp message inserted by ${actor} for the judge demo; not a webhook delivery`);
  });
  return { conversationId: c.id, messageId: id, fixture: true };
}
export function draftReply(s: BusinessStore, actor: string, conversationId: string, brand: string) {
  ensureTalk(s); if (!s.db.prepare('SELECT 1 FROM mb_conversations WHERE id=?').get(conversationId)) throw new BusinessError('Conversation not found', 404);
  const body = templateDraft(brand);
  s.transact(() => s.appendEvidence('demo.draft.template', conversationId, `Template draft prepared for ${actor}; not model output; not sent`));
  return { body, source: 'template' as const };
}
export function recordHeld(s: BusinessStore, actor: string, dispatchId: string, reason: string) {
  s.transact(() => s.appendEvidence('demo.dispatch.held', dispatchId, `Approved but not sent: ${reason.slice(0, 200)} (${actor})`));
  return { ok: true };
}
