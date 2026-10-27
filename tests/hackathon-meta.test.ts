import { describe, it, expect, vi } from 'vitest';
import { BusinessStore } from '@/lib/muzebos/store';
import { metaKey, basetenKey, metaImage, metaTranscribe, BASETEN_MUSE_SPARK_OPEN } from '@/lib/muzebos/ai/meta';
import { runOpsAgent } from '@/lib/muzebos/ai/ops-agent';
import { InferenceStore } from '@/lib/muzebos/inference/store';
import { routes } from '@/lib/muzebos/inference/routing';
describe('PR #22 compatibility hardening', () => {
  it('accepts requested and legacy key names with deterministic precedence', () => {
    expect(metaKey({ META_MODEL_API_KEY: 'new', MODEL_API_KEY: 'old' })).toBe('new');
    expect(metaKey({ MODEL_API_KEY: 'old' })).toBe('old'); expect(metaKey({})).toBeNull();
    expect(basetenKey({ BASETEN_API_KEY: 'key' })).toBe('key'); expect(BASETEN_MUSE_SPARK_OPEN).toBe('meta-models/muse-spark-open-1026');
  });
  it('does not expose unqualified image/voice calls or treat key presence as authorization', async () => {
    const fetcher = vi.fn();
    await expect(metaImage('x', { fetch: fetcher })).rejects.toThrow('no request sent');
    await expect(metaTranscribe('x', { fetch: fetcher })).rejects.toThrow('no request sent');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('sorts a bounded request into durable, unapproved drafts with no paid consent', async () => {
    const b = new BusinessStore(':memory:');
    const env = { META_MODEL_API_KEY: 'fixture', MUZEBOS_INFERENCE_PAID: '1', MUZEBOS_META_MODEL: 'muse-spark-1.3' };
    try {
      const result = await runOpsAgent(b, 'Remind me to call Acme; then restock coffee', { env });
      expect(result.mode).toBe('awaiting-inference-approval');
      const tasks = result.steps.flatMap(s => s.task ? [s.task] : []); expect(tasks.length).toBeGreaterThan(0); expect(tasks.length).toBeLessThanOrEqual(5);
      for (const task of tasks) { expect(task.state).toBe('awaiting_approval'); expect(task.payload.paidConsent).toBe(false); }
      const store = new InferenceStore(b, () => routes(env)); expect(store.claim('no-automatic-call', 'server')).toBeNull();
      expect(b.db.prepare('SELECT COUNT(*) n FROM mb_reminders').get()).toEqual({ n: 0 });
    } finally { b.close(); }
  });
});
