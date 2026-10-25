import { describe, expect, test, vi } from 'vitest';
import Database from 'better-sqlite3';
import { LAB_DDL } from '@/lib/db';
import { labStore } from '@/lib/lab/store';
import type { LabEvent } from '@/lib/schemas';
import { newEvent } from '@/lib/lab/radar/events';
import { knownFamilies, noveltyByRule, noveltyPriorLine, tagNovelty } from '@/lib/lab/radar/novelty';
import { backtestSeed, SEED_EVENTS } from '@/lib/lab/radar/seed';
import { classifyEvent, detectNewWave } from '@/lib/lab/radar/classify';
import { applyWindow, windowFor } from '@/lib/lab/radar/window';

const fresh = () => {
  const db = new Database(':memory:');
  db.exec(LAB_DDL);
  return labStore(db);
};
const now = new Date('2026-10-11T00:00:00Z');
const ev = (name: string, over: Partial<LabEvent> = {}) => newEvent(name, '2026-10-10T00:00:00.000Z', now, { status: 'confirmed', ...over });
const p = (family: 'vendor' | 'hn' | 'github' | 'hf', title = '') => ({ family, title });

describe('AC-05-18 novelty', () => {
  const known = knownFamilies([]);
  test('N1 new flagship: higher major over a seed family', () => {
    expect(noveltyByRule(ev('GPT-7'), known, [p('vendor', 'Introducing GPT-7')])).toBe('new_flagship');
    expect(noveltyByRule(ev('DeepSeek R2'), known, [p('hn')])).toBe('new_flagship');
  });
  test('N2 point release: same major, higher minor or a letter', () => {
    expect(noveltyByRule(ev('Claude Opus 5.6'), known, [p('vendor')])).toBe('point_release');
    expect(noveltyByRule(ev('GPT-6o'), known, [p('vendor')])).toBe('point_release');
  });
  test('N3 new surface: vendor title "comes to" a known family', () => {
    expect(noveltyByRule(ev('Gemini Canvas'), known, [p('vendor', 'Gemini Canvas comes to Chrome')])).toBe('new_surface');
  });
  test('N4 ecosystem: GitHub/HF only and no known family', () => {
    expect(noveltyByRule(ev('agent kit'), known, [p('github'), p('hf')])).toBe('ecosystem');
  });
  test('N5: no rule; one ask per batch; dry never asks', async () => {
    const s = fresh();
    s.events.upsert(ev('Jev'));
    s.events.upsert(newEvent('Orbital Notes', '2026-10-09T00:00:00.000Z', now, { status: 'confirmed' }));
    const ask = vi.fn(async () => ({ ok: true as const, data: { items: s.events.all().map((e) => ({ eventId: e.id, novelty: 'new_category' as const, reason: 'new kind' })) } }));
    await tagNovelty(s, now, { ask, dry: true });
    expect(ask).not.toHaveBeenCalled();
    const r = await tagNovelty(s, now, { ask, dry: false });
    expect(ask).toHaveBeenCalledTimes(1);
    expect(r.byLlm).toBe(2);
    expect(s.events.all().every((e) => e.novelty === 'new_category' && e.noveltySource === 'llm')).toBe(true);
  });
  test('prior line: n under 5 says not enough yet; own n >= 5 replaces the prior', () => {
    expect(noveltyPriorLine('new_category', null)).toBe('Prior from big AI channels: 2.8x their normal (n 8, YouTube long-form).');
    expect(noveltyPriorLine('ecosystem', null)).toBe('Prior: not enough yet');
    expect(noveltyPriorLine('new_category', { median: 1.9, n: 7 })).toBe('In your niche: 1.9x (n 7)');
  });
});

describe('AC-05-19 seed backtest', () => {
  test('13 of 13', () => {
    expect(SEED_EVENTS).toHaveLength(13);
    expect(backtestSeed()).toEqual({ correct: 13, n: 13, misses: [] });
  });
});

/** A daily series around t0 from a function of the day offset. */
function series(t0: string, from: number, to: number, f: (d: number) => number) {
  const base = Date.parse(t0.slice(0, 10));
  return Array.from({ length: to - from + 1 }, (_, i) => ({ day: new Date(base + (from + i) * 86_400_000).toISOString().slice(0, 10), v: f(from + i) }));
}

