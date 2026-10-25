import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { LAB_DDL } from '@/lib/db';
import { labStore } from '@/lib/lab/store';
import { LabScriptBodySchema, type LabScriptBody } from '@/lib/schemas';
import { BAND_MIN_N, LEXICON_SHA256, NICHE_PRIOR_BAND, concreteness, fetchLexicon, fitBand, fitConcretenessBand, loadLexicon, parseLexicon, sha256Hex, type Lexicon } from '@/lib/lab/gen/lexicon';
import { LINKEDIN_BAIT, OUTGROUP_SNEER, X_HOSTILITY } from '@/lib/lab/gen/risk';
import { RULEPACK_VERSION, RULE_META, applyRules, bodyV2, gateCounts, hookConcreteness, hookReferent, loopRules, originality, riskRules, runRules, type RuleContext } from '@/lib/lab/gen/rules';
import { deterministicGate } from '@/lib/lab/gate';
import { withV2Defaults } from '@/lib/lab/gen/view';

/**
 * The deterministic rule pack (07 7.6): AC-07-17 to AC-07-26. The concreteness lexicon is a
 * 40-row test file holding exactly the 7.6.1 worked-example values (the real lexicon is never
 * committed); nothing here reaches the network.
 */

const WORDS: [string, number][] = [
  // hook 1
  ['i', 3.93], ['built', 3.5], ['a', 1.46], ['agent', 3.61], ['that', 1.54], ['answers', 2.89], ['my', 2.42], ['email', 4.69], ['in', 3.0], ['seconds', 3.3],
  // hook 2
  ['this', 2.14], ['one', 3.97], ['trick', 3.36], ['changes', 2.89], ['everything', 2.3], ['about', 1.77], ['how', 1.35], ['you', 4.11], ['work', 3.48],
  // hook 3
  ['nobody', 2.32], ['is', 1.59], ['talking', 3.72], ['new', 2.81], ['thing', 3.17],
];
const FILLER: [string, number][] = Array.from({ length: 15 }, (_, i) => [`filler${i}`, 2 + i / 10]);
const CSV = ['﻿Word,Bigram,Conc.M,Conc.SD,Unknown,Total,Percent_known,SUBTLEX', ...[...WORDS, ...FILLER].map(([w, v]) => `${w},0,${v},1.0,0,30,1,100`), 'ice cream,1,4.9,0.3,0,30,1,50'].join('\n');
const LEX: Lexicon = parseLexicon(CSV);

const ctx = (over: Partial<RuleContext> = {}): RuleContext => ({ lexicon: LEX, band: { lo: NICHE_PRIOR_BAND[0], hi: NICHE_PRIOR_BAND[1], source: 'prior', n: 0 }, isReact: false, ...over });

const words = (n: number, w = 'word') => Array.from({ length: n }, () => w).join(' ');
function body(over: Partial<LabScriptBody> = {}): LabScriptBody {
  return LabScriptBodySchema.parse({
    durationS: 45,
    wpm: 160,
    hooks: [{ form: 'results_first', trigger: 'curiosity', spoken: 'I built a Claude agent that answers my email in 4 seconds', onScreen: '', words: 12 }],
    hookChoice: 0,
    sections: [
      { type: 'hook', startPct: 0, endPct: 10, spoken: 'I built a Claude agent that answers my email in 4 seconds.', onScreen: '', visualNote: '' },
      { type: 'context', startPct: 10, endPct: 30, spoken: 'Most inboxes eat the morning.', onScreen: '', visualNote: '' },
      { type: 'demo', startPct: 30, endPct: 50, spoken: 'Here is the setup with the filter rules.', onScreen: '', visualNote: '' },
      { type: 'reveal', startPct: 50, endPct: 75, spoken: 'The secret is a draft folder the agent fills overnight.', onScreen: '', visualNote: '' },
      { type: 'payoff', startPct: 75, endPct: 92, spoken: 'Now my inbox is empty before coffee.', onScreen: '', visualNote: '' },
      { type: 'cta', startPct: 92, endPct: 100, spoken: 'Follow for the setup file.', onScreen: '', visualNote: '' },
    ],
    cta: 'Follow for the setup file.',
    caption: 'Inbox zero with one agent.',
    titles: ['Inbox agent'],
    platform: 'tiktok',
    loops: [{ id: 'L1', question: 'How does it answer so fast?', answer: 'a draft folder the agent fills overnight', opens: 0, closes: 3 }],
    withheld: 'the overnight draft folder',
    peakSection: 4,
    endType: 'payoff',
    ...over,
  });
}

