import { describe, expect, test } from 'vitest';
import Database from 'better-sqlite3';
import { LAB_DDL } from '@/lib/db';
import { labStore } from '@/lib/lab/store';
import type { LabEvent, LabEventPing } from '@/lib/schemas';
import { canonicalKey, matchEvent, nameFromTitle } from '@/lib/lab/radar/names';
import { BASELINE_MIN_N, qualifies, robustZ, upsertPing, velocityPerH } from '@/lib/lab/radar/pings';
import { judgeFakeStars, ownerEstablished } from '@/lib/lab/radar/fetch/github';
import { attachOrCreate, confirmEvents, confirmRule, expireCandidates, mergeEvents, newEvent } from '@/lib/lab/radar/events';
import { vendorPings } from '@/lib/lab/radar/fetch/vendor';
import { VENDOR_FEEDS } from '@/lib/lab/radar/config';
import { emptyRaw, type RawPing } from '@/lib/lab/radar/types';
import { ANTHROPIC_HTML } from './fixtures/radar/samples';

const fresh = () => {
  const db = new Database(':memory:');
  db.exec(LAB_DDL);
  return labStore(db);
};
const H = 3_600_000;
const at = (iso: string, h = 0) => new Date(Date.parse(iso) + h * H);

function ping(over: Partial<LabEventPing>): LabEventPing {
  return {
    id: 'hn:1', source: 'hn', family: 'hn', externalId: '1', eventId: null, matchRule: null, name: null, nameKey: null, title: '', url: '', author: null, vendor: null,
    sourceTime: null, firstSeenAt: '2026-10-11T00:00:00.000Z', lastSeenAt: '2026-10-11T00:00:00.000Z', prevSeenAt: null, metricFirst: null, metricPrev: null, metricLast: null, rank: null,
    velocityPerH: null, robustZ: null, isLaunch: false, isBaseline: false, qualifies: false, qualifyReason: null, fakeStar: null, fakeStarInfo: null, lexicon: true, dry: false, ...over,
  };
}

describe('AC-05-8 velocity and robust z', () => {
  test('5.2 worked example: median 4, MAD 3, a 40 points/h story gives z 8.09', () => {
    expect(robustZ(40, [1, 4, 7]).z!.toFixed(2)).toBe('8.09');
  });
  test('MAD 0 gives null', () => {
    expect(robustZ(10, [4, 4, 4, 4]).z).toBeNull();
  });
  test('velocity: repeat reads and first read', () => {
    expect(velocityPerH(ping({ metricPrev: 100, metricLast: 160, prevSeenAt: '2026-10-11T00:00:00.000Z', lastSeenAt: '2026-10-11T02:00:00.000Z' }))).toBe(30);
    expect(velocityPerH(ping({ metricLast: 60, sourceTime: '2026-10-11T00:00:00.000Z', firstSeenAt: '2026-10-11T02:00:00.000Z', lastSeenAt: '2026-10-11T02:00:00.000Z' }))).toBe(30);
    // tiktok: rank climbed per day
    expect(velocityPerH(ping({ source: 'tiktok_cc', metricPrev: 30, metricLast: 10, prevSeenAt: '2026-10-10T00:00:00.000Z', lastSeenAt: '2026-10-11T00:00:00.000Z' }))).toBe(20);
  });
  test('under 50 baseline the fixed floor decides; at 50 the z does', () => {
    const p = { source: 'hn' as const, title: 'A new LLM agent', metricLast: 60, rank: null, velocityPerH: 35, robustZ: 1, isLaunch: false, firstSeenAt: '', externalId: '1' };
    expect(qualifies(p, { baselineN: 10, now: new Date() }).ok).toBe(true);
    expect(qualifies(p, { baselineN: BASELINE_MIN_N, now: new Date() }).ok).toBe(false);
    expect(qualifies({ ...p, robustZ: 3.2 }, { baselineN: BASELINE_MIN_N, now: new Date() }).ok).toBe(true);
  });
});

