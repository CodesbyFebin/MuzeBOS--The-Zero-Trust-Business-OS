import { afterEach, describe, expect, test, vi } from 'vitest';
import type { LabIdea } from '@/lib/schemas';
import { retrieveGrounding, contrastBlock } from '@/lib/lab/gen/grounding';
import { generateScript, type ScriptReply } from '@/lib/lab/scripts';
import { T, addPost, baseWorld } from './lab-gen-helpers';

/**
 * Contrastive grounding (07 7.5): AC-07-14 to AC-07-16. Exemplars are breakouts (at most 2 per
 * creator), duds come only from the exemplar creators, owned posts never appear; the CONTRAST
 * block lists exactly what was stored; the control arm drops it.
 */

afterEach(() => {
  delete process.env.LAB_GROUNDING_CONTROL;
});

function world() {
  const s = baseWorld();
  const hook = (n: number) => `I tested voice agents on real support calls ${n}`;
  addPost(s, { id: 'b1', source: 'src-c1', ratio: 6, hook: hook(1) });
  addPost(s, { id: 'b2', source: 'src-c1', ratio: 5, hook: hook(2) });
  addPost(s, { id: 'b3', source: 'src-c1', ratio: 4.5, hook: hook(3) }); // third from c1: never chosen
  addPost(s, { id: 'b4', source: 'src-c2', ratio: 4, hook: hook(4) });
  addPost(s, { id: 'b-low', source: 'src-c2', ratio: 9, hook: hook(5), confidence: 'low' }); // low baseline confidence: not a breakout
  addPost(s, { id: 'b-own', source: 'src-own', owned: true, ratio: 12, hook: hook(6) });
  addPost(s, { id: 'd1', source: 'src-c1', ratio: 0.5, breakout: false, ageH: 120, hook: 'Voice agents, a quick look at support calls' });
  addPost(s, { id: 'd-young', source: 'src-c1', ratio: 0.4, breakout: false, ageH: 48, hook: 'Voice agents on support calls, early' });
  addPost(s, { id: 'd-other', source: 'src-c3', ratio: 0.3, breakout: false, ageH: 150, hook: 'Voice agents on support calls again' });
  addPost(s, { id: 'd-mid', source: 'src-c2', ratio: 0.9, breakout: false, ageH: 150, hook: 'Voice agents for support calls' });
  return s;
}

describe('retrieveGrounding (7.5)', () => {
  test('AC-07-14: breakouts only, at most 2 per creator; duds from exemplar creators at 0.8x or below and 72h or older; owned never', () => {
    const s = world();
    const g = retrieveGrounding(s, { query: 'voice agents on support calls', formatFamily: 'tutorial_walkthrough', now: T });
    const ex = g.exemplars.map((e) => e.postId);
    expect(ex).toHaveLength(3);
    expect(ex).toEqual(expect.arrayContaining(['b1', 'b2', 'b4']));
    expect(ex).not.toContain('b3');
    expect(ex).not.toContain('b-low');
    expect(ex).not.toContain('b-own');
    expect(g.duds.map((d) => d.postId)).toEqual(['d1']);
    for (const d of g.duds) expect(d.ratio).toBeLessThanOrEqual(0.8);
    expect(g.thin).toBe(false);
    expect(g.contrast).toBe('');
    expect(g.embedModel).toBe('local-hash-v1');
    const perCreator = new Map<string, number>();
    for (const e of g.exemplars) perCreator.set(e.creatorId, (perCreator.get(e.creatorId) ?? 0) + 1);
    expect(Math.max(...perCreator.values())).toBeLessThanOrEqual(2);
  });

  test('fewer than 3 exemplars is thin; no duds reads as such in the block', () => {
    const s = baseWorld();
    addPost(s, { id: 'b1', source: 'src-c1', ratio: 6, hook: 'Agents on a budget' });
    const g = retrieveGrounding(s, { query: 'agents on a budget', now: T });
    expect(g.thin).toBe(true);
    expect(contrastBlock(g, (id) => id)).toContain('No duds from these creators yet.');
  });
});

