import { describe, expect, test } from 'vitest';
import type { FetchLike } from '@/lib/lab/apify-client';
import { RADAR_UA, VENDOR_FEEDS } from '@/lib/lab/radar/config';
import { fetchHnRadar, parseHnRadar } from '@/lib/lab/radar/fetch/hn';
import { fetchHfModels, fetchHfSpaces, hfFamily, parseHfModels, parseHfSpaces } from '@/lib/lab/radar/fetch/hf';
import { fakeStarCheck, fetchGithubNew, fetchOwner, parseGithubSearch } from '@/lib/lab/radar/fetch/github';
import { fetchVendor, parseAtom, parseLinkDiff, parseRss, vendorPings } from '@/lib/lab/radar/fetch/vendor';
import { fetchPageviews, parsePageviews, pickArticle, resolveArticle } from '@/lib/lab/radar/fetch/wikipedia';
import { parseTweets, xWatchInput } from '@/lib/lab/radar/fetch/x';
import { parsePhActor } from '@/lib/lab/radar/fetch/producthunt';
import { parseTiktokCc } from '@/lib/lab/radar/fetch/tiktok';
import { ANTHROPIC_HTML, ATOM, GITHUB, HF_MODELS, HF_SPACES, HN, META_HTML, MISTRAL_RSS, OPENAI_RSS, OPENSEARCH, PAGEVIEWS, PH_ACTOR, TIKTOK_CC, TWEETS } from './fixtures/radar/samples';

/** A captured fetch: answers from a router, records every request's headers (AC-05-2). */
function captured(route: (url: string) => unknown) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const f: FetchLike = async (url, init) => {
    calls.push({ url, headers: init?.headers ?? {} });
    const body = route(url);
    return { ok: true, status: 200, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) };
  };
  return { f, calls };
}

describe('AC-05-1 parsers return the section 3 fields from the samples', () => {
  test('HN: AI stories only, no Ask/Tell HN, created_at as source time, points as metric', () => {
    const { pings, nbPages } = parseHnRadar(HN);
    expect(nbPages).toBe(1);
    expect(pings.map((p) => p.externalId)).toEqual(['90000001', '90000004']);
    expect(pings[0]).toMatchObject({ source: 'hn', metric: 412, sourceTime: '2026-10-11T08:40:00.000Z', url: 'https://example.com/blog/sample-model-7', name: 'Sample Model 7' });
    // Show HN: is stripped before naming; a lowercase description is not a name
    expect(pings[1].name).toBeNull();
  });

  test('HF models and spaces: rank by index, trendingScore, family; reuploaders dropped (AC-05-11)', () => {
    const models = parseHfModels(HF_MODELS);
    expect(models.map((p) => p.externalId)).toEqual(['samplelab/SampleModel-7-32B-Instruct', 'examplecorp/embedder-2']);
    expect(models[0]).toMatchObject({ rank: 1, metric: 1579, name: 'samplemodel-7', sourceTime: null });
    expect(models[0].extra.createdAt).toBe('2026-10-08T14:53:42.000Z');
    expect(models[1].rank).toBe(3);
    const spaces = parseHfSpaces(HF_SPACES);
    expect(spaces.map((p) => p.externalId)).toEqual(['samplelab/SampleModel-7-demo']);
    expect(hfFamily('Qwen/Qwen4-32B-Instruct-AWQ')).toBe('qwen4');
  });

  test('GitHub search: full_name, stars, owner type, created_at', () => {
    const p = parseGithubSearch(GITHUB);
    expect(p[0]).toMatchObject({ externalId: 'exampleorg/agent-kit', metric: 2275, name: 'agent kit' });
    expect(p[0].extra).toMatchObject({ ownerType: 'Organization', createdAt: '2026-10-08T00:00:00.000Z', fullName: 'exampleorg/agent-kit' });
  });

  test('RSS (CDATA and single line), Atom, link diff', () => {
    const o = parseRss(OPENAI_RSS);
    expect(o[0]).toEqual({ title: 'Introducing Sample Model 7', link: 'https://example.com/index/sample-model-7/', id: 'sample-model-7', at: '2026-10-11T08:05:00.000Z' });
    const m = parseRss(MISTRAL_RSS);
    expect(m.map((e) => e.title)).toEqual(['Introducing Mistral Large 4', 'Our partnership with a bank']);
    const a = parseAtom(ATOM);
    expect(a[0]).toMatchObject({ title: 'Sample Model 7 is now available in the API', link: 'https://example.com/blog/sample-model-7-api', at: '2026-10-11T10:00:00.000Z' });
    const anth = VENDOR_FEEDS.find((f) => f.vendor === 'anthropic')!;
    const meta = VENDOR_FEEDS.find((f) => f.vendor === 'meta' && f.kind === 'link_diff')!;
    expect(parseLinkDiff(ANTHROPIC_HTML, anth.slugRe!)).toEqual(['introducing-sample-model-7', 'sample-safety-update', 'sample-partnership']);
    expect(parseLinkDiff(META_HTML, meta.slugRe!)).toEqual(['sample-vision-2', 'sample-research-notes']);
  });

  test('vendor launch pings: LAUNCH_RE marks launches, corporate posts are kept as non-launch', () => {
    const openai = VENDOR_FEEDS.find((f) => f.vendor === 'openai')!;
    const p = vendorPings(openai, OPENAI_RSS, new Set());
    expect(p[0]).toMatchObject({ isLaunch: true, name: 'Sample Model 7', sourceTime: '2026-10-11T08:05:00.000Z' });
    expect(p[1].isLaunch).toBe(false);
    const mistral = VENDOR_FEEDS.find((f) => f.vendor === 'mistral')!;
    expect(vendorPings(mistral, MISTRAL_RSS, new Set())[0]).toMatchObject({ isLaunch: true, name: 'Mistral Large 4' });
  });

  test('Wikipedia pageviews and opensearch', () => {
    expect(parsePageviews(PAGEVIEWS)).toEqual([{ day: '2026-10-09', v: 16929 }, { day: '2026-10-10', v: 47525 }]);
    expect(pickArticle(OPENSEARCH, 'sample-agent-kit')).toBe('Sample Agent Kit (software)');
    expect(pickArticle(OPENSEARCH, 'other-thing')).toBeNull();
  });

  test('tweets: dedupe by id, vendor launch ping, author and createdAt', () => {
    const t = parseTweets(TWEETS);
    expect(t).toHaveLength(2);
    expect(t[0]).toMatchObject({ source: 'x', author: 'OpenAI', isLaunch: true, sourceTime: '2026-10-11T08:05:00.000Z' });
    expect(t[1]).toMatchObject({ author: 'fictional_dev', isLaunch: false });
  });

  test('Product Hunt actor rows: AI topic or lexicon; votes as metric', () => {
    const p = parsePhActor(PH_ACTOR);
    expect(p.map((x) => x.name)).toEqual(['Sample Agent Kit', 'Sample Writer']);
    expect(p[0].metric).toBe(412);
  });

  test('TikTok Creative Center: AI hashtags only (veo3 splits), rank as metric', () => {
    const p = parseTiktokCc(TIKTOK_CC);
    expect(p.map((x) => x.name)).toEqual(['chatgpt', 'veo3']);
    expect(p[0]).toMatchObject({ rank: 3, metric: 3 });
  });
});

