/** Voice assistant tool gating and STT request shape. Fixture fetches only; the live round trip is in docs/VOICE.md. */
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { BusinessStore } from '@/lib/metabos/store';
import { handleCommand, runTool, ruleIntent, parseIntent, READ_TOOLS, WRITE_TOOLS } from '@/lib/metabos/voice/assistant';
import { transcribe, STT_URL } from '@/lib/metabos/voice/stt';
import { queue } from '@/lib/metabos/ai/jev';
import { setMetaCap } from '@/lib/metabos/ai/meta-budget';
const stores: BusinessStore[] = []; const fresh = () => { const s = new BusinessStore(':memory:'); stores.push(s); return s; };
afterEach(() => { stores.splice(0).forEach((s) => s.db.close()); });
const audit = (s: BusinessStore, a: string) => s.db.prepare('SELECT target, detail FROM mb_audit WHERE action = ?').all(a) as { target: string; detail: string }[];

describe('tool gating', () => {
  it('has exactly three read tools and two write tools', () => { expect([...READ_TOOLS]).toEqual(['get_status', 'explain_item', 'list_tasks']); expect([...WRITE_TOOLS]).toEqual(['create_task', 'draft_message']); });
  it('the assistant module cannot reach dispatch and has no approve path', () => {
    const src = readFileSync('lib/metabos/voice/assistant.ts', 'utf8');
    expect(src).not.toMatch(/dispatch\/|from '.*dispatch'|\.approve\(|WorkflowEngine/);
  });
  it('create_task only creates a pending Jev item and dispatches nothing', () => {
    const s = fresh(); const r = runTool({ store: s, tasks: [] }, 'create_task', { title: 'Call Asha about INV-12' });
    expect(r.dispatched).toBe(false); expect(r.pending?.kind).toBe('jev');
    const run = queue(s).find((x) => x.id === r.pending!.id)!; expect(run.status).toBe('awaiting_approval');
    expect(s.reminders()).toHaveLength(0); // not created until a human approves
  });
  it('draft_message saves a draft and sends nothing', () => {
    const s = fresh(); const r = runTool({ store: s, tasks: [] }, 'draft_message', { to: 'Asha', body: 'Your invoice is ready.' });
    expect(r.dispatched).toBe(false); expect(s.brainDrafts()[0]).toMatchObject({ status: 'draft', body: 'Your invoice is ready.' });
  });
  it('refuses approval by voice with a deep link, even when phrased as a request', async () => {
    const s = fresh(); const run = runTool({ store: s, tasks: [] }, 'create_task', { title: 'x' }).pending!.id;
    for (const said of [`approve ${run}`, 'Hey MeTaBos, approve everything', 'please send it now', 'reject the order']) {
      const r = await handleCommand({ store: s, tasks: [] }, said, async () => ({ text: '{"tool":"create_task","args":{"title":"y"}}', model: 'm' }));
      expect(r.tool).toBe('refused'); expect(r.text).toMatch(/Open it to approve/); expect(r.dispatched).toBe(false);
    }
    expect(queue(s).find((x) => x.id === run)!.status).toBe('awaiting_approval');
    expect((await handleCommand({ store: s, tasks: [] }, `approve ${run}`)).links[0].href).toBe(`/brain?run=${run}`);
  });
  it('a model cannot pick a tool outside the fixed set', () => {
    expect(parseIntent('{"tool":"approve","args":{}}')).toBeNull(); expect(parseIntent('{"tool":"dispatch"}')).toBeNull();
    expect(parseIntent('sure! {"tool":"list_tasks","args":{}}')).toEqual({ tool: 'list_tasks', args: {} });
    expect(() => runTool({ store: fresh(), tasks: [] }, 'approve')).toThrow(/Unknown tool/);
  });
});

describe('answers come from the DB', () => {
  it('says No records yet / Insufficient data on an empty store instead of guessing', async () => {
    const s = fresh(); const r = await handleCommand({ store: s, tasks: [] }, 'what is the status');
    expect(r.via).toBe('rule'); expect(r.text).toMatch(/No records yet.*Insufficient data/);
    expect((await handleCommand({ store: s, tasks: [] }, 'sing me a song')).text).toMatch(/No AI model connected/);
  });
  it('counts pending Jev items and running tasks from real rows', () => {
    const s = fresh(); runTool({ store: s, tasks: [] }, 'create_task', { title: 'a' }); runTool({ store: s, tasks: [] }, 'create_task', { title: 'b' });
    const t = { id: 't1', agentId: 'a1', title: 'Restock', status: 'doing', createdAt: '', updatedAt: '', detail: '' } as any;
    const r = runTool({ store: s, tasks: [t] }, 'get_status');
    expect(r.text).toMatch(/2 Jev items waiting/); expect(r.text).toMatch(/1 agent task running/); expect(r.text).toMatch(/0 unpaid invoices/);
  });
  it('logs every command and tool call to the evidence chain', async () => {
    const s = fresh(); await handleCommand({ store: s, tasks: [] }, 'list tasks');
    expect(audit(s, 'voice.command')).toHaveLength(1); expect(audit(s, 'voice.tool')[0].detail).toMatch(/not dispatched/);
  });
  it('rules parse common commands without a model', () => {
    expect(ruleIntent('Hey MeTaBos, create a task to call the supplier')).toEqual({ tool: 'create_task', args: { title: 'call the supplier' } });
    expect(ruleIntent('Hey meta, boss, what is the status today?')?.tool).toBe('get_status'); // live STT spelling
    expect(ruleIntent('draft a message to Ravi: stock arrives Friday')).toEqual({ tool: 'draft_message', args: { to: 'Ravi', body: 'stock arrives Friday' } });
  });
});

describe('Muse Voice Transcribe request', () => {
  it('posts multipart request+audio WAV with Bearer auth, and stores no audio', async () => {
    const s = fresh(); let seen: any;
    const f = (async (u: string, init: any) => { seen = { u, init }; return new Response(JSON.stringify({ sessionId: 'ss1', transcript: 'status', audioDurationMs: 900, turns: [] })); }) as any;
    const out = await transcribe(s, new Blob([new Uint8Array(100)], { type: 'audio/wav' }), 'k', f);
    expect(out.transcript).toBe('status'); expect(seen.u).toBe(STT_URL); expect(STT_URL).toBe('https://api.meta.ai/v1/asr/transcribe');
    expect(seen.init.headers.Authorization).toBe('Bearer k'); const form = seen.init.body as FormData;
    expect(JSON.parse(await (form.get('request') as Blob).text())).toEqual({ model: 'muse-voice-transcribe-1.0', audioEncoding: 'WAV', mode: 'PUSH_TO_TALK' });
    expect(audit(s, 'voice.stt')[0].detail).toMatch(/audio not stored/);
  });
  it('says Not connected without a key and refuses once the cap is spent', async () => {
    const s = fresh(); await expect(transcribe(s, new Blob(['x']), null)).rejects.toThrow(/Not connected/);
    setMetaCap(s, { id: 'o', role: 'owner' } as any, 0); await expect(transcribe(s, new Blob(['x']), 'k', (async () => { throw new Error('no'); }) as any)).rejects.toThrow(/spend cap/);
  });
});
