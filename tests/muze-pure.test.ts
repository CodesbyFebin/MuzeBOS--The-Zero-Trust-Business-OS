/** Ported from the owner's AI Studio pureLogic.test.ts where it applies (filterActivities, ROAS metrics, sparring message). No mock data ships. */
import { describe, expect, it } from 'vitest';
import { filterActivities, roasMetrics, sparringCommitMessage, PRODUCT_TITLE } from '@/lib/metabos/muze/pure';
const acts = [
  { seq: 2, kind: 'Agent drafted', action: 'jev.proposed', target: 'ad_1', detail: 'Ad draft', hash: 'abc123' },
  { seq: 1, kind: 'DM received', action: 'talk.message.in', target: 'conv_1', detail: 'hello', hash: 'def456' },
];
describe('muze pure logic', () => {
  it('filters activity by kind and query (hash, target, detail)', () => {
    expect(filterActivities(acts, 'ALL', '')).toHaveLength(2);
    expect(filterActivities(acts, 'DM received', '')).toEqual([acts[1]]);
    expect(filterActivities(acts, 'ALL', 'ABC')).toEqual([acts[0]]);
    expect(filterActivities(acts, 'ALL', 'conv_1')).toEqual([acts[1]]);
    expect(filterActivities(acts, 'Agent drafted', 'hello')).toEqual([]);
  });
  it('ROAS is null without real insights (no 3.8x fallback); money stays in minor units', () => {
    expect(roasMetrics([])).toEqual({ plannedDailyMinor: 0, drafts: 0, shipped: 0, averageRoas: null });
    expect(roasMetrics([{ dailyBudgetMinor: 50000, roas: null }]).averageRoas).toBeNull();
    expect(roasMetrics([{ dailyBudgetMinor: 100, roas: 2 }, { dailyBudgetMinor: 200, roas: 3, status: 'SHIPPED' }])).toEqual({ plannedDailyMinor: 300, drafts: 2, shipped: 1, averageRoas: 2.5 });
  });
  it('sparring winner produces a commit message and the title is set', () => {
    expect(sparringCommitMessage('Diwali', 'Agent B')).toBe('feat(copy): adopt Agent B winning hook for Diwali');
    expect(PRODUCT_TITLE).toBe('MuZe — Meta AI Business Operating Server');
  });
});