describe('AC-05-2 every fetcher sends RADAR_UA', () => {
  test('HN, HF, GitHub (search, stargazers, users), vendor, Wikipedia', async () => {
    const { f, calls } = captured((url) => {
      if (url.includes('algolia')) return HN;
      if (url.includes('/api/models')) return HF_MODELS;
      if (url.includes('/api/spaces')) return HF_SPACES;
      if (url.includes('/search/repositories')) return GITHUB;
      if (url.includes('/stargazers')) return [{ starred_at: '2026-10-10T00:00:00Z', user: { login: 'a' } }];
      if (url.includes('api.github.com/users/')) return { created_at: '2020-01-01T00:00:00Z', public_repos: 3, followers: 2, type: 'User' };
      if (url.includes('opensearch')) return OPENSEARCH;
      if (url.includes('pageviews')) return PAGEVIEWS;
      return OPENAI_RSS;
    });
    const now = new Date('2026-10-11T12:00:00Z');
    await fetchHnRadar({ now, fetch: f });
    await fetchHfModels({ fetch: f });
    await fetchHfSpaces({ fetch: f });
    await fetchGithubNew({ now, fetch: f, topics: ['llm'] });
    await fakeStarCheck('exampleorg/agent-kit', 150, { token: 't', fetch: f });
    await fetchOwner('someone', { fetch: f });
    await fetchVendor({ fetch: f, feeds: VENDOR_FEEDS.slice(0, 2) });
    await resolveArticle('Sample Agent Kit', { fetch: f });
    await fetchPageviews('Sample Tool', '2026-10-01T00:00:00Z', '2026-10-11T00:00:00Z', { fetch: f });
    expect(calls.length).toBeGreaterThanOrEqual(10);
    for (const c of calls) expect(c.headers['User-Agent'], c.url).toBe(RADAR_UA);
    expect(calls.find((c) => c.url.includes('/stargazers'))!.headers.Accept).toBe('application/vnd.github.star+json');
  });
});

describe('AC-05-38b xWatchInput', () => {
  const h = (n: number) => Array.from({ length: n }, (_, i) => `acct${String(i).padStart(2, '0')}`);
  test('12 handles: one OR term, maxItems 100', () => {
    const i = xWatchInput(h(12), null);
    expect(i.searchTerms).toHaveLength(1);
    expect(i.searchTerms[0]).toMatch(/^\(from:acct00 OR from:acct01 .* OR from:acct11\) -filter:replies$/);
    expect(i.maxItems).toBe(100);
    expect(i.sort).toBe('Latest');
    expect(i.start).toBeUndefined();
  });
  test('25 handles: two terms, maxItems 200; start is lastOk minus a day', () => {
    const i = xWatchInput(h(25), '2026-10-11T05:00:00.000Z');
    expect(i.searchTerms).toHaveLength(2);
    expect(i.maxItems).toBe(200);
    expect(i.start).toBe('2026-10-10');
  });
  test('duplicates and mixed case collapse; never one term per handle', () => {
    const i = xWatchInput(['OpenAI', 'openai', '@OpenAI', 'AnthropicAI'], null);
    expect(i.searchTerms).toEqual(['(from:anthropicai OR from:openai) -filter:replies']);
  });
});