describe('hook concreteness (7.6.1, AC-07-17 to AC-07-19, AC-07-24)', () => {
  test('AC-07-17: the three worked hooks score 3.36, 2.82 and 2.50 against the 40-row test lexicon', () => {
    expect(LEX.words.size + LEX.bigrams.size).toBe(40);
    expect(concreteness('I built a Claude agent that answers my email in 4 seconds', LEX).score).toBe(3.36);
    expect(concreteness('This one trick changes everything about how you work', LEX).score).toBe(2.82);
    expect(concreteness('Nobody is talking about this new thing', LEX).score).toBe(2.5);
    const c = concreteness('I built a Claude agent that answers my email in 4 seconds', LEX);
    expect(c.perToken.find((t) => t.token === 'Claude')?.value).toBe(5);
    expect(c.perToken.find((t) => t.token === '4')?.value).toBe(5);
  });

  test('bigrams score once, suffixes fall back in order, under 60% known words is null', () => {
    expect(concreteness('I want ice cream', LEX).perToken.map((t) => t.token)).toEqual(['I', 'want', 'ice cream']);
    expect(concreteness('nobody talks', LEX).perToken[1].value).toBe(null); // 'talk' is not in the test lexicon
    expect(concreteness('zz yy xx is', LEX).score).toBe(null);
  });

  test('the rule reads the band: inside, below and above, warn only', () => {
    const inside = hookConcreteness(body({ hooks: [{ form: 'results_first', trigger: 'curiosity', spoken: 'This one trick changes everything about how you work', onScreen: '', words: 9 }] }), ctx());
    expect(inside).toMatchObject({ ok: true, severity: 'warn', value: 2.82 });
    expect(inside.detail).toBe('Concreteness 2.82, inside the niche prior (news headlines, 2013 to 2015) 2.58 to 3.06.');
    const low = hookConcreteness(body({ hooks: [{ form: 'results_first', trigger: 'curiosity', spoken: 'Nobody is talking about this new thing', onScreen: '', words: 7 }] }), ctx());
    expect(low.detail).toBe('Concreteness 2.50. Below 2.58: name the tool, number or person.');
    const high = hookConcreteness(body(), ctx());
    expect(high.ok).toBe(false);
    expect(high.detail).toBe('Concreteness 3.36. Above 3.06: hold one thing back. Never withhold the topic itself.');
    expect(high.severity).toBe('warn');
  });

  test('AC-07-19: a missing lexicon makes the rule info and ok, and the gate can still pass', () => {
    const r = hookConcreteness(body(), ctx({ lexicon: null }));
    expect(r).toMatchObject({ ok: true, severity: 'info', detail: 'Lexicon not installed. Fetch it in Setup.' });
    const b = body();
    const gate = applyRules({ passed: true, checks: [{ id: 'x', label: 'x', ok: true, detail: '', section: null }], scores: null }, runRules(b, ctx({ lexicon: null })));
    expect(gate.passed).toBe(true);
    expect(gate.rulesVersion).toBe(RULEPACK_VERSION);
  });

  test('AC-07-18: fetchLexicon rejects a file whose hash differs and leaves nothing at the path', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-lex-'));
    const file = path.join(dir, 'lab', 'lexicon', 'concreteness.csv');
    const fakeFetch = async () => new Response(CSV, { status: 200 });
    const bad = await fetchLexicon({ fetch: fakeFetch, file });
    expect(bad).toEqual({ ok: false, error: 'The downloaded file does not match the pinned version.' });
    expect(fs.existsSync(file)).toBe(false);
    expect(fs.existsSync(path.dirname(file)) ? fs.readdirSync(path.dirname(file)) : []).toEqual([]);
    // with the matching hash it writes atomically and loads; a hash mismatch on load reads as missing
    const good = await fetchLexicon({ fetch: fakeFetch, file, sha256: sha256Hex(Buffer.from(CSV)) });
    expect(good).toEqual({ ok: true });
    expect(loadLexicon(file, { sha256: sha256Hex(Buffer.from(CSV)) })?.words.get('agent')).toBe(3.61);
    expect(loadLexicon(file)).toBe(null); // not the pinned LEXICON_SHA256
    expect(LEXICON_SHA256).toMatch(/^[0-9a-f]{64}$/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('AC-07-24: the fitted band keeps the prior under n 30 and adopts only separated terciles', () => {
    const few = fitBand(Array.from({ length: 29 }, (_, i) => ({ score: 2 + i / 20, ratio: 1 })));
    expect(few).toMatchObject({ adopted: false, reason: 'not_enough', text: `Your data: not enough yet (n 29 of ${BAND_MIN_N})` });
    // separated: the middle tercile's ratios all sit far above the others
    const sep = Array.from({ length: 30 }, (_, i) => ({ score: 2 + i * 0.05, ratio: i >= 10 && i < 20 ? 3 + (i % 3) * 0.1 : 0.8 + (i % 3) * 0.05 }));
    const fit = fitBand(sep);
    expect(fit.adopted).toBe(true);
    if (fit.adopted) expect([fit.band.lo, fit.band.hi]).toEqual([2.5, 2.95]);
    // overlapping terciles: no adoption
    const flat = fitBand(Array.from({ length: 30 }, (_, i) => ({ score: 2 + i * 0.05, ratio: 1 + (i % 5) * 0.2 })));
    expect(flat).toMatchObject({ adopted: false, reason: 'no_separation' });
  });

  test('fitConcretenessBand stores the adopted band as a prior and removes it otherwise', () => {
    const db = new Database(':memory:');
    db.exec(LAB_DDL);
    const s = labStore(db);
    const fit = fitConcretenessBand(s, 'talking_head', { lexicon: LEX });
    expect(fit.adopted).toBe(false);
    expect(s.priors.get('yours:concreteness:talking_head')).toBe(null);
  });
});

describe('referent, loops and payoff (7.6.2, 7.6.3; AC-07-20, AC-07-21)', () => {
  test('hook-referent: a named thing and one held-back fact', () => {
    expect(hookReferent(body(), ctx()).ok).toBe(true);
    expect(hookReferent(body({ hooks: [{ form: 'other', trigger: 'other', spoken: 'this is good', onScreen: '', words: 3 }] }), ctx()).detail).toBe('No named tool, number or person in the hook.');
    expect(hookReferent(body({ withheld: '' }), ctx()).detail).toBe('The script does not say what the hook holds back.');
    expect(hookReferent(body({ withheld: 'email', hooks: [{ form: 'other', trigger: 'other', spoken: 'My Claude reads email', onScreen: 'email', words: 4 }] }), ctx()).detail).toBe('The hook gives away what it should hold back: "email".');
  });

  test('AC-07-20: loops-closed blocks on an unclosed loop and on a missing answer; the gate fails', () => {
    const open = loopRules(body({ loops: [{ id: 'L1', question: 'q', answer: 'draft folder', opens: 0, closes: null }] })).find((r) => r.id === 'loops-closed')!;
    expect(open).toMatchObject({ ok: false, severity: 'block', detail: 'Loop L1 opens in hook and never closes.', section: 0 });
    const missing = loopRules(body({ loops: [{ id: 'L1', question: 'q', answer: 'spreadsheet macro', opens: 0, closes: 3 }] })).find((r) => r.id === 'loops-closed')!;
    expect(missing).toMatchObject({ ok: false, severity: 'block', detail: "Loop L1's answer is not in reveal.", section: 3 });
    const gate = applyRules(deterministicGate(body()), runRules(body({ loops: [{ id: 'L1', question: 'q', answer: 'draft folder', opens: 0, closes: null }] }), ctx()));
    expect(gate.passed).toBe(false);
    expect(loopRules(body()).find((r) => r.id === 'loops-closed')).toMatchObject({ ok: true, severity: 'block' });
    expect(loopRules(body({ loops: [] })).find((r) => r.id === 'loops-closed')).toMatchObject({ ok: true, severity: 'info', detail: 'No loops declared.' });
  });

  test('AC-07-21: promise-by-80, late-peak, end-on-payoff and one-cta fail on a crafted body, pass when fixed, never block', () => {
    const crafted = body({
      sections: [
        { type: 'hook', startPct: 0, endPct: 10, spoken: 'Hook line.', onScreen: '', visualNote: '' },
        { type: 'demo', startPct: 10, endPct: 50, spoken: 'Demo.', onScreen: '', visualNote: '' },
        { type: 'claim', startPct: 50, endPct: 85, spoken: 'The draft folder answer.', onScreen: '', visualNote: '' },
        { type: 'context', startPct: 85, endPct: 92, spoken: 'More context.', onScreen: '', visualNote: '' },
        { type: 'cta', startPct: 92, endPct: 96, spoken: 'Follow.', onScreen: '', visualNote: '' },
        { type: 'cta', startPct: 96, endPct: 100, spoken: 'Subscribe.', onScreen: '', visualNote: '' },
      ],
      loops: [{ id: 'L1', question: 'q', answer: 'draft folder', opens: 0, closes: 2 }],
      peakSection: 1,
      endType: 'fade',
      cta: 'Follow me. Then subscribe.',
    });
    const r = Object.fromEntries(loopRules(crafted).map((x) => [x.id, x]));
    expect(r['promise-by-80']).toMatchObject({ ok: false, severity: 'warn', detail: "The hook's promise is paid at 85%. Pay it before 80%." });
    expect(r['late-peak']).toMatchObject({ ok: false, severity: 'warn', detail: 'No second peak in the last quarter.' });
    expect(r['end-on-payoff']).toMatchObject({ ok: false, severity: 'warn', detail: 'The script ends on context. End on the payoff or a callback, then the CTA.' });
    expect(r['one-cta']).toMatchObject({ ok: false, severity: 'warn', detail: '2 CTAs. Keep one.' });
    const fixed = Object.fromEntries(loopRules(body()).map((x) => [x.id, x]));
    for (const id of ['promise-by-80', 'late-peak', 'end-on-payoff', 'one-cta']) expect(fixed[id].ok, id).toBe(true);
    expect(loopRules(crafted).filter((x) => x.id !== 'loops-closed').every((x) => x.severity !== 'block')).toBe(true);
  });
});

describe('originality and the risk lexicons (7.6.4, 7.6.5; AC-07-22, AC-07-23)', () => {
  const react = (platform: LabScriptBody['platform'], spoken = 'The launch landed this morning and the demo looks strong.') => body({ platform, sections: [{ type: 'hook', startPct: 0, endPct: 20, spoken: 'Big news today.', onScreen: '', visualNote: '' }, { type: 'demo', startPct: 20, endPct: 80, spoken, onScreen: '', visualNote: '' }, { type: 'payoff', startPct: 80, endPct: 100, spoken: 'That is the launch.', onScreen: '', visualNote: '' }] });

  test('AC-07-22: blocks on instagram with no first-person beat of 20 words, warns on tiktok', () => {
    expect(originality(react('instagram'), ctx({ isReact: true }))[0]).toMatchObject({ ok: false, severity: 'block', detail: 'React script with no beat of your own. Add a section where you show or say what you did.' });
    expect(originality(react('tiktok'), ctx({ isReact: true }))[0]).toMatchObject({ ok: false, severity: 'warn' });
    expect(originality(react('instagram', `I ran it on my own inbox for a week and ${words(16)}`), ctx({ isReact: true }))[0].ok).toBe(true);
    expect(originality(react('instagram'), ctx({ isReact: false }))).toEqual([]);
    const credit = originality(react('tiktok', `Credit to the team, clip from their stream ${words(20)}`), ctx({ isReact: true }));
    expect(credit[1]).toMatchObject({ severity: 'warn', ok: false, detail: 'Credit lines do not count as adding something. Add your own beat.' });
  });

  const positives: Record<string, string[]> = {
    linkedin: ['Agree?', 'Thoughts?', 'Who else does this', 'Like if you agree', 'Repost if this helped', 'comment "AGENT" for the guide', 'Comment yes to get it', 'Follow me for more', 'Tag someone who needs it', 'Drop a fire below'],
    x: ['these idiots never learn', 'cope harder', "if you're still writing tests by hand you're behind", 'normies will not get this'],
    outgroup: ['anyone who still codes by hand is wasting time', 'stop being lazy'],
  };
  const negatives: Record<string, string[]> = {
    linkedin: ['I agree with the data', 'my thoughts on the release', 'who built this', 'I would like it if', 'reposted the docs', 'a comment on the code', 'comment threads are useful', 'follow the steps', 'a tag on the repo', 'drop the file into the folder'],
    x: ['the idea is clever', 'we can handle the load', 'still writing tests by hand works fine', 'normal users like it'],
    outgroup: ['people still use spreadsheets and that is fine', 'stop the server first'],
  };

  test('AC-07-23: one positive and one negative string per pattern', () => {
    const sets: [string, RegExp[]][] = [['linkedin', LINKEDIN_BAIT], ['x', X_HOSTILITY], ['outgroup', OUTGROUP_SNEER]];
    for (const [k, pats] of sets) {
      pats.forEach((re, i) => {
        expect(re.test(positives[k][i]), `${k}[${i}] positive "${positives[k][i]}"`).toBe(true);
        expect(re.test(negatives[k][i]), `${k}[${i}] negative "${negatives[k][i]}"`).toBe(false);
      });
    }
  });

  test('AC-07-23: risk-x-hostility blocks on twitter and warns on multi; linkedin bait likewise', () => {
    const hostile = (platform: LabScriptBody['platform']) => body({ platform, cta: 'Follow if you are not one of these clowns.' });
    expect(riskRules(hostile('twitter')).find((r) => r.id === 'risk-x-hostility')).toMatchObject({ ok: false, severity: 'block' });
    expect(riskRules(hostile('multi')).find((r) => r.id === 'risk-x-hostility')).toMatchObject({ ok: false, severity: 'warn' });
    expect(riskRules(hostile('tiktok')).find((r) => r.id === 'risk-x-hostility')).toBeUndefined();
    const bait = (platform: LabScriptBody['platform']) => body({ platform, caption: 'Thoughts?' });
    expect(riskRules(bait('linkedin')).find((r) => r.id === 'risk-linkedin-bait')).toMatchObject({ ok: false, severity: 'block', detail: '"Thoughts?" reads as engagement bait on LinkedIn.' });
    expect(riskRules(bait('multi')).find((r) => r.id === 'risk-linkedin-bait')).toMatchObject({ severity: 'warn' });
  });
});

describe('versions and copy (AC-07-25, AC-07-26)', () => {
  test('AC-07-25: a v1 body (no rules, no loops) parses, runs the rules and renders with defaults', () => {
    const v1 = LabScriptBodySchema.parse({ durationS: 30, wpm: 150, hooks: [{ form: 'other', trigger: 'other', spoken: 'Hello there', onScreen: '', words: 2 }], hookChoice: 0, sections: [{ type: 'hook', startPct: 0, endPct: 100, spoken: 'Hello there.', onScreen: '', visualNote: '' }], cta: '', caption: '', titles: [] });
    expect(bodyV2(v1)).toEqual({ platform: 'multi', loops: [], withheld: '', peakSection: null, endType: null, arm: 'grounded', armP: null });
    expect(() => runRules(v1, ctx())).not.toThrow();
    expect(withV2Defaults(v1).grounding?.exemplars).toEqual([]);
    expect(gateCounts({ passed: true, checks: [], scores: null })).toEqual({ toFix: 0, toConsider: 0 });
  });

  test('AC-07-26: no rule copy, label, source or detail carries an em dash, en dash or emoji', () => {
    const strings = [...RULE_META.flatMap((r) => [r.label, r.why, r.source]), ...runRules(body(), ctx()).flatMap((r) => [r.label, r.detail, r.source]), ...runRules(body({ loops: [{ id: 'L1', question: 'q', answer: 'zzz', opens: 0, closes: null }], platform: 'multi', cta: 'cope. Agree?' }), ctx({ isReact: true })).flatMap((r) => [r.label, r.detail])];
    for (const s of strings) {
      expect(s, s).not.toMatch(/[–—]/);
      expect(s, s).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});