const IDEA = (over: Partial<LabIdea> = {}): LabIdea => ({ id: 'idea-g', title: 'Voice agents on support calls', clusterId: null, angle: 'real support calls', tension: null, formatFamily: 'tutorial_walkthrough', strand: [], hookRecs: [], evidence: [{ postId: 'b1', why: '' }, { postId: 'b4', why: '' }], timing: null, fit: 0.5, thin: false, status: 'open', dismissReason: null, createdAt: T.toISOString(), actedOnAt: null, ...over });

const reply = (contrast: string): ScriptReply => ({
  hooks: [{ form: 'results_first', trigger: 'curiosity', spoken: 'I put a voice agent on 40 support calls', onScreen: '' }],
  sections: [{ spoken: 'one' }, { spoken: 'two' }, { spoken: 'three' }, { spoken: 'four' }, { spoken: 'five' }].map((x) => ({ ...x, onScreen: '', visualNote: '' })),
  cta: 'Follow for part two.',
  caption: '',
  titles: [],
  loops: [{ id: 'L1', question: 'q', answer: 'four', opens: 0, closes: 3 }],
  withheld: 'the result',
  peakSection: 3,
  endType: 'payoff',
  contrast,
});

describe('the CONTRAST block and the control arm (AC-07-15, AC-07-16)', () => {
  const deps = (prompts: string[], contrast = 'The breakouts showed the real call; the duds only described it.') => ({
    now: T,
    context: '',
    readSkill: () => null,
    ask: vi.fn(async (p: string) => {
      prompts.push(p);
      return { ok: true as const, data: reply(contrast) };
    }),
    askCheck: vi.fn(async () => ({ ok: true as const, data: { voice: 4, tension: 4, evidence: 4, register: 4, blame: {} } })),
  });

  test('AC-07-15: the block lists exactly the stored exemplars and duds; grounding.contrast is saved from the reply', async () => {
    const s = world();
    s.ideas.upsert(IDEA());
    const prompts: string[] = [];
    const r = await generateScript(s, 'idea-g', deps(prompts));
    const body = r.version.body;
    expect(body.arm).toBe('grounded');
    expect(body.grounding?.contrast).toBe('The breakouts showed the real call; the duds only described it.');
    const block = prompts[0].slice(prompts[0].indexOf('## CONTRAST'), prompts[0].indexOf('## LOOPS'));
    const listed = [...block.matchAll(/post=([\w-]+)/g)].map((m) => m[1]).sort();
    const stored = [...body.grounding!.exemplars, ...body.grounding!.duds].map((x) => x.postId).sort();
    expect(listed).toEqual(stored);
    expect(stored).toEqual(['b1', 'b2', 'b4', 'd1'].sort());
    expect(block).toContain('@c1');
    expect(prompts[0]).toContain('## LOOPS');
    expect(prompts[0]).toContain('Prompt script-v2');
  });

  test('AC-07-16: with LAB_GROUNDING_CONTROL=0 no draft is control; with 1 every draft is, and its prompt has no CONTRAST block', async () => {
    process.env.LAB_GROUNDING_CONTROL = '0';
    const s = world();
    s.ideas.upsert(IDEA());
    for (let i = 0; i < 3; i++) {
      const prompts: string[] = [];
      const r = await generateScript(s, 'idea-g', deps(prompts));
      expect(r.version.body.arm).toBe('grounded');
      expect(prompts[0]).toContain('## CONTRAST');
    }
    process.env.LAB_GROUNDING_CONTROL = '1';
    for (let i = 0; i < 3; i++) {
      const prompts: string[] = [];
      const r = await generateScript(s, 'idea-g', deps(prompts));
      expect(r.version.body.arm).toBe('control');
      expect(r.version.body.armP).toBe(1);
      expect(r.version.body.grounding?.exemplars).toEqual([]);
      expect(prompts[0]).not.toContain('## CONTRAST');
      expect(prompts[0]).not.toContain('opened: "');
    }
  });
});