describe('AC-05-9 qualifies, one pass and one fail per source', () => {
  const now = new Date('2026-10-11T12:00:00Z');
  const base = { title: 'Sample', metricLast: null, rank: null, velocityPerH: null, robustZ: null, isLaunch: false, firstSeenAt: '2026-10-11T10:00:00.000Z', externalId: 'a/b' };
  const c = { baselineN: 0, now };
  test.each([
    ['hn', { ...base, source: 'hn' as const, title: 'Claude gets a new agent mode', metricLast: 2147 }, { ...base, source: 'hn' as const, title: 'Gardening tips', metricLast: 2147 }, c, c],
    ['hf_models', { ...base, source: 'hf_models' as const, rank: 4, createdAt: '2026-10-05T00:00:00.000Z' }, { ...base, source: 'hf_models' as const, rank: 4, createdAt: '2026-08-01T00:00:00.000Z' }, c, c],
    ['hf_spaces', { ...base, source: 'hf_spaces' as const, rank: 15 }, { ...base, source: 'hf_spaces' as const, rank: 16 }, c, c],
    ['github', { ...base, source: 'github' as const, metricLast: 800, createdAt: '2026-10-08T00:00:00.000Z' }, { ...base, source: 'github' as const, metricLast: 300, createdAt: '2026-10-08T00:00:00.000Z' }, { ...c, ownerEstablished: true }, { ...c, ownerEstablished: true }],
    ['vendor', { ...base, source: 'vendor' as const, isLaunch: true }, { ...base, source: 'vendor' as const }, c, c],
    ['x', { ...base, source: 'x' as const, isLaunch: true }, { ...base, source: 'x' as const }, c, { ...c, authors: 2 }],
    ['producthunt', { ...base, source: 'producthunt' as const, metricLast: 300 }, { ...base, source: 'producthunt' as const, metricLast: 299 }, c, c],
    ['tiktok_cc', { ...base, source: 'tiktok_cc' as const, rank: 5 }, { ...base, source: 'tiktok_cc' as const, rank: 25 }, { ...c, prevRank: 20 }, { ...c, prevRank: 30 }],
  ])('%s', (_s, pass, fail, cp, cf) => {
    expect(qualifies(pass, cp).ok).toBe(true);
    expect(qualifies(fail, cf).ok).toBe(false);
  });
  test('reason strings', () => {
    expect(qualifies({ ...base, source: 'hn', title: 'New Claude agent', metricLast: 2147 }, c).reason).toBe('HN: 2,147 points');
    expect(qualifies({ ...base, source: 'hf_models', rank: 4, createdAt: '2026-10-05T00:00:00.000Z' }, c).reason).toBe('HF: trending #4');
  });
});

describe('AC-05-10 fake-star filter', () => {
  const t0 = Date.parse('2026-10-10T10:00:00Z');
  test('55 of 100 stars in one hour flags', () => {
    const stars = [...Array.from({ length: 55 }, (_, i) => new Date(t0 + i * 30_000).toISOString()), ...Array.from({ length: 45 }, (_, i) => new Date(t0 - (i + 2) * H).toISOString())];
    expect(judgeFakeStars(stars, []).flagged).toBe(true);
  });
  test('12 of 20 suspicious accounts flags with the 5.5 reason', () => {
    const acc = Array.from({ length: 20 }, (_, i) => (i < 12 ? { createdAt: '2026-10-01T00:00:00Z', publicRepos: 1, followers: 1, starredAt: '2026-10-10T00:00:00Z' } : { createdAt: '2020-01-01T00:00:00Z', publicRepos: 5, followers: 5, starredAt: '2026-10-10T00:00:00Z' }));
    const r = judgeFakeStars([], acc);
    expect(r.flagged).toBe(true);
    expect(r.reason).toBe('GitHub: stars look bought (12 of 20 sampled accounts are new or empty)');
  });
  test('without a token: a 30-day-old owner does not qualify, an Organization does', () => {
    const now = new Date('2026-10-11T00:00:00Z');
    expect(ownerEstablished({ type: 'User', createdAt: '2026-09-11T00:00:00Z' }, now)).toBe(false);
    expect(ownerEstablished({ type: 'Organization', createdAt: '2026-09-11T00:00:00Z' }, now)).toBe(true);
    const p = { source: 'github' as const, title: '', metricLast: 900, rank: null, velocityPerH: null, robustZ: null, isLaunch: false, firstSeenAt: '2026-10-11T00:00:00Z', externalId: 'x/y', createdAt: '2026-10-09T00:00:00Z' };
    expect(qualifies(p, { baselineN: 0, now, ownerEstablished: false }).ok).toBe(false);
    expect(qualifies(p, { baselineN: 0, now, ownerEstablished: true }).ok).toBe(true);
  });
});

