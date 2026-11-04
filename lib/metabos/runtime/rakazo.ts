/**
 * Rakazo adapter (https://github.com/elie222/rakazo, Apache-2.0). Studied at commit 6bba136; no Rakazo code is copied.
 *
 * What Rakazo really exposes (read from its source, not guessed):
 *  - GET /health (public liveness, constant body) and GET /ready (db + degraded check).
 *  - An oRPC API at POST /rpc/<namespace>/<procedure>, body {"json": input}, response {"json": output}.
 *    Procedures used here: bots.list, bots.get {botId}, bots.create {name, description, instructions},
 *    threads.send {botId, text}.
 *  - Auth is a better-auth session. Its bearer plugin accepts `Authorization: Bearer <session token>`.
 *    Rakazo has no long-lived API keys, so RAKAZO_API_KEY must hold a session token from a Rakazo
 *    sign-in, and it expires when that session ends. RAKAZO_SPACE_ID optionally picks a space
 *    (x-rakazo-space-id header).
 *  - Rakazo bots can call user-installed OpenAPI tool sources. MuZe publishes one
 *    (/api/runtime/rakazo/openapi.json) with a single "propose_send" operation, so a Rakazo bot can only
 *    ask MuZe to send. The send becomes a two-reviewer Jev dispatch, and a Rakazo bot is given no send path of its own.
 *
 * None of this has been exercised against a live Rakazo server here; tests use labelled test doubles.
 */
import type { BusinessStore } from '../store';
import { BusinessError } from '../store';
export type Env = Record<string, string | undefined>;
export type RakazoBot = { id: string; name: string; description: string };
export type RakazoConfig = { url: string; token: string; spaceId: string | null };

export function rakazoConfig(env: Env): RakazoConfig | null {
  const url = env.RAKAZO_URL?.trim(); const token = env.RAKAZO_API_KEY?.trim();
  if (!url || !token) return null;
  let u: URL; try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))) return null;
  return { url: u.origin, token, spaceId: env.RAKAZO_SPACE_ID?.trim() || null };
}
export const missingRakazo = (env: Env) => ['RAKAZO_URL', 'RAKAZO_API_KEY'].filter((k) => !env[k]?.trim());

export class RakazoClient {
  constructor(private c: RakazoConfig, private f: typeof fetch = fetch, private timeoutMs = 8000) {}
  private async rpc<T>(proc: string, input?: unknown): Promise<T> {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), this.timeoutMs);
    try {
      const h: Record<string, string> = { 'content-type': 'application/json', authorization: `Bearer ${this.c.token}` };
      if (this.c.spaceId) h['x-rakazo-space-id'] = this.c.spaceId;
      const r = await this.f(`${this.c.url}/rpc/${proc}`, { method: 'POST', headers: h, body: JSON.stringify(input === undefined ? {} : { json: input }), signal: ac.signal });
      // Upstream bodies are never echoed: only the HTTP code reaches the caller.
      if (!r.ok) { try { await r.body?.cancel(); } catch { /* ignore */ } throw new BusinessError(r.status === 401 ? 'Rakazo rejected the session token (sign in again and update RAKAZO_API_KEY)' : `Rakazo ${proc} failed (HTTP ${r.status})`, 502); }
      const j = (await r.json()) as { json?: T }; return j.json as T;
    } catch (e) { if (e instanceof BusinessError) throw e; throw new BusinessError(`Rakazo ${proc}: no response`, 504); } finally { clearTimeout(t); }
  }
  async health(): Promise<{ ok: boolean; code: number | null; ms: number }> {
    const t0 = Date.now(); try { const r = await this.f(`${this.c.url}/ready`, { cache: 'no-store' } as RequestInit); try { await r.body?.cancel(); } catch { /* ignore */ } return { ok: r.ok, code: r.status, ms: Date.now() - t0 }; } catch { return { ok: false, code: null, ms: Date.now() - t0 }; }
  }
  private static bot = (b: { id: string; name: string; description?: string }): RakazoBot => ({ id: String(b.id), name: String(b.name), description: String(b.description ?? '') });
  async listBots() { return ((await this.rpc<{ id: string; name: string; description?: string }[]>('bots/list')) ?? []).map(RakazoClient.bot); }
  async getBot(botId: string) { return RakazoClient.bot(await this.rpc('bots/get', { botId })); }
  async createBot(i: { name: string; description?: string; instructions?: string }) { return RakazoClient.bot(await this.rpc('bots/create', { name: i.name, description: i.description ?? '', instructions: [MUZE_BOT_RULES, i.instructions ?? ''].filter(Boolean).join('\n\n') })); }
  async message(botId: string, text: string) { await this.rpc('threads/send', { botId, text }); return { sent: true as const }; }
}

/** Instructions MuZe gives every bot it creates: no direct sends; use the MuZe propose_send tool. */
export const MUZE_BOT_RULES = 'You run inside MuZe. Never send messages, emails or payments yourself. To send anything outside, call the MuZe tool propose_send; a person approves it in Jev.';

/** Runtime switch, stored in SQLite. 'rakazo' is refused unless Rakazo is configured. */
const ensure = (s: BusinessStore) => s.db.exec("CREATE TABLE IF NOT EXISTS mb_runtime(id TEXT PRIMARY KEY, mode TEXT NOT NULL, updatedAt TEXT NOT NULL)");
export type RuntimeMode = 'local' | 'rakazo';
export function getRuntime(s: BusinessStore): RuntimeMode { ensure(s); const r = s.db.prepare("SELECT mode FROM mb_runtime WHERE id='default'").get() as { mode: RuntimeMode } | undefined; return r?.mode ?? 'local'; }
export function setRuntime(s: BusinessStore, actor: string, mode: RuntimeMode, env: Env): RuntimeMode {
  if (mode !== 'local' && mode !== 'rakazo') throw new BusinessError('Unknown runtime', 400);
  if (mode === 'rakazo' && !rakazoConfig(env)) throw new BusinessError(`Rakazo not configured — add ${missingRakazo(env).join(', ') || 'a valid https RAKAZO_URL'}`, 409);
  ensure(s); s.db.prepare("INSERT INTO mb_runtime VALUES('default',?,?) ON CONFLICT(id) DO UPDATE SET mode=excluded.mode, updatedAt=excluded.updatedAt").run(mode, new Date().toISOString());
  s.appendEvidence('runtime.switch', 'default', JSON.stringify({ by: actor, mode })); return mode;
}
