import { describe, expect, it } from 'vitest';
import { layoutActors, type FloorActor } from '../lib/metabos/arena/floor-layout';
const actor = (id: string, station = 'jev'): FloorActor => ({ id, station, agent: 'reviewer', title: 'Review', state: 'awaiting_approval', leased: false, parentId: null });
describe('Arena 3D observation layout', () => {
  it('never invents actors and ignores unsupported stations', () => {
    expect(layoutActors([])).toEqual([]);
    expect(layoutActors([actor('unknown', 'unprovisioned')])).toEqual([]);
  });
  it('caps station assignments and preserves recorded identity and lease state', () => {
    const assignments = layoutActors(Array.from({ length: 12 }, (_, i) => actor(`task-${i}`)));
    expect(assignments.map(a => a.id)).toEqual(['task-0', 'task-1', 'task-2', 'task-3']);
    expect(new Set(assignments.map(a => a.x)).size).toBe(4);
    expect(assignments.every(a => !a.leased && a.state === 'awaiting_approval')).toBe(true);
  });
  it('moves the same assignment when its recorded station changes', () => {
    const queued = layoutActors([actor('same', 'training')])[0];
    const running = layoutActors([{ ...actor('same', 'forge'), leased: true, state: 'running' }])[0];
    expect(running.id).toBe(queued.id); expect(running.x).not.toBe(queued.x); expect(running.leased).toBe(true);
  });
});
