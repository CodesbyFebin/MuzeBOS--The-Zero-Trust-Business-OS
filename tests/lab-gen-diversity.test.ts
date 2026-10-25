import { afterEach, describe, expect, test, vi } from 'vitest';
import Database from 'better-sqlite3';
import { LAB_DDL } from '@/lib/db';
import { labStore, type LabStore } from '@/lib/lab/store';
import { seedLabFixtures } from '@/lib/lab/fixtures';
import { BATCH_K, GenerateError, QUOTAS, generateBatch, mmrSelect, vsContext, vsPrompt, type MmrItem, type VsAsk, type VsCandidate } from '@/lib/lab/gen/diversity';
import { diversityLine, generateState, studioView, GEN_COPY } from '@/lib/lab/gen/view';
import { OPEN_CAP } from '@/lib/lab/ideas';
import { eventAngleStats } from '@/lib/lab/gen/events';

vi.mock('node:child_process', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:child_process')>();
  return { ...real, execFile: vi.fn(real.execFile), spawn: vi.fn(real.spawn) };
});
const cp = await import('node:child_process');

/**
 * Generate ideas, the diversity engine (07 7.3): AC-07-1 to AC-07-10. The model is an injected
 * fake; dry runs prove no CLI process is spawned. Fixture world only (fictional creators).
 */

const NOW = new Date('2026-10-10T15:00:00.000Z');
const fresh = (): LabStore => {
  const db = new Database(':memory:');
  db.exec(LAB_DDL);
  return labStore(db);
};
const world = () => {
  const s = fresh();
  seedLabFixtures(s, NOW);
  return s;
};
afterEach(() => {
  delete process.env.LAB_DRY;
  vi.mocked(cp.execFile).mockClear();
});

const FORMS = ['results_first', 'contrarian', 'open_loop', 'howto_promise', 'number_stat', 'confession', 'list_tease', 'direct_question'] as const;
const TRIGGERS = ['curiosity', 'controversy', 'aspiration', 'surprise_shock'] as const;
const TOPICS = ['memory files', 'the billing page', 'voice mode', 'local models', 'a cron job', 'the browser tool', 'pricing tiers', 'agent handoffs'];

/** 3 rounds of 8 grounded candidates, varied enough that MMR has spread to choose from. */
function candidates(s: LabStore, round: number): VsCandidate[] {
  const ctx = vsContext(s, NOW);
  const cs = ctx.idea.clusters;
  return Array.from({ length: 8 }, (_, k) => {
    const c = cs[(round * 3 + k) % cs.length];
    const t = TOPICS[(round * 5 + k) % TOPICS.length];
    return {
      title: `Round ${round} idea ${k}: ${t} ${['for founders', 'in one week', 'without code', 'on a budget'][k % 4]}`,
      clusterId: c.id,
      eventId: null,
      seedId: null,
      angle: `${t} angle ${round}${k}`,
      angleClass: 'other',
      hookForm: FORMS[(round + k) % FORMS.length],
      trigger: TRIGGERS[k % TRIGGERS.length],
      tension: null,
      formatFamily: ctx.idea.families[0] ?? 'tutorial_walkthrough',
      evidence: c.posts.slice(0, 2).map((p) => ({ postId: p.postId, why: '' })),
      probability: k < 3 ? 0.05 : 0.3,
    } as VsCandidate;
  });
}

const askFrom = (s: LabStore, fn: (round: number) => VsCandidate[] | 'fail' | 'missing'): VsAsk => {
  let round = 0;
  return vi.fn(async () => {
    round++;
    const r = fn(round);
    if (r === 'fail') return { ok: false as const, unavailable: false, error: 'bad reply' };
    if (r === 'missing') return { ok: false as const, unavailable: true, error: 'spawn claude ENOENT' };
    return { ok: true as const, data: { candidates: r } };
  });
};