describe('AC-05-12 canonicalKey (6.2 table)', () => {
  test.each([
    ['Introducing GPT-6 Astra: our smartest model', 'gpt-6-astra'],
    ['gpt6 astra', 'gpt-6-astra'],
    ['Anthropic Claude Opus 5.5', 'claude-opus-5.5'],
    ['DeepSeek R1', 'deepseek-r1'],
    ['Introducing Mistral Large 4', 'mistral-large-4'],
  ])('%s', (input, key) => expect(canonicalKey(input)).toBe(key));
  test('nameFromTitle', () => {
    expect(nameFromTitle('Introducing Mistral Large 4')).toBe('Mistral Large 4');
    expect(nameFromTitle('Sophos cuts threat investigation time by 96% with OpenAI Daybreak')).toBeNull();
  });
});

describe('AC-05-13 matchEvent (6.3 table)', () => {
  const now = new Date('2026-10-11T00:00:00Z');
  const ev = (name: string) => newEvent(name, now.toISOString(), now, { status: 'confirmed' });
  const m = (pingName: string, eventName: string) => matchEvent({ name: pingName, url: '', source: 'hn', externalId: 'x' }, now.toISOString(), { events: [ev(eventName)], pingsOf: () => [] });
  test.each([
    ['opus 5.5', 'Claude Opus 5.5', 'contain'],
    ['GPT-6', 'GPT-6 Astra', 'contain'],
    ['GPT-6 mini', 'GPT-6', null],
    ['GPT-6.1', 'GPT-6', null],
    ['Claude', 'Claude Opus 5.5', null],
    ['gpt6 astra', 'GPT-6 Astra', 'key'],
  ])('%s vs %s', (p, e, rule) => expect(m(p, e)?.rule ?? null).toBe(rule));
  test('R2 url and R3 repo', () => {
    const e = ev('Sample Model 7');
    const pings = [ping({ id: 'hf_models:org/SampleModel-7-32B', source: 'hf_models', family: 'hf', externalId: 'org/SampleModel-7-32B', url: 'https://example.com/blog/sample-model-7', eventId: e.id })];
    const ctx = { events: [e], pingsOf: () => pings };
    expect(matchEvent({ name: null, url: 'https://www.example.com/blog/sample-model-7/', source: 'hn', externalId: '9' }, now.toISOString(), ctx)?.rule).toBe('url');
    expect(matchEvent({ name: null, url: '', source: 'hf_models', externalId: 'other/SampleModel-7-GGUF' }, now.toISOString(), ctx)?.rule).toBe('repo');
  });
});

function raw(over: Partial<RawPing> & Pick<RawPing, 'source' | 'externalId'>): RawPing {
  return { ...emptyRaw(over.source, over.externalId), ...over };
}

