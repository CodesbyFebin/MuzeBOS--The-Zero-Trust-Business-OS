import { afterEach, describe, expect, test, vi } from 'vitest';
import type { LabPrediction } from '@/lib/schemas';
import { payloadSha256 } from '@/lib/lab/fixtures/ledger';
import { judgeHooks, judgeMessage, judgePair, judgeRecord, judgeState, type JudgeAsk } from '@/lib/lab/gen/judge';
import { T, emptyStore } from './lab-gen-helpers';

vi.mock('@/lib/lab/ledger/freeze', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/lab/ledger/freeze')>();
  return { ...real, recordJudgeVerdict: vi.fn(() => ({}) as LabPrediction) };
});
vi.mock('node:child_process', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:child_process')>();
  return { ...real, execFile: vi.fn(real.execFile) };
});
const freeze = await import('@/lib/lab/ledger/freeze');
const cp = await import('node:child_process');

/**
 * The pairwise hook judge (07 7.7): AC-07-27 to AC-07-30. The model is a fake; the ledger write
 * (06's recordJudgeVerdict, lane L) is a spy, so these tests prove when it is and is not called.
 */

afterEach(() => {
  delete process.env.LAB_JUDGE;
  delete process.env.LAB_DRY;
  vi.mocked(freeze.recordJudgeVerdict).mockClear();
  vi.mocked(cp.execFile).mockClear();
});

const CTX = { platform: 'tiktok', format: 'Tutorial', durationS: 45 };
const A = { id: 'h-a', text: 'I put a voice agent on 40 support calls' };
const B = { id: 'h-b', text: 'Nobody shows the bill for voice agents' };

/** A fake that picks the line it is shown first (A in AB, B in BA: opposite ids) or always the same id. */
const askPicking = (mode: 'first' | 'always-a'): JudgeAsk =>
  vi.fn(async (prompt: string) => {
    const first = prompt.match(/A: "(.*)"/)![1];
    if (mode === 'first') return { ok: true as const, data: { pick: 'A' as const, why: 'first' } };
    return { ok: true as const, data: { pick: first === A.text ? ('A' as const) : ('B' as const), why: 'a' } };
  });

function seedRecord(n: number, right: number) {
  const s = emptyStore();
  for (let i = 0; i < n; i++) {
    const at = new Date(T.getTime() - (5 + i) * 86_400_000).toISOString();
    const row: Omit<LabPrediction, 'payloadSha256'> = {
      id: `jp-${i}`, origin: 'live', predictor: 'judge', predictorVersion: 'judge-v1', kind: 'pairwise', scriptId: null, scriptVersion: null, postId: null, sourceId: null, platform: null, surface: null, refAgeH: null, asOf: at, frozenAt: at, backtestOrigin: null,
      band: null, score: null, ratioPoint: null, ratioLo: null, ratioHi: null, viewsPoint: null, viewsLo: null, viewsHi: null, pBreakout: null, intervalLevel: null, baseline7dViews: null, baselineN: null,
      inputs: { aId: 'a', bId: 'b', winner: 'a' }, note: '', late: false, status: 'graded', voidReason: null, voidedAt: null,
      outcomeViews7d: null, outcomeRatio7d: null, outcomeBand: null, outcomeIsBreakout: null, outcomeMethod: null, hitBand: null, inInterval: null, absLogErr: null, testId: `t-${i}`, pairRight: i < right, gradedAt: at, dry: false,
    };
    s.predictions.insert({ ...row, payloadSha256: payloadSha256(row) });
  }
  return s;
}

describe('judgePair (7.7)', () => {
  test('AC-07-27: opposite picks across the two orders abstain, winner null, and write no ledger row', async () => {
    const s = emptyStore();
    const ask = askPicking('first');
    const v = await judgePair(s, A, B, CTX, { ask, now: T, scriptId: 'script-1' });
    expect(ask).toHaveBeenCalledTimes(2);
    expect(v).toMatchObject({ aId: 'h-a', bId: 'h-b', pickAB: 'A', pickBA: 'A', winner: null, abstained: true });
    expect(freeze.recordJudgeVerdict).not.toHaveBeenCalled();
    // agreeing picks name a winner and are written as a judge prediction
    const v2 = await judgePair(s, A, B, CTX, { ask: askPicking('always-a'), now: T, scriptId: 'script-1' });
    expect(v2).toMatchObject({ winner: 'h-a', abstained: false, pickAB: 'A', pickBA: 'B' });
    expect(freeze.recordJudgeVerdict).toHaveBeenCalledOnce();
    expect(vi.mocked(freeze.recordJudgeVerdict).mock.calls[0][1]).toMatchObject({ scriptId: 'script-1', aId: 'h-a', bId: 'h-b', winner: 'h-a', abstained: false, promptVersion: 'judge-v1', dry: false });
    // each call is gated and logged as a judge run
    expect(s.runs.recent(10).filter((r) => r.kind === 'judge')).toHaveLength(4);
  });

  test('the prompt asks for the 3 second hold and strict JSON', async () => {
    const prompts: string[] = [];
    await judgePair(emptyStore(), A, B, CTX, { ask: vi.fn(async (p: string) => (prompts.push(p), { ok: true as const, data: { pick: 'A' as const, why: '' } })), now: T });
    expect(prompts[0]).toContain('Two opening lines for the same 45s Tutorial video on tiktok.');
    expect(prompts[0]).toContain('Which one keeps that viewer watching past 3 seconds?');
    expect(prompts[1]).toContain(`A: "${B.text}"`);
  });

  test('dry: the shorter hook wins both orders, nothing is written, no CLI process', async () => {
    process.env.LAB_DRY = '1';
    const v = await judgePair(emptyStore(), A, B, CTX, { now: T, scriptId: 's' });
    expect(v.winner).toBe('h-b');
    expect(v.abstained).toBe(false);
    expect(freeze.recordJudgeVerdict).not.toHaveBeenCalled();
    expect(cp.execFile).not.toHaveBeenCalled();
  });
});