describe('AC-05-20 classifyEvent', () => {
  const t0 = '2026-10-01T09:00:00.000Z';
  const spikey = series(t0, -10, 12, (d) => (d < 0 ? 100 : d === 0 ? 10000 : d === 7 ? 3500 : Math.round(10000 / (d + 1))));
  test('unknown before 96 h, decided at 96 h', () => {
    const e = ev('Sample', { t0, attention: spikey });
    expect(classifyEvent(e, new Date(Date.parse(t0) + 95 * 3_600_000)).class).toBe('unknown');
    const r = classifyEvent(e, new Date(Date.parse(t0) + 96 * 3_600_000));
    expect(r.class).toBe('spike');
    expect(r.classInfo.baselineShare).toBe(0.01);
  });
  test('baseline share >= 0.20 is adopted at 96 h', () => {
    const e = ev('Sample', { t0, attention: series(t0, -10, 5, (d) => (d < 0 ? 3000 : d === 0 ? 10000 : 6000)) });
    expect(classifyEvent(e, new Date(Date.parse(t0) + 96 * 3_600_000)).class).toBe('adopted');
  });
  test('spike reclassified adopted at 168 h when day-7 share >= 0.30', () => {
    const decided = classifyEvent(ev('Sample', { t0, attention: spikey }), new Date(Date.parse(t0) + 96 * 3_600_000));
    const e = ev('Sample', { t0, attention: spikey, class: decided.class, classInfo: decided.classInfo });
    const r = classifyEvent(e, new Date(Date.parse(t0) + 168 * 3_600_000));
    expect(r.classInfo.day7Share).toBe(0.35);
    expect(r.class).toBe('adopted');
  });
  test('a new wave on a spike makes it adopted (detectNewWave)', () => {
    const waves = series(t0, -10, 30, (d) => (d < 0 ? 10 : d === 0 ? 1000 : d === 20 ? 800 : d > 20 ? 300 : 40));
    expect(detectNewWave(waves, t0)).toBe(waves.find((x) => x.v === 800)!.day);
    const e = ev('Sample', { t0, class: 'spike', attention: waves });
    const r = classifyEvent(e, new Date(Date.parse(t0) + 25 * 86_400_000));
    expect(r.class).toBe('adopted');
    expect(r.wave?.n).toBe(2);
  });
});

describe('AC-05-21, AC-05-22 window', () => {
  const t0 = '2026-10-11T09:00:00.000Z';
  test('10.2 worked example: closing by E1, progress 0.18', () => {
    const w = windowFor(ev('S', { t0, class: 'spike' }), { creators: 9, active: 14, ratedRecent: [] }, new Date('2026-10-12T15:00:00Z'))!;
    expect(w.state).toBe('closing');
    expect(w.reason).toBe('9 of 14 creators have covered it');
    expect(w.progress.toFixed(2)).toBe('0.18');
    expect(w.closingAt).toBe('2026-10-14T09:00:00.000Z');
    expect(w.closesAt).toBe('2026-10-18T09:00:00.000Z');
  });
  test('progress 0.75 at t0 + 126 h, still closing by the clock', () => {
    const w = windowFor(ev('S', { t0, class: 'unknown' }), { creators: 0, active: 14, ratedRecent: [] }, new Date(Date.parse(t0) + 126 * 3_600_000))!;
    expect(w.state).toBe('closing');
    expect(w.progress).toBe(0.75);
  });
  test('E2 fires on three rated posts under 1.0', () => {
    const w = windowFor(ev('S', { t0, class: 'spike' }), { creators: 3, active: 14, ratedRecent: [0.8, 0.9, 0.7, 3] }, new Date(Date.parse(t0) + 30 * 3_600_000))!;
    expect(w.state).toBe('closing');
    expect(w.reason).toBe("The last 3 posts on it ran under their creators' normal");
  });
  test('E1 never fires with under 5 active tracked creators', () => {
    expect(windowFor(ev('S', { t0 }), { creators: 4, active: 4, ratedRecent: [] }, new Date(Date.parse(t0) + 3_600_000))!.state).toBe('open');
  });
  test('a new wave sets wave_n + 1, state open, and logs the transition', () => {
    const closed = applyWindow(ev('S', { t0, class: 'adopted', windowState: 'closed', windowLog: [] }), windowFor(ev('S', { t0, class: 'adopted' }), { creators: 0, active: 0, ratedRecent: [] }, new Date(Date.parse(t0) + 30 * 86_400_000)), new Date(Date.parse(t0) + 30 * 86_400_000));
    expect(closed.windowState).toBe('closed');
    const wave = { ...closed, waveN: 2, waveStartedAt: new Date(Date.parse(t0) + 29 * 86_400_000).toISOString() };
    const t = new Date(Date.parse(t0) + 30 * 86_400_000);
    const reopened = applyWindow(wave, windowFor(wave, { creators: 0, active: 0, ratedRecent: [] }, t), t);
    expect(reopened.windowState).toBe('open');
    expect(reopened.waveN).toBe(2);
    expect(reopened.windowLog.at(-1)).toMatchObject({ from: 'closed', to: 'open', reason: 'wave 2' });
  });
});
