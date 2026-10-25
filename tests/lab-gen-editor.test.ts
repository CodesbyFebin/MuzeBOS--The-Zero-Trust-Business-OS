import { afterEach, describe, expect, test, vi } from 'vitest';
import type { LabIdea, LabPrediction } from '@/lib/schemas';
import { generateScript } from '@/lib/lab/scripts';
import { publishCandidates, restoreVersion, scriptEngineConcept, scriptWizardPrefill, setDuration, setHook, setPlatform, EditorError, judgeScriptHooks } from '@/lib/lab/gen/editor';
import { missingSkillCopy, skillPresence, voiceSkillsFor } from '@/lib/lab/gen/skills';
import { GEN_COPY, frozenText, scriptSheetView } from '@/lib/lab/gen/view';
import { payloadSha256 } from '@/lib/lab/fixtures/ledger';
import { T, addPost, baseWorld } from './lab-gen-helpers';

vi.mock('node:child_process', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:child_process')>();
  return { ...real, execFile: vi.fn(real.execFile), spawn: vi.fn(real.spawn) };
});
const cp = await import('node:child_process');

/**
 * Script editor server behaviour (07 7.8, 7.10): AC-07-31 to AC-07-35. Scripts are drafted dry
 * (no model); every edit control below must add exactly one version and never call the model.
 */

afterEach(() => {
  delete process.env.LAB_DRY;
  delete process.env.LAB_JUDGE;
  vi.mocked(cp.execFile).mockClear();
});

const IDEA: LabIdea = { id: 'idea-e', title: 'Voice agents on support calls', clusterId: null, angle: 'real support calls', tension: null, formatFamily: 'tutorial_walkthrough', strand: [], hookRecs: [{ form: 'results_first', trigger: 'curiosity', lift: null, n: 4 }, { form: 'contrarian', trigger: 'controversy', lift: null, n: 3 }, { form: 'open_loop', trigger: 'curiosity', lift: null, n: 2 }], evidence: [{ postId: 'b1', why: '' }, { postId: 'b2', why: '' }], timing: null, fit: 0.5, thin: false, status: 'open', dismissReason: null, createdAt: T.toISOString(), actedOnAt: null };

async function drafted() {
  process.env.LAB_DRY = '1';
  const s = baseWorld();
  addPost(s, { id: 'b1', source: 'src-c1', ratio: 6, hook: 'Voice agents on support calls' });
  addPost(s, { id: 'b2', source: 'src-c2', ratio: 5, hook: 'Support calls with a voice agent' });
  s.ideas.upsert(IDEA);
  const r = await generateScript(s, IDEA.id, { now: T, readSkill: () => null, context: '' });
  delete process.env.LAB_DRY;
  return { s, id: r.scriptId };
}

describe('version controls never call the model (AC-07-31)', () => {
  test('set_hook, set_duration, set_platform and restore_version each add exactly one version', async () => {
    const { s, id } = await drafted();
    const runsBefore = s.runs.recent(100).length;
    vi.mocked(cp.execFile).mockClear();
    const v1 = s.scripts.latestVersion(id)!;
    expect(v1.version).toBe(1);
    expect(v1.gate.rulesVersion).toBe('rules-v1');
    const a = setHook(s, id, 1, { now: T });
    expect(a.version).toBe(2);
    expect(a.body.hookChoice).toBe(1);
    const b = setDuration(s, id, 60, { now: T });
    expect(b.version).toBe(3);
    expect(b.body.durationS).toBe(60);
    expect(b.body.sections.map((x) => x.spoken)).toEqual(v1.body.sections.map((x) => x.spoken));
    const c = setPlatform(s, id, 'instagram', { now: T });
    expect(c.version).toBe(4);
    expect(c.body.platform).toBe('instagram');
    const d = restoreVersion(s, id, 1, { now: T });
    expect(d.version).toBe(5);
    expect(d.body).toMatchObject({ hookChoice: v1.body.hookChoice, durationS: v1.body.durationS, platform: v1.body.platform });
    expect(s.scripts.versions(id).map((v) => v.version)).toEqual([1, 2, 3, 4, 5]);
    expect(s.scripts.versions(id).every((v) => v.gate.rulesVersion === 'rules-v1')).toBe(true);
    expect(cp.execFile).not.toHaveBeenCalled();
    expect(s.runs.recent(100).length).toBe(runsBefore);
    expect(() => setHook(s, id, 9)).toThrow(EditorError);
    expect(() => setDuration(s, id, 5)).toThrow(/10 to 1800/);
    expect(() => restoreVersion(s, id, 42)).toThrow(/no such version/);
  });

  test('judge_hooks writes no version and stores the wins for the sheet', async () => {
    const { s, id } = await drafted();
    process.env.LAB_DRY = '1';
    const r = await judgeScriptHooks(s, id, { now: T });
    expect(s.scripts.versions(id)).toHaveLength(1);
    expect(r.verdicts.length).toBe(3);
    const view = scriptSheetView(s, id, { now: T })!;
    expect(view.hooks.map((h) => h.judgeWins)).not.toContain(null);
    expect(view.judge.message).toMatch(/^Judge leans [ABC] \(not a forecast; record 0 of 0, at chance until n 20\)$/);
  });
});