describe('generateBatch (7.3.2 to 7.3.6)', () => {
  test('AC-07-1: 3 rounds of 8 store at most 10 ideas with one batch id, source generate and mmr_rank 1..n', async () => {
    const s = world();
    const ask = askFrom(s, (r) => candidates(s, r));
    const r = await generateBatch(s, { now: NOW, ask });
    expect(ask).toHaveBeenCalledTimes(3);
    expect(r.by).toBe('claude');
    expect(r.outcome.candidates).toBe(24);
    expect(r.added.length).toBeGreaterThan(0);
    expect(r.added.length).toBeLessThanOrEqual(BATCH_K);
    const stored = s.ideas.all().filter((i) => i.batchId === r.outcome.batchId);
    expect(stored).toHaveLength(r.added.length);
    expect(new Set(stored.map((i) => i.source))).toEqual(new Set(['generate']));
    expect(stored.map((i) => i.mmrRank).sort((a, b) => a! - b!)).toEqual(stored.map((_, i) => i + 1));
    expect(stored.every((i) => i.promptVersion === 'ideas-v2' && i.hookForm && i.vsProbability !== null)).toBe(true);
    // the batch summary is stored on the first round's run
    const run = s.runs.get(r.runIds[0])!;
    expect((run.input as { outcome?: { batchId: string } }).outcome?.batchId).toBe(r.outcome.batchId);
    expect(r.outcome.rounds.map((x) => x.ok)).toEqual([true, true, true]);
  });

  test('the VS prompt reuses the CLUSTERS block, lists open events, seeds and earlier rounds, and asks for the tail', () => {
    const s = world();
    const ctx = vsContext(s, NOW);
    const p = vsPrompt(ctx, 2, { titles: ['An earlier idea'], cells: ['results_first+curiosity', 'results_first+curiosity'] });
    expect(p).toContain('CLUSTERS (topic id');
    expect(p).toContain('EVENTS WITH AN OPEN WINDOW');
    expect(p).toContain('event=fx-ev-e1');
    expect(p).toContain('AUDIENCE QUESTIONS');
    expect(p).toContain('ALREADY PROPOSED THIS BATCH (do not repeat or rephrase): An earlier idea');
    expect(p).toContain('HOOK CELLS ALREADY USED THIS BATCH: results_first+curiosity x2');
    expect(p).toContain('At least 3 of the 8 must have probability below 0.10');
    expect(p).toContain('Cite ONLY cluster ids, event ids, seed ids and post ids that appear above.');
    expect(p).not.toMatch(/[–—]/);
  });

  test('AC-07-2: a candidate citing an unknown post, cluster or event is never stored and is in outcome.dropped', async () => {
    const s = world();
    const ask = askFrom(s, (r) => {
      const c = candidates(s, r);
      if (r === 1) {
        c[0] = { ...c[0], title: 'Bad post', evidence: [{ postId: 'fx-p-9999', why: '' }, c[0].evidence[1]] };
        c[1] = { ...c[1], title: 'Bad cluster', clusterId: 'lc-nope' };
        c[2] = { ...c[2], title: 'Bad event', clusterId: null, eventId: 'fx-ev-nope', evidence: [] };
      }
      return c;
    });
    const r = await generateBatch(s, { now: NOW, ask });
    expect(r.outcome.dropped).toEqual([
      { title: 'Bad post', reason: 'cites unknown post fx-p-9999' },
      { title: 'Bad cluster', reason: 'unknown cluster lc-nope' },
      { title: 'Bad event', reason: 'unknown event fx-ev-nope' },
    ]);
    expect(s.ideas.all().some((i) => ['Bad post', 'Bad cluster', 'Bad event'].includes(i.title))).toBe(false);
  });

  test('AC-07-3: a worn-out angle (taken on the event, lift under 1) is dropped and counted', async () => {
    const s = world();
    const ask = askFrom(s, (r) => {
      const c = candidates(s, r);
      // fx-ev-e1 coverage: real_examples is taken at 0.1x its creators' normal
      if (r === 1) c[0] = { ...c[0], title: 'Real examples of Astra', clusterId: null, eventId: 'fx-ev-e1', angleClass: 'real_examples', angle: 'real examples', evidence: [] };
      return c;
    });
    const r = await generateBatch(s, { now: NOW, ask });
    expect(r.outcome.exhausted).toBeGreaterThanOrEqual(1);
    expect(s.ideas.all().some((i) => i.title === 'Real examples of Astra')).toBe(false);
  });

  test('AC-07-4: near duplicates never both survive; a match with a recent idea counts as a duplicate', async () => {
    const s = world();
    const recent = s.ideas.get('fx-idea-9')!; // an event idea created two hours before NOW
    // an angle that is not worn out on that event, so the copy reaches the duplicate check (the worn-out drop runs first)
    const fresh = eventAngleStats(s, recent.eventId!).find((a) => !(a.taken && a.median !== null && a.median < 1))!.angle;
    const ask = askFrom(s, (r) => {
      const c = candidates(s, r);
      if (r === 1) {
        c[1] = { ...c[0] };
        c[2] = { ...c[2], title: recent.title, angle: recent.angle, hookForm: recent.hookForm!, trigger: recent.hookTrigger!, clusterId: null, eventId: recent.eventId!, angleClass: fresh, evidence: [] };
      }
      return c;
    });
    const r = await generateBatch(s, { now: NOW, ask });
    expect(r.outcome.duplicates).toBeGreaterThanOrEqual(2);
    const titles = s.ideas.all().filter((i) => i.batchId === r.outcome.batchId).map((i) => i.title);
    expect(titles.filter((t) => t === candidates(s, 1)[0].title).length).toBeLessThanOrEqual(1);
    expect(titles).not.toContain(recent.title);
  });

  test('AC-07-6: hard caps hold on the batch; unmet soft minimums are named', async () => {
    const s = world();
    // every candidate in one hook cell and one cluster: caps bind hard
    const first = candidates(s, 1)[0];
    const ask = askFrom(s, (r) => candidates(s, r).map((c) => ({ ...c, hookForm: 'results_first', trigger: 'curiosity', clusterId: first.clusterId, evidence: first.evidence, probability: 0.5 }) as VsCandidate));
    const r = await generateBatch(s, { now: NOW, ask });
    const kept = s.ideas.all().filter((i) => i.batchId === r.outcome.batchId);
    expect(kept.length).toBeLessThanOrEqual(QUOTAS.maxPerHookCell);
    expect(r.outcome.unmetQuotas).toEqual(expect.arrayContaining(['minHookForms', 'minTail']));
  });

  test('AC-07-7: a failed round is recorded and the batch completes; all rounds failing is an error (CLI missing flagged)', async () => {
    const s = world();
    const r = await generateBatch(s, { now: NOW, ask: askFrom(s, (round) => (round === 2 ? 'fail' : candidates(s, round))) });
    expect(r.outcome.rounds).toEqual([
      { round: 1, ok: true, candidates: 8, error: null },
      { round: 2, ok: false, candidates: 0, error: 'round 2 failed: bad reply' },
      { round: 3, ok: true, candidates: 8, error: null },
    ]);
    expect(r.added.length).toBeGreaterThan(0);
    await expect(generateBatch(s, { now: NOW, ask: askFrom(s, () => 'fail') })).rejects.toMatchObject({ name: 'GenerateError', unavailable: false });
    const missing = await generateBatch(s, { now: NOW, ask: askFrom(s, () => 'missing') }).catch((e) => e);
    expect(missing).toBeInstanceOf(GenerateError);
    expect(missing.unavailable).toBe(true);
    expect(missing.outcome.rounds.every((x: { ok: boolean }) => !x.ok)).toBe(true);
  });

  test('AC-07-8: dry spawns no CLI process and is deterministic across two runs', async () => {
    process.env.LAB_DRY = '1';
    const a = world();
    const b = world();
    const ra = await generateBatch(a, { now: NOW });
    const rb = await generateBatch(b, { now: NOW });
    expect(cp.execFile).not.toHaveBeenCalled();
    expect(cp.spawn).not.toHaveBeenCalled();
    expect(ra.by).toBe('dry');
    expect(ra.outcome.candidates).toBe(24);
    expect(ra.added.length).toBeGreaterThan(0);
    const shape = (r: typeof ra) => r.added.map((i) => [i.title, i.mmrRank, i.hookForm, i.vsProbability]);
    expect(shape(ra)).toEqual(shape(rb));
    expect(ra.added.every((i) => i.promptVersion === 'dry')).toBe(true);
  });
});