describe('judgeRecord and the auto-disable (7.7; AC-07-28 to AC-07-30)', () => {
  test('AC-07-28: 13 of 20 is off, 15 of 20 is on, 10 of 12 is learning', () => {
    expect(judgeState(13, 20)).toEqual({ n: 20, right: 13, rate: 0.65, lo: 0.47, hi: 0.8, state: 'off' });
    expect(judgeState(15, 20)).toMatchObject({ rate: 0.75, lo: 0.57, hi: 0.87, state: 'on' });
    expect(judgeState(10, 12).state).toBe('learning');
    expect(judgeRecord(seedRecord(20, 13), T)).toMatchObject({ n: 20, right: 13, state: 'off' });
    expect(judgeRecord(seedRecord(20, 15), T)).toMatchObject({ n: 20, right: 15, state: 'on' });
    expect(judgeRecord(seedRecord(12, 10), T)).toMatchObject({ n: 12, right: 10, state: 'learning' });
    expect(judgeRecord(emptyStore(), T)).toEqual({ n: 0, right: 0, rate: null, lo: null, hi: null, state: 'learning' });
  });

  test('AC-07-29: in state off, judge_hooks still records verdicts but keeps the generator order and shows the off copy', async () => {
    const s = seedRecord(20, 13);
    const hooks = [{ id: 'h0', text: 'A long first hook about the voice agent bill' }, { id: 'h1', text: 'Second hook' }, { id: 'h2', text: 'Third hook, medium length' }];
    // a judge that always prefers the shortest line: it would reorder 1, 2, 0
    const ask: JudgeAsk = vi.fn(async (p: string) => {
      const [, a] = p.match(/A: "(.*)"/)!;
      const [, b] = p.match(/B: "(.*)"/)!;
      return { ok: true as const, data: { pick: a.length <= b.length ? ('A' as const) : ('B' as const), why: '' } };
    });
    const r = await judgeHooks(s, hooks, CTX, { ask, now: T, scriptId: 'script-1' });
    expect(r.record.state).toBe('off');
    expect(r.applied).toBe(false);
    expect(r.order).toEqual([0, 1, 2]);
    expect(r.verdicts).toHaveLength(3);
    expect(freeze.recordJudgeVerdict).toHaveBeenCalledTimes(3);
    expect(judgeMessage(r.record, 'B')).toBe('Judge off: 13 of 20 in 90 days, no better than a coin. It keeps a silent record and comes back if that changes.');
    // learning: the order is applied
    const on = await judgeHooks(seedRecord(5, 4), hooks, CTX, { ask, now: T, scriptId: 'script-1' });
    expect(on.order).toEqual([1, 2, 0]);
    expect(judgeMessage(on.record, 'B')).toBe('Judge leans B (not a forecast; record 4 of 5, at chance until n 20)');
    expect(judgeMessage(judgeState(15, 20), 'A')).toBe('Judge leans A (right 15 of 20 in 90 days)');
  });

  test('AC-07-30: LAB_JUDGE=0 spawns no CLI process and calls no model', async () => {
    process.env.LAB_JUDGE = '0';
    const ask = vi.fn();
    const r = await judgeHooks(emptyStore(), [A, B], CTX, { ask: ask as unknown as JudgeAsk, now: T });
    expect(ask).not.toHaveBeenCalled();
    expect(cp.execFile).not.toHaveBeenCalled();
    expect(r.verdicts).toEqual([]);
    expect(r.order).toEqual([0, 1]);
    expect(judgeMessage(r.record, null)).toBe('Judge disabled in Setup.');
  });
});