describe('the script sheet view (7.8; AC-07-32)', () => {
  test('AC-07-32 (view part): an unpublished, unfrozen, failing script has no frozen prediction; a frozen one carries the seal text from the frozenAt template', async () => {
    const { s, id } = await drafted();
    s.scripts.addVersion({ ...s.scripts.latestVersion(id)!, version: 2, gate: { passed: false, checks: [{ id: 'no-dashes', label: 'No dashes', ok: false, detail: 'x', section: null }], scores: null, rules: [], rulesVersion: 'rules-v1' } });
    const open = scriptSheetView(s, id, { now: T })!;
    expect(open.gate.passed).toBe(false);
    expect(open.status).toBe('draft');
    expect(open.prediction.state).not.toBe('frozen');
    expect(open.prediction.frozenText).toBe(null);
    const at = '2026-10-11T03:02:00.000Z';
    const row: Omit<LabPrediction, 'payloadSha256'> = {
      id: 'pred-x', origin: 'live', predictor: 'brody', predictorVersion: 'brody-1', kind: 'pre_post', scriptId: id, scriptVersion: 1, postId: null, sourceId: null, platform: null, surface: null, refAgeH: 168, asOf: at, frozenAt: at, backtestOrigin: null,
      band: 'above', score: null, ratioPoint: null, ratioLo: null, ratioHi: null, viewsPoint: null, viewsLo: null, viewsHi: null, pBreakout: null, intervalLevel: null, baseline7dViews: null, baselineN: null,
      inputs: {}, note: '', late: false, status: 'frozen', voidReason: null, voidedAt: null, outcomeViews7d: null, outcomeRatio7d: null, outcomeBand: null, outcomeIsBreakout: null, outcomeMethod: null, hitBand: null, inInterval: null, absLogErr: null, testId: null, pairRight: null, gradedAt: null, dry: false,
    };
    s.predictions.insert({ ...row, payloadSha256: payloadSha256(row) });
    const frozen = scriptSheetView(s, id, { now: T })!;
    expect(frozen.prediction).toMatchObject({ state: 'frozen', frozenAt: at, frozenVersion: 1, band: 'above' });
    expect(frozen.prediction.frozenText).toMatch(/^Frozen \d{1,2} [A-Z][a-z]{2}, \d{2}:\d{2}$/);
    expect(frozen.versions.find((v) => v.version === 1)?.frozen).toBe(true);
    expect(GEN_COPY.frozenAt).toBe('Frozen {d MMM}, {HH:mm}');
    expect(frozenText('2026-10-11T14:02:00.000Z', 'UTC')).toBe('Frozen 11 Oct, 14:02');
  });

  test('AC-07-25: a v1 version (no rules, no loops) renders with defaults', async () => {
    const { s, id } = await drafted();
    const v = s.scripts.latestVersion(id)!;
    const { platform: _p, loops: _l, withheld: _w, peakSection: _k, endType: _e, grounding: _g, arm: _a, armP: _ap, ...v1body } = v.body;
    s.scripts.addVersion({ ...v, version: 2, body: v1body, gate: { passed: true, checks: [], scores: null } });
    const view = scriptSheetView(s, id, { now: T })!;
    expect(view.version).toBe(2);
    expect(view.body).toMatchObject({ platform: 'multi', loops: [], withheld: '', arm: 'grounded' });
    expect(view.gate).toMatchObject({ passed: true, toFix: 0, toConsider: 0, rules: [] });
  });
});

