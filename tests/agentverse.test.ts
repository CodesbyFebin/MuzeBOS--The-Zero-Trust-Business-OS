/** AgentVerse OS V3: nothing is seeded, sends only propose, ROAS comes from real insights only, rules and git ops become Jev items. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BusinessStore } from '@/lib/metabos/store';
import { queue } from '@/lib/metabos/ai/jev';
import { conversationFor } from '@/lib/metabos/talk/core';
import { appsecretProof } from '@/lib/metabos/dispatch/adapters';
import { addRule, adWizard, adsView, approveReply, commitTag, createWorkspace, evaluateRules, FOOTNOTE, gitOp, inboxStatus, listWorkspaces, onboarding, overview, roas, search, SUGGESTED_WORKSPACES, CHANNEL_GROUPS } from '@/lib/metabos/agentverse/core';
import { commitLog } from '@/lib/metabos/server/commits';
import { WorkflowEngine } from '@/lib/metabos/workflows';

const wiz = { objective: 'leads', audience: 'Kochi 10km', placements: ['instagram_feed'], creative: { name: 'Test', text: 'Hello' }, dailyBudgetMinor: 50000 };
describe('agentverse', () => {
  it('seeds nothing: no workspaces, commits, ads or inbox on a fresh store', () => {
    const s = new BusinessStore(':memory:'); const o = overview(s, {});
    expect(o.workspaces).toEqual([]); expect(o.commits).toEqual([]); expect(o.ads).toEqual([]); expect(o.inbox).toEqual([]); expect(o.graph.nodes).toEqual([]);
    expect(SUGGESTED_WORKSPACES).toContain('Ewaste Kochi'); expect(o.footnote).toBe(FOOTNOTE);
    expect(CHANNEL_GROUPS.map((g) => g.label)).toEqual(['Git for agents', 'Meta Suite', 'Ads command center', 'Agent swarm']);
  });
  it('workspaces exist only after the owner creates them', () => {
    const s = new BusinessStore(':memory:'); createWorkspace(s, 'owner', { name: 'Spider Kids' });
    expect(listWorkspaces(s).map((w) => w.name)).toEqual(['Spider Kids']);
  });
  it('Approve on a reply only proposes a dispatch and sends nothing', () => {
    const s = new BusinessStore(':memory:'); const c = conversationFor(s, 'whatsapp', '+919999999999', 'T');
    const r = approveReply(s, 'owner', { conversationId: c.id, body: 'Hi' });
    expect(r.status).toBe('pending'); expect(r.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(inboxStatus({}).find((x) => x.id === 'messenger')!.status).toBe('Not connected');
  });
  it('ROAS is null without insights and rules only propose a Jev pause', () => {
    const s = new BusinessStore(':memory:'); const a = adWizard(s, 'owner', wiz);
    expect(roas(s, a.id)).toBeNull(); expect(adsView(s)[0].placements).toEqual(['instagram_feed']);
    addRule(s, 'owner', { adId: a.id, roasBelow: 1.5 }); expect(evaluateRules(s)).toEqual([]);
    s.db.prepare("INSERT INTO mb_av_insights VALUES(?,?,?,?,'test')").run(a.id, '2026-11-01', 10000, 5000);
    const before = queue(s).length; const out = evaluateRules(s);
    expect(out).toHaveLength(1); expect(out[0].roas).toBe(0.5); expect(queue(s).length).toBe(before + 1);
  });
  it('revert and cherry-pick create new Jev items; SHIPPED needs a sent dispatch', () => {
    const s = new BusinessStore(':memory:'); adWizard(s, 'owner', wiz); const [c] = commitLog(s);
    expect(() => gitOp(s, 'owner', { op: 'revert', commitId: c.id })).toThrow(/approved/);
    const eng = new WorkflowEngine(s); eng.approve(c.jevRunId!, eng.run(c.jevRunId!).payloadHash);
    expect(commitLog(s).find((x) => x.id === c.id)?.status).not.toBe('pending');
    const before = queue(s).length; const r = gitOp(s, 'owner', { op: 'revert', commitId: c.id });
    expect(queue(s).length).toBe(before + 1); expect(r.diff.every((l) => !l.startsWith('+ '))).toBe(true);
    expect(() => gitOp(s, 'owner', { op: 'cherry-pick', commitId: c.id })).toThrow();
    expect(commitTag({ status: 'executed', dispatchId: null })).toBe('EXECUTED'); expect(commitTag({ status: 'sent', dispatchId: 'd1' })).toBe('SHIPPED'); expect(commitTag({ status: 'pending', dispatchId: null })).toBe('PENDING');
    expect(search(s, 'Kochi', []).some((h) => h.type === 'ad')).toBe(true);
  });
  it('onboarding reports presence only and appsecret_proof is an HMAC-SHA256', () => {
    const o = onboarding({ META_APP_SECRET: 'x' }); expect(JSON.stringify(o)).not.toContain('"x"'); expect(o.find((x) => x.env === 'META_APP_SECRET')?.present).toBe(true);
    expect(appsecretProof('tok', { META_APP_SECRET: 'sec' })).toMatch(/^[0-9a-f]{64}$/); expect(appsecretProof('tok', {})).toBeNull();
    expect(readFileSync('components/metabos/agentverse/AgentVerse.tsx', 'utf8')).not.toMatch(/Ramesh|ewaste-leads|autonomous/i);
  });
});
import { home } from '@/lib/metabos/agentverse/core';
describe('home server overview', () => {
  it('Live Activity reads only evidence; Kafka/Redis/Qdrant are Not configured without env; no hardcoded numbers', async () => {
    const s = new BusinessStore(':memory:'); const h0 = await home(s, {});
    expect(h0.campaigns).toEqual([]); expect(h0.activity.length).toBe(s.evidence().length);
    for (const id of ['kafka', 'redis', 'qdrant', 'claw', 'yao', 'ollama']) expect(h0.queues.find((q) => q.id === id)!.state).toBe('not_configured');
    const h1 = await home(s, { REDIS_URL: 'redis://127.0.0.1:1' }); expect(h1.queues.find((q) => q.id === 'redis')!.state).toBe('not_connected');
    adWizard(s, 'owner', wiz); const h2 = await home(s, {}); expect(h2.campaigns[0].roas).toBeNull(); expect(h2.activity[0].kind).toBe('Agent drafted');
    expect(readFileSync('components/metabos/agentverse/AgentVerse.tsx', 'utf8')).not.toMatch(/47\\.2k|Kafka Lag|0\\.2s/);
  });
});

import { evidenceVault, firewallEvents, proposeIntent } from '@/lib/metabos/agentverse/core';
describe('evidence vault, firewall and commit composer', () => {
  it('vault reads the real chain; composer only queues a Jev item', () => {
    const s = new BusinessStore(':memory:'); expect(firewallEvents(s)).toEqual([]);
    const before = queue(s).length; const r = proposeIntent(s, 'owner', { message: 'feat(ads): pause weak creative' });
    expect(queue(s).length).toBe(before + 1); expect(r.jevRunId).toBeTruthy();
    const v = evidenceVault(s); expect(v.valid).toBe(true); expect(v.rows.some((x) => x.action === 'agentverse.intent.pending_jev')).toBe(true);
    expect(() => proposeIntent(s, 'owner', { message: 'x' })).toThrow();
  });
});
