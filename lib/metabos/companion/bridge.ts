import { z } from 'zod';
import { COMPANION_DESTINATIONS } from './destinations';
const targets = Object.keys(COMPANION_DESTINATIONS) as [keyof typeof COMPANION_DESTINATIONS, ...Array<keyof typeof COMPANION_DESTINATIONS>];
/** Only these UI intents cross the opaque-origin iframe boundary. No URLs, approvals or executable tools. */
export const CompanionIntent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('navigate'), target: z.enum(targets) }).strict(),
  z.object({ type: z.literal('status') }).strict(),
  z.object({ type: z.literal('draft'), text: z.string().trim().min(3).max(12000) }).strict(),
]);
export function readCompanionMessage(raw: unknown, channel: string) {
  const envelope = z.object({ protocol: z.literal('muze-argon/v1'), channel: z.string().uuid(), intent: CompanionIntent }).strict().safeParse(raw);
  return envelope.success && envelope.data.channel === channel ? envelope.data.intent : null;
}