describe('publish picker and hand-offs (AC-07-33, AC-07-34)', () => {
  test('AC-07-33: candidates are owned posts from the last 7 days, ranked by cosine to the script', async () => {
    const { s, id } = await drafted();
    const spoken = s.scripts.latestVersion(id)!.body.sections.map((x) => x.spoken).join(' ');
    addPost(s, { id: 'own-match', source: 'src-own', owned: true, ratio: 1, ageH: 30, hook: spoken.slice(0, 200), caption: spoken });
    addPost(s, { id: 'own-other', source: 'src-own', owned: true, ratio: 1, ageH: 20, hook: 'Unrelated cooking clip', caption: 'pasta night' });
    addPost(s, { id: 'own-old', source: 'src-own', owned: true, ratio: 1, ageH: 24 * 9, hook: spoken.slice(0, 200), caption: spoken });
    addPost(s, { id: 'tracked-match', source: 'src-c3', ratio: 1, ageH: 10, hook: spoken.slice(0, 200), caption: spoken });
    const c = publishCandidates(s, id, { now: T });
    expect(c.map((x) => x.postId)).toEqual(['own-match', 'own-other']);
    expect(c[0].similarity!).toBeGreaterThan(c[1].similarity!);
    expect(scriptSheetView(s, id, { now: T })!.publishCandidates.map((x) => x.postId)).toEqual(['own-match', 'own-other']);
  });

  test('AC-07-34: ask_wizard returns a prefill with broadcast false and never sends; send_engine appends the chosen hook', async () => {
    const { s, id } = await drafted();
    const p = scriptWizardPrefill(s, id);
    expect(p.broadcast).toBe(false);
    expect(p.source).toBe('content-lab');
    expect(p.text).toMatch(/^Content Lab script: Voice agents on support calls\. Hook: ".+"\. Gate (passed|not passed: \d+ to fix)\. .+, \d+s\. What would you change before I film it\?$/);
    const concept = scriptEngineConcept(s, id);
    expect(concept.text).toContain('Hook: "');
    expect(concept.text.length).toBeLessThanOrEqual(300);
  });
});

describe('voice skills (7.10; AC-07-35)', () => {
  test('the routing table holds for each case', () => {
    expect(voiceSkillsFor({ formatFamily: 'tutorial_walkthrough' }, { durationS: 240 })).toEqual(['brody-voice-youtube', 'brody-voice-speaking']);
    expect(voiceSkillsFor({ formatFamily: 'long_form' }, { durationS: 60 })).toEqual(['brody-voice-youtube', 'brody-voice-speaking']);
    expect(voiceSkillsFor({ formatFamily: 'skit' }, { durationS: 45 })).toEqual(['brody-satirical-video', 'reel']);
    expect(voiceSkillsFor({ formatFamily: 'carousel' }, { durationS: 45, platform: 'linkedin' })).toEqual(['brody-voice-writing']);
    expect(voiceSkillsFor({ formatFamily: 'text_post' }, { durationS: 45, platform: 'linkedin' })).toEqual(['brody-voice-writing']);
    expect(voiceSkillsFor({ formatFamily: 'carousel' }, { durationS: 45, platform: 'instagram' })).toEqual(['reel', 'brody-voice-speaking']);
    expect(voiceSkillsFor(null, { durationS: 45 })).toEqual(['reel', 'brody-voice-speaking']);
  });

  test('a missing skill is found false and the sheet copy names it', () => {
    const p = skillPresence(['reel', 'brody-voice-speaking'], (slug) => (slug === 'reel' ? '# reel' : null));
    expect(p).toEqual([{ slug: 'reel', found: true }, { slug: 'brody-voice-speaking', found: false }]);
    expect(missingSkillCopy('brody-voice-speaking')).toBe('Voice skill brody-voice-speaking is not on this host. This draft was written without it.');
  });
});