describe('MMR with quotas (7.3.5)', () => {
  const item = (id: string, rel: number, extra: Partial<MmrItem> = {}): MmrItem => ({ id, rel, vsProbability: 0.5, title: id, hookCell: `cell-${id}`, hookForm: `form-${id}`, topic: `topic-${id}`, untaken: false, ...extra });
  const COS: Record<string, number> = { 'A|B': 0.7, 'A|C': 0.2, 'A|D': 0.3, 'B|C': 0.25, 'B|D': 0.4, 'C|D': 0.1 };
  const cos = (a: MmrItem, b: MmrItem) => COS[[a.id, b.id].sort().join('|')] ?? 0;
  const off = { minHookForms: 0, minUntakenAngles: 0, minTail: 0 };

  test('AC-07-5: the worked example picks A then C', () => {
    const r = mmrSelect([item('A', 0.8), item('B', 0.78), item('C', 0.6), item('D', 0.55)], cos, { k: 2, lambda: 0.6, quotas: off });
    expect(r.selected.map((x) => x.id)).toEqual(['A', 'C']);
    expect(r.unmet).toEqual([]);
  });

  test('AC-07-6: no hook cell more than 2, no topic more than 3; soft minimums met when the pool can supply them', () => {
    const pool = Array.from({ length: 12 }, (_, i) => item(`x${String(i).padStart(2, '0')}`, 0.9 - i * 0.01, { hookCell: i < 6 ? 'same' : `c${i}`, hookForm: i < 6 ? 'same' : `f${i}`, topic: i < 6 && i % 2 ? 't1' : `t${i}`, untaken: i >= 8, vsProbability: i >= 10 ? 0.05 : 0.5 }));
    const r = mmrSelect(pool, () => 0, { k: 10 });
    const cells = new Map<string, number>();
    const topics = new Map<string, number>();
    for (const s of r.selected) {
      cells.set(s.hookCell, (cells.get(s.hookCell) ?? 0) + 1);
      topics.set(s.topic, (topics.get(s.topic) ?? 0) + 1);
    }
    expect(Math.max(...cells.values())).toBeLessThanOrEqual(2);
    expect(Math.max(...topics.values())).toBeLessThanOrEqual(3);
    expect(r.selected.filter((s) => s.untaken).length).toBe(4);
    expect(r.selected.filter((s) => s.vsProbability < 0.1).length).toBe(2);
    expect(new Set(r.selected.map((s) => s.hookForm)).size).toBeGreaterThanOrEqual(4);
    expect(r.unmet).toEqual([]);
    const thin = mmrSelect(pool.slice(0, 6), () => 0, { k: 10 });
    expect(thin.unmet).toEqual(['minHookForms', 'minUntakenAngles', 'minTail']);
  });

  test('ties break by rel, then lower vsProbability, then title', () => {
    const r = mmrSelect([item('b', 0.5, { vsProbability: 0.3 }), item('a', 0.5, { vsProbability: 0.3 }), item('c', 0.5, { vsProbability: 0.05 })], () => 0, { k: 3, quotas: off });
    expect(r.selected.map((x) => x.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('Studio Generate states and the diversity line (7.3.7, 7.3.8; AC-07-9, AC-07-10)', () => {
  test('AC-07-9: disabled at 30 open ideas and with no material, with the 7.3.8 copy', () => {
    const s = world();
    expect(generateState(s, {}).state).toBe('ready');
    expect(generateState(s, {}).line).toBe('Writes 24, keeps the 10 most different. Local model, no cost.');
    expect(generateState(s, { dry: true })).toMatchObject({ state: 'dry', line: 'Dry run: no model is called.' });
    expect(generateState(s, { sample: true }).state).toBe('read_only');
    const base = s.ideas.get('fx-idea-1')!;
    for (let i = s.ideas.all('open').length; i < OPEN_CAP; i++) s.ideas.upsert({ ...base, id: `fill-${i}`, title: `Filler ${i}` });
    expect(generateState(s, {})).toEqual({ state: 'full', line: '30 open ideas. Use or dismiss some first.', disabledReason: '30 open ideas. Use or dismiss some first.' });
    const empty = fresh();
    expect(generateState(empty, {})).toEqual({ state: 'no_material', line: GEN_COPY.noMaterial, disabledReason: 'Generate needs scraped posts first. Run a sync.' });
  });

  test('AC-07-10: under 5 open ideas the spread reads not enough yet; at 5 or more it gives a percent with n', () => {
    const s = world();
    const open = s.ideas.all('open');
    expect(diversityLine(s).text).toMatch(new RegExp(`^Spread: ideas are \\d+% alike on average \\(n ${open.length}\\)\\.$`));
    for (const i of open.slice(4)) s.ideas.setStatus(i.id, 'dismissed');
    expect(diversityLine(s).text).toBe('Spread: not enough yet (n 4).');
    expect(studioView(s, { now: NOW }).diversity).toEqual({ text: 'Spread: not enough yet (n 4).', n: 4 });
  });
});
