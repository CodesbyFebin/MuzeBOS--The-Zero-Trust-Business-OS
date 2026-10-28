/**
 * Provider send adapters, checked against the official docs (Oct 2026):
 *  - WhatsApp Cloud API: POST https://graph.facebook.com/v25.0/{phone-number-id}/messages (type "text")
 *  - Razorpay: POST https://api.razorpay.com/v1/payment_links (Basic auth; amount in paise; reference_id unique, max 40)
 *  - OpenRouter: POST https://openrouter.ai/api/v1/chat/completions (Bearer; model chosen by lib/metabos/ai/router)
 *  - Instagram DM (Instagram API with Instagram Login): POST https://graph.instagram.com/v25.0/me/messages {recipient:{id:IGSID},message:{text}} (text <= 1000 bytes)
 *  - SMTP: nodemailer transport (host/port/user/password)
 * Each adapter is pure over an injected fetch / transport so it can be unit-tested without the network.
 */
import { z } from 'zod';
import nodemailer from 'nodemailer';
import { route } from '../ai/router';

export type Env = Record<string, string | undefined>;
export type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ status: number; ok: boolean; text(): Promise<string> }>;
export type MailTransport = { sendMail(m: { from: string; to: string; subject: string; text: string; headers: Record<string, string> }): Promise<{ messageId?: string; response?: string; accepted?: unknown[]; rejected?: unknown[] }> };
export type Deps = { env: Env; fetch: Fetch; mail?: (opts: { host: string; port: number; secure: boolean; auth: { user: string; pass: string } }) => MailTransport };
export type AdapterResult = { ok: boolean; status: number; providerRef: string | null; evidence: string };
export class NotConnected extends Error { constructor(public missing: string[]) { super(`Not connected — add ${missing.join(', ')}`); } }

export const CHANNELS = {
  whatsapp: { env: ['MUZEBOS_WHATSAPP_CLOUD_ACCESS_TOKEN', 'MUZEBOS_WHATSAPP_PHONE_NUMBER_ID'], schema: z.object({ to: z.string().regex(/^\+?[1-9]\d{6,14}$/, 'E.164 phone number'), body: z.string().trim().min(1).max(4096) }).strict() },
  instagram: { env: ['MUZEBOS_INSTAGRAM_ACCESS_TOKEN'], schema: z.object({ to: z.string().regex(/^\d{5,30}$/, 'Instagram-scoped user id (IGSID)'), body: z.string().trim().min(1).refine((b) => Buffer.byteLength(b, 'utf8') <= 1000, 'Instagram text is limited to 1000 bytes') }).strict() },
  email: { env: ['MUZEBOS_SMTP_HOST', 'MUZEBOS_SMTP_PORT', 'MUZEBOS_SMTP_USER', 'MUZEBOS_SMTP_PASSWORD', 'MUZEBOS_SMTP_FROM'], schema: z.object({ to: z.string().trim().email().max(200), subject: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(20000) }).strict() },
  'payment-link': { env: ['MUZEBOS_RAZORPAY_KEY_ID', 'MUZEBOS_RAZORPAY_KEY_SECRET'], schema: z.object({ amount: z.number().int().min(100).max(50_000_000_00), description: z.string().trim().min(1).max(2048), customerName: z.string().trim().min(1).max(120), customerEmail: z.string().trim().email().max(200).optional(), customerContact: z.string().regex(/^\+?\d{8,14}$/).optional() }).strict() },
  completion: { env: ['OPENROUTER_API_KEY'], schema: z.object({ prompt: z.string().trim().min(1).max(8000), tier: z.enum(['auto', 'small', 'medium', 'large']).default('auto'), maxTokens: z.number().int().min(1).max(1000).default(400) }).strict() },
} as const;
export type Channel = keyof typeof CHANNELS;
export type Payload<C extends Channel> = z.infer<(typeof CHANNELS)[C]['schema']>;

export function missingEnv(channel: Channel, env: Env) { return CHANNELS[channel].env.filter((k) => !env[k]); }
function need(channel: Channel, env: Env) { const m = missingEnv(channel, env); if (m.length) throw new NotConnected(m); }
const clip = (t: string) => t.slice(0, 4000);
const json = (t: string) => { try { return JSON.parse(t); } catch { return null; } };
const timeout = () => AbortSignal.timeout(15_000);

