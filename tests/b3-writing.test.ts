/** Writing library: feed mapping, parsing, FTS5 search with citations, SSRF guard, read-only. */
import { describe, expect, it } from 'vitest';
import { BusinessStore } from '@/lib/metabos/store';
import { addSource, cacheEntries, embeddingsStatus, feedFor, ftsQuery, inYourVoice, isPrivateAddress, listSources, parseFeed, refreshSource, removeSource, search } from '@/lib/metabos/b3/writing';
const RSS = `<?xml version="1.0"?><rss><channel><title>Me</title>
<item><title>Pricing chai in Kochi</title><link>https://me.substack.com/p/chai</link><pubDate>Tue, 03 Mar 2026 10:00:00 GMT</pubDate><content:encoded><![CDATA[<p>I price chai by the <b>cost of milk</b> plus a fair margin &amp; nothing else.</p>]]></content:encoded></item>
<item><title>Hiring slowly</title><link>https://me.substack.com/p/hire</link><description>Hire slowly, pay on time.</description></item></channel></rss>`;
const ATOM = `<feed><entry><title>Atom post</title><link rel="alternate" href="https://blog.example.org/a"/><updated>2026-01-02T00:00:00Z</updated><summary>Margins matter.</summary></entry></feed>`;
describe('writing library', () => {
  it('maps profile URLs to feeds and refuses http', () => {
    expect(feedFor('https://me.substack.com/').feedUrl).toBe('https://me.substack.com/feed');
    expect(feedFor('https://medium.com/@febin').feedUrl).toBe('https://medium.com/feed/@febin');
    expect(feedFor('https://blog.example.org/rss.xml').kind).toBe('rss');
    expect(() => feedFor('http://me.substack.com')).toThrow(/https/);
  });
  it('parses RSS and Atom', () => {
    const r = parseFeed(RSS); expect(r).toHaveLength(2); expect(r[0].body).toBe('I price chai by the cost of milk plus a fair margin & nothing else.'); expect(r[0].publishedAt).toBe('2026-03-03T10:00:00.000Z'); expect(r[1].publishedAt).toBeNull();
    expect(parseFeed(ATOM)[0]).toMatchObject({ url: 'https://blog.example.org/a', title: 'Atom post' });
  });
  it('caches, searches with citations, upserts and removes', () => {
    const s = new BusinessStore(':memory:'); const id = addSource(s, 'owner', 'https://me.substack.com');
    expect(addSource(s, 'owner', 'https://me.substack.com')).toBe(id);
    expect(cacheEntries(s, id, parseFeed(RSS)).added).toBe(2); expect(cacheEntries(s, id, parseFeed(RSS)).added).toBe(0);
    const c = search(s, 'milk margin'); expect(c[0]).toMatchObject({ url: 'https://me.substack.com/p/chai', publishedAt: '2026-03-03T10:00:00.000Z' }); expect(c[0].passage).toContain('milk');
    expect(search(s, 'x" OR NEAR(')).toEqual([]); expect(ftsQuery('a "b')).toBe('"a" OR "b"');
    expect(inYourVoice(s, 'zzz').note).toBe('No records yet');
    expect(listSources(s)[0].posts).toBe(2); removeSource(s, id); expect(listSources(s)).toEqual([]); expect(search(s, 'milk')).toEqual([]);
  });
  it('blocks private hosts before fetching and records the error', async () => {
    expect(isPrivateAddress('192.168.1.5')).toBe(true); expect(isPrivateAddress('8.8.8.8')).toBe(false);
    const s = new BusinessStore(':memory:'); const id = addSource(s, 'o', 'https://127.0.0.1/feed'); let called = false;
    await expect(refreshSource(s, id, (async () => { called = true; return new Response(''); }) as typeof fetch)).rejects.toThrow(/public/);
    expect(called).toBe(false); expect(listSources(s)[0].lastError).toMatch(/public/);
  });
  it('embeddings say Not connected without a key', () => { expect(embeddingsStatus({}).status).toMatch(/^Not connected/); expect(embeddingsStatus({}).connected).toBe(false); });
});
