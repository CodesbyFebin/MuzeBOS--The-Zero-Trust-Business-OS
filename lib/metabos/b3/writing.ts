/**
 * Writing Library (built during the event; clean-room, no mcp-writer-substack code, which has no licence).
 * The owner adds their own Substack, Medium or RSS/Atom feed URLs. Posts are cached in SQLite with source URL
 * and published date, searchable with FTS5. "In your voice" returns cited passages only. It is read-only:
 * nothing is ever written back to the source sites. Embeddings stay "Not connected" without a key.
 */
import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { z } from 'zod';
import type { BusinessStore } from '../store';
import { BusinessError } from '../store';

export type SourceKind = 'substack' | 'medium' | 'rss';
export type WritingItem = { id: string; sourceId: string; url: string; title: string; publishedAt: string | null; fetchedAt: string };
export type Citation = { title: string; url: string; publishedAt: string | null; passage: string };

function ensure(s: BusinessStore) {
  s.db.exec(`CREATE TABLE IF NOT EXISTS mb_writing_sources(id TEXT PRIMARY KEY, url TEXT NOT NULL UNIQUE, feedUrl TEXT NOT NULL, kind TEXT NOT NULL, addedBy TEXT NOT NULL, addedAt TEXT NOT NULL, lastFetchedAt TEXT, lastError TEXT);
  CREATE TABLE IF NOT EXISTS mb_writing_items(id TEXT PRIMARY KEY, sourceId TEXT NOT NULL, url TEXT NOT NULL UNIQUE, title TEXT NOT NULL, body TEXT NOT NULL, publishedAt TEXT, fetchedAt TEXT NOT NULL);
  CREATE VIRTUAL TABLE IF NOT EXISTS mb_writing_fts USING fts5(title, body, itemId UNINDEXED, tokenize='unicode61');`);
}

/** Map a profile URL to its feed. Substack → /feed; medium.com/@u → medium.com/feed/@u; anything else as given. */
export function feedFor(raw: string): { url: string; feedUrl: string; kind: SourceKind } {
  const u = new URL(z.string().url().max(500).parse(raw.trim()));
  if (u.protocol !== 'https:') throw new BusinessError('Use an https:// URL', 400);
  u.hash = '';
  const h = u.hostname.toLowerCase();
  if (h.endsWith('.substack.com')) return { url: u.toString(), feedUrl: `${u.origin}/feed`, kind: 'substack' };
  if (h === 'medium.com' && /^\/@[^/]+/.test(u.pathname) && !u.pathname.startsWith('/feed')) return { url: u.toString(), feedUrl: `https://medium.com/feed/${u.pathname.split('/')[1]}`, kind: 'medium' };
  if (h.endsWith('.medium.com') && !u.pathname.startsWith('/feed')) return { url: u.toString(), feedUrl: `${u.origin}/feed`, kind: 'medium' };
  return { url: u.toString(), feedUrl: u.toString(), kind: 'rss' };
}

const PRIVATE = [/^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^::1$/, /^f[cd]/i, /^fe80/i, /^::ffff:(10|127|192\.168|169\.254)\./i];
export function isPrivateAddress(a: string) { return PRIVATE.some((r) => r.test(a)); }
async function assertPublicHost(host: string) {
  const addrs = isIP(host) ? [host] : (await lookup(host, { all: true })).map((x) => x.address);
  if (!addrs.length || addrs.some(isPrivateAddress)) throw new BusinessError('That address is not a public site', 400);
}

const decode = (t: string) => t.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&');
const text = (html: string) => decode(html).replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (xml: string, names: string[]) => { for (const n of names) { const m = xml.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, 'i')); if (m) return m[1]; } return ''; };

