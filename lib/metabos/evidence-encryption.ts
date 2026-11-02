/** Browser/Node Web Crypto only. Passwords never need to be sent to an application API. */
const FORMAT = 'metabos-encrypted-evidence-v1';
const SUITE = 'PBKDF2-SHA256-600000/AES-256-GCM';
const LIMIT = 20 * 1024 * 1024;
const encoder = new TextEncoder();
function passwordBytes(password: string) {
  const bytes = encoder.encode(password);
  if (bytes.length < 16 || bytes.length > 1024) throw new Error('Use a password of 16–1024 UTF-8 bytes');
  return bytes;
}
function b64(bytes: Uint8Array) {
  let text = ''; for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}
function decode(value: unknown, max: number, exact?: number) {
  if (typeof value !== 'string' || value.length > Math.ceil(max / 3) * 4 || value.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(value)) throw new Error('Invalid encrypted evidence encoding');
  const bytes = Uint8Array.from(atob(value), c => c.charCodeAt(0));
  if (bytes.length > max || (exact !== undefined && bytes.length !== exact) || b64(bytes) !== value) throw new Error('Invalid encrypted evidence length');
  return bytes;
}
async function key(password: string, salt: Uint8Array<ArrayBuffer>, usage: KeyUsage[]) {
  if (!globalThis.crypto?.subtle) throw new Error('Encrypted exports require HTTPS or localhost with Web Crypto support');
  const material = await crypto.subtle.importKey('raw', passwordBytes(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600000 }, material,
    { name: 'AES-GCM', length: 256 }, false, usage);
}
export async function encryptEvidence(plaintext: string, password: string) {
  if (encoder.encode(plaintext).length > LIMIT - 16) throw new Error('Evidence too large to encrypt');
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(FORMAT + '/' + SUITE), tagLength: 128 },
    await key(password, salt, ['encrypt']), encoder.encode(plaintext));
  return { format: FORMAT, suite: SUITE, salt: b64(salt), iv: b64(iv), ciphertext: b64(new Uint8Array(ciphertext)) };
}
export async function decryptEvidence(input: unknown, password: string): Promise<string> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid encrypted evidence');
  const value = input as Record<string, unknown>;
  if (Object.keys(value).sort().join(',') !== 'ciphertext,format,iv,salt,suite' || value.format !== FORMAT || value.suite !== SUITE) throw new Error('Unsupported encrypted evidence format');
  const salt = decode(value.salt, 16, 16), iv = decode(value.iv, 12, 12), ciphertext = decode(value.ciphertext, LIMIT);
  if (ciphertext.length < 16) throw new Error('Invalid encrypted evidence');
  const derived = await key(password, salt, ['decrypt']);
  try {
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(FORMAT + '/' + SUITE), tagLength: 128 }, derived, ciphertext);
    return new TextDecoder('utf-8', { fatal: true }).decode(plaintext);
  } catch { throw new Error('Wrong password or damaged encrypted evidence'); }
}