async function whatsapp(p: Payload<'whatsapp'>, key: string, d: Deps): Promise<AdapterResult> {
  const r = await d.fetch(`https://graph.facebook.com/v25.0/${encodeURIComponent(d.env.MUZEBOS_WHATSAPP_PHONE_NUMBER_ID!)}/messages`, {
    method: 'POST', signal: timeout(),
    headers: { authorization: `Bearer ${d.env.MUZEBOS_WHATSAPP_CLOUD_ACCESS_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: p.to, type: 'text', text: { preview_url: false, body: p.body }, biz_opaque_callback_data: key }),
  });
  const t = await r.text(); const j = json(t);
  return { ok: r.ok, status: r.status, providerRef: j?.messages?.[0]?.id ?? null, evidence: clip(t) };
}
async function instagram(p: Payload<'instagram'>, _key: string, d: Deps): Promise<AdapterResult> {
  const r = await d.fetch('https://graph.instagram.com/v25.0/me/messages', {
    method: 'POST', signal: timeout(),
    headers: { authorization: `Bearer ${d.env.MUZEBOS_INSTAGRAM_ACCESS_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ recipient: { id: p.to }, message: { text: p.body } }),
  });
  const t = await r.text(); const j = json(t);
  return { ok: r.ok, status: r.status, providerRef: j?.message_id ?? null, evidence: clip(t) };
}
async function paymentLink(p: Payload<'payment-link'>, key: string, d: Deps): Promise<AdapterResult> {
  const auth = Buffer.from(`${d.env.MUZEBOS_RAZORPAY_KEY_ID}:${d.env.MUZEBOS_RAZORPAY_KEY_SECRET}`).toString('base64');
  const customer = { name: p.customerName, ...(p.customerEmail ? { email: p.customerEmail } : {}), ...(p.customerContact ? { contact: p.customerContact } : {}) };
  const r = await d.fetch('https://api.razorpay.com/v1/payment_links', {
    method: 'POST', signal: timeout(),
    headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' },
    // reference_id must be unique per link: Razorpay rejects a repeat, so the idempotency key doubles as provider-side dedupe.
    body: JSON.stringify({ amount: p.amount, currency: 'INR', reference_id: key.slice(0, 40), description: p.description, customer, notify: { sms: false, email: false }, reminder_enable: false }),
  });
  const t = await r.text(); const j = json(t);
  return { ok: r.ok, status: r.status, providerRef: j?.id ? `${j.id} ${j.short_url ?? ''}`.trim() : null, evidence: clip(t) };
}
async function completion(p: Payload<'completion'>, key: string, d: Deps): Promise<AdapterResult> {
  const decision = route(p.prompt, p.tier, { webgpu: false, states: { openrouter: 'ready' } });
  if (!decision.chosen || decision.chosen.provider !== 'openrouter') return { ok: false, status: 0, providerRef: null, evidence: `Router chose no OpenRouter model: ${decision.reasons.join(' ')}` };
  const r = await d.fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', signal: timeout(),
    headers: { authorization: `Bearer ${d.env.OPENROUTER_API_KEY}`, 'content-type': 'application/json', 'X-OpenRouter-Title': 'MuzeBOS' },
    body: JSON.stringify({ model: decision.chosen.model, messages: [{ role: 'user', content: p.prompt }], max_tokens: p.maxTokens, user: key }),
  });
  const t = await r.text(); const j = json(t);
  return { ok: r.ok, status: r.status, providerRef: j?.id ?? null, evidence: clip(JSON.stringify({ model: decision.chosen.model, reasons: decision.reasons, response: j ?? t })) };
}
async function email(p: Payload<'email'>, key: string, d: Deps): Promise<AdapterResult> {
  const port = Number(d.env.MUZEBOS_SMTP_PORT);
  const make = d.mail ?? ((o) => nodemailer.createTransport(o) as unknown as MailTransport);
  const transport = make({ host: d.env.MUZEBOS_SMTP_HOST!, port, secure: port === 465, auth: { user: d.env.MUZEBOS_SMTP_USER!, pass: d.env.MUZEBOS_SMTP_PASSWORD! } });
  try {
    const info = await transport.sendMail({ from: d.env.MUZEBOS_SMTP_FROM!, to: p.to, subject: p.subject, text: p.body, headers: { 'X-MuzeBOS-Idempotency-Key': key } });
    const ok = !(info.rejected?.length);
    return { ok, status: ok ? 250 : 550, providerRef: info.messageId ?? null, evidence: clip(JSON.stringify({ response: info.response ?? null, accepted: info.accepted ?? [], rejected: info.rejected ?? [] })) };
  } catch (e) { return { ok: false, status: 0, providerRef: null, evidence: `SMTP error: ${e instanceof Error ? e.message.slice(0, 300) : 'unknown'}` }; }
}

export async function runAdapter(channel: Channel, payload: unknown, key: string, d: Deps): Promise<AdapterResult> {
  need(channel, d.env);
  const p = CHANNELS[channel].schema.parse(payload);
  switch (channel) {
    case 'whatsapp': return whatsapp(p as Payload<'whatsapp'>, key, d);
    case 'email': return email(p as Payload<'email'>, key, d);
    case 'payment-link': return paymentLink(p as Payload<'payment-link'>, key, d);
    case 'instagram': return instagram(p as Payload<'instagram'>, key, d);
    case 'completion': return completion(p as Payload<'completion'>, key, d);
  }
}