/** Parse RSS 2.0 or Atom without a dependency. Returns at most 200 entries. */
export function parseFeed(xml: string): { url: string; title: string; body: string; publishedAt: string | null }[] {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  return blocks.slice(0, 200).map((b) => {
    let url = text(tag(b, ['link']));
    if (!url) url = (b.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)/i) ?? b.match(/<link[^>]*href=["']([^"']+)/i) ?? [])[1] ?? '';
    const date = text(tag(b, ['pubDate', 'published', 'updated', 'dc:date']));
    const d = date ? new Date(date) : null;
    return { url: decode(url).trim(), title: text(tag(b, ['title'])).slice(0, 300) || '(untitled)', body: text(tag(b, ['content:encoded', 'content', 'description', 'summary'])).slice(0, 200_000), publishedAt: d && !isNaN(+d) ? d.toISOString() : null };
  }).filter((e) => /^https?:\/\//.test(e.url) && e.body.length > 0);
}

export function addSource(s: BusinessStore, actor: string, raw: string) {
  ensure(s);
  const f = feedFor(raw);
  const existing = s.db.prepare('SELECT id FROM mb_writing_sources WHERE url = ?').get(f.url) as { id: string } | undefined;
  if (existing) return existing.id;
  const id = randomUUID();
  s.db.prepare('INSERT INTO mb_writing_sources(id,url,feedUrl,kind,addedBy,addedAt) VALUES (?,?,?,?,?,?)').run(id, f.url, f.feedUrl, f.kind, actor, new Date().toISOString());
  return id;
}
export function removeSource(s: BusinessStore, id: string) {
  ensure(s);
  const ids = (s.db.prepare('SELECT id FROM mb_writing_items WHERE sourceId = ?').all(id) as { id: string }[]).map((r) => r.id);
  const tx = s.db.transaction(() => { for (const i of ids) s.db.prepare('DELETE FROM mb_writing_fts WHERE itemId = ?').run(i); s.db.prepare('DELETE FROM mb_writing_items WHERE sourceId = ?').run(id); s.db.prepare('DELETE FROM mb_writing_sources WHERE id = ?').run(id); });
  tx();
}

/** Store parsed entries for a source (upsert by post URL) and refresh the FTS index. */
export function cacheEntries(s: BusinessStore, sourceId: string, entries: ReturnType<typeof parseFeed>) {
  ensure(s);
  const now = new Date().toISOString(); let added = 0;
  const tx = s.db.transaction(() => {
    for (const e of entries) {
      const old = s.db.prepare('SELECT id FROM mb_writing_items WHERE url = ?').get(e.url) as { id: string } | undefined;
      const id = old?.id ?? randomUUID();
      if (old) s.db.prepare('DELETE FROM mb_writing_fts WHERE itemId = ?').run(id); else added++;
      s.db.prepare('INSERT INTO mb_writing_items(id,sourceId,url,title,body,publishedAt,fetchedAt) VALUES (?,?,?,?,?,?,?) ON CONFLICT(url) DO UPDATE SET title=excluded.title, body=excluded.body, publishedAt=excluded.publishedAt, fetchedAt=excluded.fetchedAt').run(id, sourceId, e.url, e.title, e.body, e.publishedAt, now);
      s.db.prepare('INSERT INTO mb_writing_fts(title, body, itemId) VALUES (?,?,?)').run(e.title, e.body, id);
    }
    s.db.prepare('UPDATE mb_writing_sources SET lastFetchedAt = ?, lastError = NULL WHERE id = ?').run(now, sourceId);
  });
  tx();
  return { added, total: entries.length };
}

/** Fetch one source's feed (public https hosts only, 2 MB cap, 10 s timeout, max 3 redirects) and cache it. */
export async function refreshSource(s: BusinessStore, id: string, fetcher: typeof fetch = fetch) {
  ensure(s);
  const src = s.db.prepare('SELECT feedUrl FROM mb_writing_sources WHERE id = ?').get(id) as { feedUrl: string } | undefined;
  if (!src) throw new BusinessError('Source not found', 404);
  try {
    let url = src.feedUrl; let res: Response | null = null;
    for (let hop = 0; hop < 4; hop++) {
      const u = new URL(url); if (u.protocol !== 'https:') throw new BusinessError('Feed redirected off https', 400);
      await assertPublicHost(u.hostname);
      res = await fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(10_000), headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' } });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { url = new URL(res.headers.get('location')!, url).toString(); continue; }
      break;
    }
    if (!res || !res.ok) throw new BusinessError(`Feed returned HTTP ${res?.status ?? 'error'}`, 502);
    const buf = await res.arrayBuffer(); if (buf.byteLength > 2_000_000) throw new BusinessError('Feed is larger than 2 MB', 413);
    const entries = parseFeed(new TextDecoder().decode(buf));
    if (!entries.length) throw new BusinessError('No posts found in that feed', 422);
    return cacheEntries(s, id, entries);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    s.db.prepare('UPDATE mb_writing_sources SET lastError = ?, lastFetchedAt = ? WHERE id = ?').run(msg.slice(0, 300), new Date().toISOString(), id);
    throw e instanceof BusinessError ? e : new BusinessError(`Could not fetch feed: ${msg.slice(0, 120)}`, 502);
  }
}

export function listSources(s: BusinessStore) {
  ensure(s);
  return s.db.prepare('SELECT s.id, s.url, s.feedUrl, s.kind, s.addedAt, s.lastFetchedAt, s.lastError, COUNT(i.id) AS posts FROM mb_writing_sources s LEFT JOIN mb_writing_items i ON i.sourceId = s.id GROUP BY s.id ORDER BY s.addedAt').all() as { id: string; url: string; feedUrl: string; kind: SourceKind; addedAt: string; lastFetchedAt: string | null; lastError: string | null; posts: number }[];
}

/** Quote each word so user text can never become FTS5 syntax. */
export function ftsQuery(q: string) { return q.split(/\s+/).map((w) => w.replace(/"/g, '')).filter(Boolean).slice(0, 12).map((w) => `"${w}"`).join(' OR '); }

/** Keyword search with cited passages. Ranked by bm25. */
export function search(s: BusinessStore, q: string, limit = 5): Citation[] {
  ensure(s);
  const m = ftsQuery(q); if (!m) return [];
  return (s.db.prepare(`SELECT i.title, i.url, i.publishedAt, snippet(mb_writing_fts, 1, '', '', ' … ', 40) AS passage FROM mb_writing_fts f JOIN mb_writing_items i ON i.id = f.itemId WHERE mb_writing_fts MATCH ? ORDER BY bm25(mb_writing_fts) LIMIT ?`).all(m, Math.min(limit, 20)) as Citation[]);
}

/** Embeddings are only used when a key is set; there is no embedding adapter yet, so this stays honest. */
export function embeddingsStatus(env: Record<string, string | undefined> = process.env) {
  return env.MUZEBOS_EMBEDDINGS_API_KEY ? { connected: false, status: 'Key present; no verified embeddings adapter yet. Using keyword search (FTS5).' } : { connected: false, status: 'Not connected — add MUZEBOS_EMBEDDINGS_API_KEY for semantic search. Using keyword search (FTS5).' };
}

/** "In your voice": the owner's own passages on a topic, each with source URL and date. Read-only; drafts nothing. */
export function inYourVoice(s: BusinessStore, topic: string) {
  const citations = search(s, topic, 3);
  return { topic, citations, note: citations.length ? 'Passages from your own writing. Use them as reference; any draft still goes to Jev.' : 'No records yet' };
}
