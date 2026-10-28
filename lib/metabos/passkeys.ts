/**
 * WebAuthn passkeys with @simplewebauthn/server: a signed-in member registers a passkey, then can verify
 * possession of it (step-up). Challenges are single-use, expire in 5 minutes, and credentials live in SQLite.
 * This does not replace password / magic-link sign-in.
 */
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { BusinessError, type BusinessStore } from './store';

type Env = Record<string, string | undefined>;
export type Passkey = { id: string; memberId: string; counter: number; transports: string[]; deviceType: string; backedUp: boolean; createdAt: string; lastUsedAt: string | null };
const TTL = 5 * 60_000;
export function rp(env: Env = process.env) {
  const missing = ['MUZEBOS_WEBAUTHN_RP_ID', 'MUZEBOS_WEBAUTHN_ORIGIN'].filter((k) => !env[k]);
  if (missing.length) throw new BusinessError(`Not connected — add ${missing.join(', ')}`, 424);
  return { rpID: env.MUZEBOS_WEBAUTHN_RP_ID!, origin: env.MUZEBOS_WEBAUTHN_ORIGIN!, rpName: env.MUZEBOS_WEBAUTHN_RP_NAME || 'MuzeBOS' };
}
function ensure(s: BusinessStore) {
  s.db.exec(`CREATE TABLE IF NOT EXISTS mb_passkeys(id TEXT PRIMARY KEY, memberId TEXT NOT NULL, publicKey TEXT NOT NULL, counter INTEGER NOT NULL, transports TEXT NOT NULL, deviceType TEXT NOT NULL, backedUp INTEGER NOT NULL, createdAt TEXT NOT NULL, lastUsedAt TEXT);
    CREATE TABLE IF NOT EXISTS mb_webauthn_challenges(memberId TEXT NOT NULL, purpose TEXT NOT NULL, challenge TEXT NOT NULL, expiresAt INTEGER NOT NULL, PRIMARY KEY(memberId, purpose));`);
}
type Row = { id: string; memberId: string; publicKey: string; counter: number; transports: string; deviceType: string; backedUp: number; createdAt: string; lastUsedAt: string | null };
const out = (r: Row): Passkey => ({ id: r.id, memberId: r.memberId, counter: r.counter, transports: JSON.parse(r.transports), deviceType: r.deviceType, backedUp: !!r.backedUp, createdAt: r.createdAt, lastUsedAt: r.lastUsedAt });
export function listPasskeys(s: BusinessStore, memberId: string): Passkey[] { ensure(s); return (s.db.prepare('SELECT * FROM mb_passkeys WHERE memberId=? ORDER BY createdAt').all(memberId) as Row[]).map(out); }
function saveChallenge(s: BusinessStore, memberId: string, purpose: string, challenge: string, now: number) {
  s.db.prepare('INSERT INTO mb_webauthn_challenges VALUES(?,?,?,?) ON CONFLICT(memberId,purpose) DO UPDATE SET challenge=excluded.challenge, expiresAt=excluded.expiresAt').run(memberId, purpose, challenge, now + TTL);
}
function takeChallenge(s: BusinessStore, memberId: string, purpose: string, now: number) {
  const r = s.db.prepare('SELECT challenge, expiresAt FROM mb_webauthn_challenges WHERE memberId=? AND purpose=?').get(memberId, purpose) as { challenge: string; expiresAt: number } | undefined;
  s.db.prepare('DELETE FROM mb_webauthn_challenges WHERE memberId=? AND purpose=?').run(memberId, purpose);
  if (!r || r.expiresAt < now) throw new BusinessError('No active passkey challenge; start again', 409);
  return r.challenge;
}

