export function validLocalEndpoint(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
    if (!/^(localhost|127\.0\.0\.1|\[::1\]|ollama|10\.[0-9.]+|192\.168\.[0-9.]+|172\.(1[6-9]|2[0-9]|3[01])\.[0-9.]+)$/.test(url.hostname)) return null;
    return url.href.replace(/\/$/, '');
  } catch { return null; }
}