describe('events: AC-05-14 to AC-05-17, AC-05-40', () => {
  test('AC-05-14 a first link-diff poll writes baseline pings only and creates no candidate', () => {
    const s = fresh();
    const now = new Date('2026-10-11T10:00:00Z');
    const feed = VENDOR_FEEDS.find((f) => f.vendor === 'anthropic')!;
    for (const r of vendorPings(feed, ANTHROPIC_HTML, new Set())) upsertPing(s, r, { now, dry: false, baseline: [] });
    expect(s.eventPings.all().every((p) => p.isBaseline && !p.qualifies && !p.isLaunch)).toBe(true);
    attachOrCreate(s, now);
    expect(s.events.all()).toHaveLength(0);
    // a later poll: only the new slug is a ping, and it is a launch
    const later = vendorPings(feed, `${ANTHROPIC_HTML}<a href="/news/introducing-sample-model-8">x</a>`, new Set(['introducing-sample-model-7', 'sample-safety-update', 'sample-partnership']));
    expect(later.map((p) => p.externalId)).toEqual(['anthropic:introducing-sample-model-8']);
    expect(later[0]).toMatchObject({ isLaunch: true, isBaseline: false });
  });

  test('AC-05-15 T1 vendor alone confirms; T2 two families within 72 h; one family twice does not; 80 h apart does not', () => {
    const v = [ping({ id: 'vendor:a', source: 'vendor', family: 'vendor', qualifies: true, sourceTime: '2026-10-11T08:00:00.000Z' })];
    expect(confirmRule(v)).toMatchObject({ confirm: true, rule: 'vendor', t0: '2026-10-11T08:00:00.000Z' });
    const two = [ping({ id: 'hn:a', qualifies: true, sourceTime: '2026-10-11T08:40:00.000Z' }), ping({ id: 'hf_models:a', source: 'hf_models', family: 'hf', qualifies: true, firstSeenAt: '2026-10-11T10:00:00.000Z' })];
    expect(confirmRule(two)).toMatchObject({ confirm: true, rule: 'two_sources', t0: '2026-10-11T08:40:00.000Z' });
    const same = [ping({ id: 'hn:a', qualifies: true }), ping({ id: 'hn:b', qualifies: true, firstSeenAt: '2026-10-11T03:00:00.000Z' })];
    expect(confirmRule(same).confirm).toBe(false);
    const far = [ping({ id: 'hn:a', qualifies: true, sourceTime: '2026-10-08T00:00:00.000Z' }), ping({ id: 'github:a', source: 'github', family: 'github', qualifies: true, firstSeenAt: '2026-10-11T08:00:00.000Z' })];
    expect(confirmRule(far).confirm).toBe(false);
  });

  test('AC-05-16 the 7 worked example (DeepSeek R2): t0 08:05 after revision; t0 never moves later', () => {
    const s = fresh();
    const d = '2026-10-11T';
    upsertPing(s, raw({ source: 'hn', externalId: '1', title: 'DeepSeek R2', name: 'DeepSeek R2', metric: 400, sourceTime: `${d}08:40:00.000Z` }), { now: new Date(`${d}09:12:00Z`), dry: false, baseline: [] });
    attachOrCreate(s, new Date(`${d}09:12:00Z`));
    expect(s.events.all()).toHaveLength(1);
    upsertPing(s, raw({ source: 'hf_models', externalId: 'deepseek-ai/DeepSeek-R2', title: 'deepseek-ai/DeepSeek-R2', name: 'deepseek-r2', metric: 900, rank: 3, extra: { createdAt: `${d}06:00:00.000Z` } }), { now: new Date(`${d}10:00:00Z`), dry: false, baseline: [] });
    attachOrCreate(s, new Date(`${d}10:00:00Z`));
    confirmEvents(s, new Date(`${d}10:00:00Z`));
    let e = s.events.all()[0];
    expect(e).toMatchObject({ status: 'confirmed', t0: `${d}08:40:00.000Z`, t0Rule: 'two_sources', t0RevisedAt: null });
    // the vendor tweet named by the LLM namer
    upsertPing(s, raw({ source: 'x', externalId: 't1', title: 'Introducing DeepSeek R2', author: 'deepseek_ai', vendor: 'deepseek_ai', isLaunch: true, name: 'DeepSeek R2', sourceTime: `${d}08:05:00.000Z` }), { now: new Date(`${d}11:30:00Z`), dry: false, baseline: [] });
    attachOrCreate(s, new Date(`${d}11:30:00Z`));
    confirmEvents(s, new Date(`${d}11:30:00Z`));
    e = s.events.all()[0];
    expect(e).toMatchObject({ t0: `${d}08:05:00.000Z`, t0Rule: 'two_sources', t0RevisedAt: `${d}11:30:00.000Z` });
    expect(e.sources).toEqual(['hf', 'hn', 'vendor']);
    // a later qualifying ping never moves t0 later
    upsertPing(s, raw({ source: 'producthunt', externalId: 'ph', title: 'DeepSeek R2', name: 'DeepSeek R2', metric: 500, sourceTime: `${d}12:00:00.000Z` }), { now: new Date(`${d}12:00:00Z`), dry: false, baseline: [] });
    attachOrCreate(s, new Date(`${d}12:00:00Z`));
    confirmEvents(s, new Date(`${d}12:00:00Z`));
    expect(s.events.all()[0].t0).toBe(`${d}08:05:00.000Z`);
  });

  test('AC-05-17 candidates expire at 72 h and reopen on a new qualifying ping within 14 days', () => {
    const s = fresh();
    const t = '2026-10-01T00:00:00.000Z';
    upsertPing(s, raw({ source: 'hn', externalId: '1', title: 'Sample Agent Kit for LLM agents', name: 'Sample Agent Kit', metric: 150, sourceTime: t }), { now: new Date(t), dry: false, baseline: [] });
    attachOrCreate(s, new Date(t));
    expect(expireCandidates(s, at(t, 71))).toBe(0);
    expect(expireCandidates(s, at(t, 72))).toBe(1);
    expect(s.events.all()[0].status).toBe('expired');
    const later = at(t, 24 * 6);
    upsertPing(s, raw({ source: 'producthunt', externalId: 'ph1', title: 'Sample Agent Kit', name: 'Sample Agent Kit', metric: 400, sourceTime: later.toISOString() }), { now: later, dry: false, baseline: [] });
    const r = attachOrCreate(s, later);
    expect(r.reopened).toBe(1);
    expect(s.events.all()[0].status).toBe('candidate');
  });

  test('AC-05-40 unattached pings older than 30 days are deleted; attached pings are kept', () => {
    const s = fresh();
    s.eventPings.upsert(ping({ id: 'hn:old', lastSeenAt: '2026-08-01T00:00:00.000Z', firstSeenAt: '2026-08-01T00:00:00.000Z' }));
    s.eventPings.upsert(ping({ id: 'hn:kept', eventId: 'lev-x', lastSeenAt: '2026-08-01T00:00:00.000Z', firstSeenAt: '2026-08-01T00:00:00.000Z' }));
    s.eventPings.upsert(ping({ id: 'hn:new', lastSeenAt: '2026-10-10T00:00:00.000Z' }));
    expect(s.eventPings.deleteOlderUnattached('2026-09-11T00:00:00.000Z')).toBe(1);
    expect(s.eventPings.all().map((p) => p.id).sort()).toEqual(['hn:kept', 'hn:new']);
  });

  test('merge moves pings, aliases and keeps the earlier t0', () => {
    const s = fresh();
    const now = new Date('2026-10-11T00:00:00Z');
    const a = newEvent('GPT-6 Astra', '2026-10-10T00:00:00.000Z', now, { status: 'confirmed', t0: '2026-10-10T00:00:00.000Z' });
    const b = newEvent('Astra Model', '2026-10-09T00:00:00.000Z', now, { status: 'confirmed', t0: '2026-10-09T00:00:00.000Z' });
    s.events.upsert(a);
    s.events.upsert(b);
    s.eventPings.upsert(ping({ id: 'hn:b', eventId: b.id }));
    const m = mergeEvents(s, b.id, a.id, now);
    expect(m.t0).toBe('2026-10-09T00:00:00.000Z');
    expect(m.aliases).toContain(b.key);
    expect(s.events.get(b.id)).toMatchObject({ status: 'merged', mergedInto: a.id });
    expect(s.eventPings.get('hn:b')!.eventId).toBe(a.id);
  });
});

void ({} as LabEvent);