export async function registrationOptions(s: BusinessStore, member: { id: string; name: string }, env: Env = process.env, now = Date.now()) {
  const { rpID, rpName } = rp(env); ensure(s);
  const opts = await generateRegistrationOptions({ rpName, rpID, userName: member.name, userID: new TextEncoder().encode(member.id), attestationType: 'none',
    excludeCredentials: listPasskeys(s, member.id).map((p) => ({ id: p.id, transports: p.transports })), authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' } });
  saveChallenge(s, member.id, 'register', opts.challenge, now);
  return opts;
}
export async function verifyRegistration(s: BusinessStore, memberId: string, response: unknown, env: Env = process.env, now = Date.now()): Promise<Passkey> {
  const { rpID, origin } = rp(env); ensure(s);
  const expectedChallenge = takeChallenge(s, memberId, 'register', now);
  let v; try { v = await verifyRegistrationResponse({ response: response as never, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID }); }
  catch (e) { throw new BusinessError(`Passkey registration rejected: ${e instanceof Error ? e.message.slice(0, 200) : 'invalid'}`, 422); }
  if (!v.verified) throw new BusinessError('Passkey registration not verified', 422);
  const c = v.registrationInfo.credential;
  if (s.db.prepare('SELECT 1 FROM mb_passkeys WHERE id=?').get(c.id)) throw new BusinessError('Passkey already registered', 409);
  const at = new Date(now).toISOString();
  s.transact(() => {
    s.db.prepare('INSERT INTO mb_passkeys VALUES(?,?,?,?,?,?,?,?,NULL)').run(c.id, memberId, isoBase64URL.fromBuffer(c.publicKey), c.counter, JSON.stringify(c.transports ?? []), v.registrationInfo.credentialDeviceType, v.registrationInfo.credentialBackedUp ? 1 : 0, at);
    s.appendEvidence('passkey.registered', memberId, `Passkey ${c.id.slice(0, 12)}… registered (${v.registrationInfo.credentialDeviceType})`);
  });
  return listPasskeys(s, memberId).find((p) => p.id === c.id)!;
}
export async function authenticationOptions(s: BusinessStore, memberId: string, env: Env = process.env, now = Date.now()) {
  const { rpID } = rp(env); ensure(s);
  const keys = listPasskeys(s, memberId); if (!keys.length) throw new BusinessError('No passkey registered yet', 404);
  const opts = await generateAuthenticationOptions({ rpID, allowCredentials: keys.map((k) => ({ id: k.id, transports: k.transports as never })), userVerification: 'preferred' });
  saveChallenge(s, memberId, 'authenticate', opts.challenge, now);
  return opts;
}
export async function verifyAuthentication(s: BusinessStore, memberId: string, response: { id?: string }, env: Env = process.env, now = Date.now()) {
  const { rpID, origin } = rp(env); ensure(s);
  const expectedChallenge = takeChallenge(s, memberId, 'authenticate', now);
  const row = s.db.prepare('SELECT * FROM mb_passkeys WHERE id=? AND memberId=?').get(String(response?.id ?? ''), memberId) as Row | undefined;
  if (!row) throw new BusinessError('Unknown passkey for this member', 404);
  let v; try {
    v = await verifyAuthenticationResponse({ response: response as never, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID,
      credential: { id: row.id, publicKey: isoBase64URL.toBuffer(row.publicKey), counter: row.counter, transports: JSON.parse(row.transports) } });
  } catch (e) { throw new BusinessError(`Passkey check rejected: ${e instanceof Error ? e.message.slice(0, 200) : 'invalid'}`, 422); }
  if (!v.verified) throw new BusinessError('Passkey not verified', 422);
  s.transact(() => {
    s.db.prepare('UPDATE mb_passkeys SET counter=?, lastUsedAt=? WHERE id=?').run(v.authenticationInfo.newCounter, new Date(now).toISOString(), row.id);
    s.appendEvidence('passkey.verified', memberId, `Passkey ${row.id.slice(0, 12)}… verified (counter ${v.authenticationInfo.newCounter})`);
  });
  return { verified: true as const, counter: v.authenticationInfo.newCounter };
}
export function removePasskey(s: BusinessStore, memberId: string, id: string) {
  ensure(s);
  const r = s.db.prepare('DELETE FROM mb_passkeys WHERE id=? AND memberId=?').run(id, memberId);
  if (!r.changes) throw new BusinessError('Passkey not found', 404);
  s.appendEvidence('passkey.removed', memberId, `Passkey ${id.slice(0, 12)}… removed`);
}
