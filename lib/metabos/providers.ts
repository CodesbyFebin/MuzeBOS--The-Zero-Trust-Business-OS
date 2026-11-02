import net from 'node:net';
import { BusinessError, type BusinessStore } from './store';
import { moduleById } from './modules';
import type { ProviderSpec } from './modules/types';
/**
 * Provider configuration is stored as environment-variable *references* only. Values are read
 * from process.env at test time and are never stored, logged or returned.
 */
export const REF_RE = /^[A-Z][A-Z0-9_]{1,63}$/;
export type SecretState = { key: string; label: string; ref: string; isSet: boolean };
export type TestResult = { status: 'ok' | 'failed' | 'not-configured' | 'no-live-test'; message: string; at: string };
export type ProviderConfig = { module: string; name: string; tester: string; note?: string; secrets: SecretState[]; configured: boolean; lastTest: TestResult | null };
type Env = Record<string, string | undefined>;
type Fetch = (url: string, init?: RequestInit) => Promise<{ status: number; ok: boolean }>;
function ensure(store: BusinessStore) {
  store.db.exec('CREATE TABLE IF NOT EXISTS mb_provider_config(module TEXT NOT NULL, field TEXT NOT NULL, envRef TEXT NOT NULL, updatedAt TEXT NOT NULL, PRIMARY KEY(module, field))');
}
function spec(module: string): ProviderSpec {
  const p = moduleById(module)?.provider;
  if (!p) throw new BusinessError('Not a provider page', 404);
  return p;
}
export function providerConfig(store: BusinessStore, module: string, env: Env = process.env): ProviderConfig {
  const p = spec(module); ensure(store);
  const rows = store.db.prepare('SELECT field, envRef FROM mb_provider_config WHERE module = ?').all(module) as { field: string; envRef: string }[];
  const map = new Map(rows.map((r) => [r.field, r.envRef]));
  const secrets = p.secrets.map((s) => { const ref = map.get(s.key) ?? s.ref; return { key: s.key, label: s.label, ref, isSet: Boolean(env[ref]) }; });
  const last = map.get('__lastTest');
  return { module, name: p.name, tester: p.tester, ...(p.note ? { note: p.note } : {}), secrets, configured: secrets.every((s) => s.isSet), lastTest: last ? JSON.parse(last) as TestResult : null };
}
export function setRef(store: BusinessStore, module: string, field: string, ref: string) {
  const p = spec(module); ensure(store);
  const s = p.secrets.find((x) => x.key === field);
  if (!s) throw new BusinessError('Unknown credential field', 422);
  if (!REF_RE.test(ref)) throw new BusinessError('Reference must be an environment variable name (A-Z, 0-9, _)', 422);
  if (!ref.startsWith('MUZEBOS_') && ref !== s.ref) throw new BusinessError('Reference must start with MUZEBOS_ (or be the provider default)', 422);
  store.transact(() => {
    store.db.prepare('INSERT INTO mb_provider_config(module, field, envRef, updatedAt) VALUES(?,?,?,?) ON CONFLICT(module, field) DO UPDATE SET envRef = excluded.envRef, updatedAt = excluded.updatedAt').run(module, field, ref, new Date().toISOString());
    store.appendEvidence('provider.ref', module, `${field} -> ${ref}`);
  });
  return providerConfig(store, module);
}
function smtpProbe(host: string, port: number, ms: number) {
  return new Promise<string>((resolve, reject) => {
    const sock = net.connect({ host, port, timeout: ms });
    sock.once('data', (b) => { sock.destroy(); resolve(b.toString('utf8').slice(0, 3)); });
    sock.once('timeout', () => { sock.destroy(); reject(new Error('timeout')); });
    sock.once('error', (e) => reject(e));
  });
}
export async function testConnection(store: BusinessStore, module: string, opts: { env?: Env; fetch?: Fetch; timeoutMs?: number } = {}): Promise<TestResult> {
  const env = opts.env ?? process.env, doFetch = opts.fetch ?? (fetch as unknown as Fetch), ms = opts.timeoutMs ?? 8000;
  const cfg = providerConfig(store, module, env);
  const at = new Date().toISOString();
  let result: TestResult;
  if (cfg.tester === 'none') result = { status: 'no-live-test', message: cfg.note ?? 'No live test exists for this provider.', at };
  else if (!cfg.configured) result = { status: 'not-configured', message: `Not connected — add ${cfg.secrets.filter((s) => !s.isSet).map((s) => s.ref).join(', ')}`, at };
  else {
    const v = (k: string) => env[cfg.secrets.find((s) => s.key === k)!.ref]!;
    const signal = AbortSignal.timeout(ms);
    try {
      let code: number;
      if (cfg.tester === 'smtp') {
        const banner = await smtpProbe(v('host'), Number(v('port')), ms);
        result = banner === '220' ? { status: 'ok', message: 'SMTP server answered 220 (TCP reachability only; credentials not exercised)', at } : { status: 'failed', message: `SMTP banner ${banner}`, at };
      } else {
        const req: Record<string, () => [string, RequestInit]> = {
          'meta-graph': () => [`https://graph.facebook.com/v25.0/me?fields=id`, { headers: { authorization: `Bearer ${v('access_token')}` } }],
          razorpay: () => ['https://api.razorpay.com/v1/payments?count=1', { headers: { authorization: `Basic ${Buffer.from(`${v('key_id')}:${v('key_secret')}`).toString('base64')}` } }],
          cloudflare: () => ['https://api.cloudflare.com/client/v4/user/tokens/verify', { headers: { authorization: `Bearer ${v('api_token')}` } }],
          'meta-model': () => ['https://api.meta.ai/v1/models', { headers: { authorization: `Bearer ${v('api_key')}` } }],
          openrouter: () => ['https://openrouter.ai/api/v1/key', { headers: { authorization: `Bearer ${v('api_key')}` } }],
          http: () => [v('base_url'), { headers: { authorization: `Bearer ${v('api_key')}` } }],
        };
        const [url, init] = req[cfg.tester]();
        if (!/^https:\/\//.test(url)) throw new BusinessError('Base URL must be https', 422);
        code = (await doFetch(url, { ...init, method: 'GET', signal, redirect: 'manual' })).status;
        result = code >= 200 && code < 300 ? { status: 'ok', message: cfg.tester === 'meta-model' ? `Key accepted: GET /v1/models answered HTTP ${code}. This does not check billing; a 402 on completions shows as Billing not set up.` : `${cfg.name} answered HTTP ${code}`, at } : { status: 'failed', message: `${cfg.name} answered HTTP ${code}${code === 401 || code === 403 ? ' (credentials rejected)' : ''}`, at };
      }
    } catch (e) { result = { status: 'failed', message: e instanceof BusinessError ? e.message : `Connection failed (${e instanceof Error ? e.name : 'error'})`, at }; }
  }
  ensure(store);
  store.transact(() => {
    store.db.prepare('INSERT INTO mb_provider_config(module, field, envRef, updatedAt) VALUES(?,?,?,?) ON CONFLICT(module, field) DO UPDATE SET envRef = excluded.envRef, updatedAt = excluded.updatedAt').run(module, '__lastTest', JSON.stringify(result), at);
    store.appendEvidence('provider.test', module, result.status);
  });
  return result;
}
