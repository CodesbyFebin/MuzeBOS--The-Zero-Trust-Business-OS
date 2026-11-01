/** Agent Hub (real records only, composer → draft + Jev) and MUSE companion (palette, reduced motion, no fake telemetry). */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BusinessStore } from '@/lib/metabos/store';
import { buildAgent, createChannel, hubView, postDraft } from '@/lib/metabos/hub/agent-hub';
import { intakeDraft } from '@/lib/metabos/b3/agent-run';
import { swarmNames, swarmTree, type AgentCard } from '@/lib/metabos/b3/swarms';
import { queue } from '@/lib/metabos/ai/jev';
import { COATS } from '@/components/metabos/muse/MuseAvatar';
const safe = async () => ({ verdict: 'safe' as const, categories: [], model: 'guard' });

describe('agent hub', () => {
  it('maps swarms to workspaces and sub-clusters + #approvals/#runs to channels; empty is empty', () => {
    const s = new BusinessStore(':memory:'); const v = hubView(s);
    expect(v.servers).toHaveLength(10); expect(v.servers.every((x) => x.runs === 0 && x.pending === 0)).toBe(true);
    expect(v.channels.slice(0, 2).map((c) => c.id)).toEqual(['approvals', 'runs']); expect(v.channels.some((c) => c.id.startsWith('sc:'))).toBe(true);
    expect(v.messages).toEqual([]); expect(v.members.length).toBe(100);
  });
  it('shows a real agent draft in #runs, its sub-cluster and #approvals while pending', async () => {
    const s = new BusinessStore(':memory:'); const sw = swarmNames(s)[0];
    const card = swarmTree(s, { swarm: sw, tier: 'worker' }).swarms[0].subclusters[0].agents[0] as AgentCard;
    await intakeDraft(s, card, 'claw-local', 'Write a caption', { draft: 'Fresh Diwali boxes today', proposed_actions: [], confidence: 0.9 }, { guard: safe });
    const sc = hubView(s, sw).channels.find((c) => 'subcluster' in c && c.subcluster === card.subcluster)!;
    for (const ch of ['runs', 'approvals', sc.id]) expect(hubView(s, sw, ch).messages.map((m) => m.text)).toEqual(['Fresh Diwali boxes today']);
    expect(hubView(s, sw).servers.find((x) => x.name === sw)!.pending).toBe(1);
    expect(hubView(s, sw, 'runs').members.find((m) => m.id === card.id)!.status).toBe('awaiting review');
  });
  it('create channel writes a record and rejects duplicates and reserved names', () => {
    const s = new BusinessStore(':memory:'); const sw = swarmNames(s)[0];
    const c = createChannel(s, 'owner', { swarm: sw, name: 'Diwali Launch', topic: 'festive' }); expect(c.name).toBe('diwali-launch');
    expect(hubView(s, sw).channels.some((x) => x.id === 'c:diwali-launch')).toBe(true);
    expect(() => createChannel(s, 'owner', { swarm: sw, name: 'diwali launch' })).toThrow(/exists/);
    expect(() => createChannel(s, 'owner', { swarm: sw, name: 'approvals' })).toThrow(/another/);
    expect(s.evidence().some((e) => e.action === 'hub.channel.created')).toBe(true);
  });
  it('build agent writes a definition card; external tools force Jev; unknown tools refused', () => {
    const s = new BusinessStore(':memory:'); const sw = swarmNames(s)[0]; const v = hubView(s, sw);
    const tools = [...new Set(v.members.flatMap((m) => m.tools))]; const ext = tools.find((t) => /^(dispatch|connector|planned):/.test(t)); const safeTool = tools.find((t) => !/^(dispatch|connector|planned):/.test(t))!;
    const sub = v.channels.find((c) => 'subcluster' in c && c.subcluster !== 'Swarm lead') as unknown as { subcluster: string };
    const a = buildAgent(s, 'owner', { swarm: sw, subcluster: sub.subcluster, name: 'Festive Caption Helper', role: 'Caption Writer', responsibility: 'Drafts festive captions for review.', tools: [safeTool], risk: 'low' });
    expect(a.status).toBe('definition'); expect(a.jev_required).toBe(false); expect(hubView(s, sw).members.length).toBe(101);
    if (ext) expect(buildAgent(s, 'owner', { swarm: sw, subcluster: null, name: 'Sender', role: 'Sender', responsibility: 'Drafts outbound messages.', tools: [ext], risk: 'low' }).jev_required).toBe(true);
    expect(() => buildAgent(s, 'owner', { swarm: sw, subcluster: null, name: 'Bad', role: 'Bad', responsibility: 'Tries a foreign tool.', tools: ['shell:rm'], risk: 'low' })).toThrow(/not available/);
  });
  it('composer saves a draft + one pending Jev item and never posts', () => {
    const s = new BusinessStore(':memory:'); const sw = swarmNames(s)[0]; const before = queue(s).length;
    const r = postDraft(s, 'owner', { swarm: sw, channel: 'approvals', platform: 'instagram', body: 'New menu drop #MetaAI' });
    expect(r.posted).toBe(false); expect(r.status).toBe('pending_jev'); expect(queue(s).length).toBe(before + 1);
    const m = hubView(s, sw, 'approvals').messages; expect(m).toHaveLength(1); expect(m[0]).toMatchObject({ kind: 'composer_draft', platform: 'instagram', jev: 'pending' });
  });
});

describe('design hygiene', () => {
  const hub = readFileSync('components/metabos/hub/AgentHub.tsx', 'utf8'); const avatar = readFileSync('components/metabos/muse/MuseAvatar.tsx', 'utf8');
  const panels = readFileSync('components/metabos/muse/MusePanels.tsx', 'utf8'); const css = readFileSync('app/metabos.css', 'utf8');
  const hubCss = css.slice(css.indexOf('/* ---------- Agent Hub'));
  it('no prototype mock data, alert() stubs or direct posting', () => {
    for (const bad of ['alert(', 'Aisha Khan', 'Ewaste Kochi', 'Gaming Hub', 'INITIAL_MESSAGES', 'Math.random', 'api.meta.ai', 'fonts.googleapis']) { expect(hub).not.toContain(bad); expect(panels).not.toContain(bad); }
    expect(panels).not.toContain('Math.random');
  });
  it('recoloured: no Discord/Meta blue or purple in the hub layer', () => {
    for (const c of ['#5865F2', '#0866ff', '#8b5cf6', '#313338', '#2B2D31']) expect(hubCss.toLowerCase()).not.toContain(c.toLowerCase());
  });
  it('MUSE defaults to the red/black coat, keeps violet as an option, is clean-room and motion-safe', () => {
    expect(Object.keys(COATS)[0]).toBe('ember'); expect(COATS.ember.tip).toBe('#FF2A2A'); expect(COATS.violet).toBeDefined();
    expect(avatar).toContain('prefers-reduced-motion'); expect(avatar).toMatch(/IntersectionObserver/); expect(avatar).not.toMatch(/from 'three'|getContext\('webgl/);
    expect(readFileSync('components/metabos/VoiceAssistant.tsx', 'utf8')).toContain("useState<CoatId>('ember')");
  });
});
