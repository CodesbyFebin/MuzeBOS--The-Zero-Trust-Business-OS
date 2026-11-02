/**
 * Real WebAuthn verification: a software ES256 authenticator (node:crypto) produces genuine attestation and
 * assertion signatures that @simplewebauthn/server verifies. No browser or hardware key is involved.
 */
import { describe, expect, it } from 'vitest';
import { createHash, generateKeyPairSync, sign, randomBytes, type KeyObject } from 'node:crypto';
import { isoCBOR, isoBase64URL } from '@simplewebauthn/server/helpers';
import { BusinessStore } from '@/lib/metabos/store';
import { authenticationOptions, listPasskeys, registrationOptions, removePasskey, verifyAuthentication, verifyRegistration } from '@/lib/metabos/passkeys';

const ENV = { MUZEBOS_WEBAUTHN_RP_ID: 'localhost', MUZEBOS_WEBAUTHN_ORIGIN: 'http://localhost:3000' };
const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64url');
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest();
function u32(n: number) { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; }
class SoftKey {
  id = randomBytes(16); priv: KeyObject; jwk: { x: string; y: string }; counter = 0;
  constructor() { const k = generateKeyPairSync('ec', { namedCurve: 'P-256' }); this.priv = k.privateKey; this.jwk = k.publicKey.export({ format: 'jwk' }) as never; }
  attest(challenge: string, origin = ENV.MUZEBOS_WEBAUTHN_ORIGIN) {
    const cose = new Map<number, number | Uint8Array>([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(this.jwk.x, 'base64url')], [-3, Buffer.from(this.jwk.y, 'base64url')]]);
    const len = Buffer.alloc(2); len.writeUInt16BE(this.id.length);
    const authData = Buffer.concat([sha('localhost'), Buffer.from([0x45]), u32(this.counter), Buffer.alloc(16), len, this.id, Buffer.from(isoCBOR.encode(cose as never))]);
    const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge, origin }));
    const attestationObject = isoCBOR.encode(new Map<string, unknown>([['fmt', 'none'], ['attStmt', new Map()], ['authData', new Uint8Array(authData)]]) as never);
    return { id: b64(this.id), rawId: b64(this.id), type: 'public-key', clientExtensionResults: {}, response: { clientDataJSON: b64(clientDataJSON), attestationObject: b64(attestationObject), transports: ['internal'] } };
  }
  assert(challenge: string) {
    this.counter += 1;
    const authData = Buffer.concat([sha('localhost'), Buffer.from([0x05]), u32(this.counter)]);
    const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin: ENV.MUZEBOS_WEBAUTHN_ORIGIN }));
    const signature = sign('sha256', Buffer.concat([authData, sha(clientDataJSON)]), this.priv);
    return { id: b64(this.id), rawId: b64(this.id), type: 'public-key', clientExtensionResults: {}, response: { clientDataJSON: b64(clientDataJSON), authenticatorData: b64(authData), signature: b64(signature) } };
  }
}
const me = { id: 'm1', name: 'owner@example.com' };

describe('passkeys (real WebAuthn verification with a software authenticator)', () => {
  it('says Not connected when RP env is missing', async () => {
    const s = new BusinessStore(':memory:');
    await expect(registrationOptions(s, me, {})).rejects.toThrow('Not connected — add MUZEBOS_WEBAUTHN_RP_ID, MUZEBOS_WEBAUTHN_ORIGIN'); s.close();
  });
  it('registers, verifies, bumps the counter, writes evidence and removes', async () => {
    const s = new BusinessStore(':memory:'); const key = new SoftKey();
    const ro = await registrationOptions(s, me, ENV);
    expect(ro.rp.id).toBe('localhost');
    const pk = await verifyRegistration(s, me.id, key.attest(ro.challenge), ENV);
    expect(pk.id).toBe(b64(key.id)); expect(listPasskeys(s, me.id)).toHaveLength(1);
    const ao = await authenticationOptions(s, me.id, ENV);
    expect(await verifyAuthentication(s, me.id, key.assert(ao.challenge), ENV)).toEqual({ verified: true, counter: 1 });
    const acts = (s.db.prepare("SELECT action FROM mb_audit WHERE action LIKE 'passkey.%'").all() as { action: string }[]).map((r) => r.action);
    expect(acts).toEqual(['passkey.registered', 'passkey.verified']);
    removePasskey(s, me.id, pk.id); expect(listPasskeys(s, me.id)).toHaveLength(0); s.close();
  });
  it('rejects a wrong origin, a reused challenge, an expired challenge and a forged signature', async () => {
    const s = new BusinessStore(':memory:'); const key = new SoftKey();
    let ro = await registrationOptions(s, me, ENV);
    await expect(verifyRegistration(s, me.id, key.attest(ro.challenge, 'https://evil.example'), ENV)).rejects.toThrow(/rejected/);
    await expect(verifyRegistration(s, me.id, key.attest(ro.challenge), ENV)).rejects.toThrow(/No active passkey challenge/);
    ro = await registrationOptions(s, me, ENV, 0);
    await expect(verifyRegistration(s, me.id, key.attest(ro.challenge), ENV, 10 * 60_000)).rejects.toThrow(/No active passkey challenge/);
    ro = await registrationOptions(s, me, ENV); await verifyRegistration(s, me.id, key.attest(ro.challenge), ENV);
    const ao = await authenticationOptions(s, me.id, ENV); const forged = key.assert(ao.challenge);
    forged.response.signature = b64(sign('sha256', Buffer.from('other'), new SoftKey().priv));
    await expect(verifyAuthentication(s, me.id, forged, ENV)).rejects.toThrow(/rejected|not verified/);
    expect(isoBase64URL.isBase64URL(listPasskeys(s, me.id)[0].id)).toBe(true); s.close();
  });
});
