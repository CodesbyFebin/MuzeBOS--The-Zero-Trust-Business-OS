/**
 * Streaming request-body cap. middleware.ts rejects oversized bodies by
 * Content-Length; this reads the stream itself, so a chunked body without
 * Content-Length is cut off at the same bound (docs/SECURITY-TRIAGE.md).
 */
export const MAX_JSON_BODY_BYTES = 2_000_000;

export class BodyTooLargeError extends Error {
  readonly status = 413;
  constructor(limit: number) {
    super(`Request body too large (limit ${limit} bytes)`);
    this.name = 'BodyTooLargeError';
  }
}

export async function readBoundedText(req: Request, limit = MAX_JSON_BODY_BYTES): Promise<string> {
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > limit) throw new BodyTooLargeError(limit);
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      throw new BodyTooLargeError(limit);
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
  return new TextDecoder().decode(buf);
}

/** Drop-in for `await req.json()` with a byte bound; same SyntaxError on bad JSON. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readJsonBounded(req: Request, limit = MAX_JSON_BODY_BYTES): Promise<any> {
  return JSON.parse(await readBoundedText(req, limit));
}
