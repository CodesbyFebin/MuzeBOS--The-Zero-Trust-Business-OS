/**
 * MUSE voice command routing. Ported from the owner's pre-existing "Miri" standalone HTML (AI Studio build, see THIRD_PARTY.md),
 * renamed to MUSE. The original answered every command with a canned line; here a command only ever resolves to:
 *  - local: boop / coat / scene, handled in the browser by the fur engine (nothing leaves the page)
 *  - view: open a Business Open Server section (navigation only)
 *  - send: draft through /api/ai, then a two-reviewer Jev approval via /api/bos, then /api/dispatch
 *  - ask: a question for the inference router via /api/ai ("Model not configured" when none is set)
 */
import { parseMuseCommand, type MuseCommand } from '../fur-sim/voiceCommands';
export const BOS_VIEWS = ['office', 'sanctum', 'hq', 'operator', 'discord', 'mcp', 'trust', 'verify'] as const;
export type BosView = (typeof BOS_VIEWS)[number];
export type MuseRoute =
  | { kind: 'local'; command: MuseCommand }
  | { kind: 'view'; view: BosView }
  | { kind: 'send'; channel: 'whatsapp' | 'instagram'; text: string }
  | { kind: 'ask'; text: string }
  | { kind: 'empty' };
const VIEW_WORDS: [RegExp, BosView][] = [
  [/\b(trust|r0|r6|governance|kill switch)/, 'trust'], [/\b(verify|verification|proof|pipeline)\b/, 'verify'], [/\b(mcp|directory|tools?)\b/, 'mcp'],
  [/\b(office|desks?|agents?)\b/, 'office'], [/\b(hq|headquarters|audit|evidence|receipts?)\b/, 'hq'], [/\b(operator|console|metapen)\b/, 'operator'], [/\b(channels?|discord)\b/, 'discord'],
];
export function routeMuseVoice(raw: string): MuseRoute {
  const text = raw.trim().slice(0, 600); if (!text) return { kind: 'empty' };
  const local = parseMuseCommand(text); if (local) return { kind: 'local', command: local };
  const t = text.toLowerCase();
  if (/^(open|show|go to|switch to|take me to)\b/.test(t)) for (const [re, view] of VIEW_WORDS) if (re.test(t)) return { kind: 'view', view };
  if (/\b(send|message|tell|reply|dm|whatsapp|notify|remind)\b/.test(t) && !/\?\s*$/.test(t)) return { kind: 'send', channel: /\b(instagram|dm|ig)\b/.test(t) ? 'instagram' : 'whatsapp', text };
  return { kind: 'ask', text };
}
/** What MUSE may say aloud: only real model text or a plain status. Never a canned "done". */
export function spokenFor(route: MuseRoute, reply: string | null): string {
  if (route.kind === 'ask' || route.kind === 'send') return reply ?? 'Model not configured. No reply was generated.';
  return '';
}
