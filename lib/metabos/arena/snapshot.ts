import type { InferenceTask } from '../inference/types';
export const STATIONS = [
  { id: 'training', label: 'Training Ground', note: 'Queued drafts; no training job is implied', x: 155, y: 115 },
  { id: 'forge', label: 'Skill Forge', note: 'Leased drafting work', x: 465, y: 115 },
  { id: 'sparring', label: 'Sparring Pit', note: 'Leased analysis or planning', x: 155, y: 325 },
  { id: 'invention', label: 'Invention Lab', note: 'Leased code drafting; no shell execution', x: 465, y: 325 },
  { id: 'jev', label: 'Jev Gate', note: 'Awaiting exact-payload approval', x: 755, y: 115 },
  { id: 'healing', label: 'Healing Chamber', note: 'Failed or expired leases; no automatic repair', x: 755, y: 325 },
] as const;
export type StationId = typeof STATIONS[number]['id'];
export function taskStation(t: Pick<InferenceTask, 'state' | 'leaseUntil' | 'payload'>, now: number): StationId {
  if (t.state === 'awaiting_approval') return 'jev';
  if (t.state === 'failed' || t.state === 'running' && (!t.leaseUntil || Date.parse(t.leaseUntil) <= now)) return 'healing';
  if (t.state !== 'running') return 'training';
  return t.payload.kind === 'code' ? 'invention' : t.payload.kind === 'draft' ? 'forge' : 'sparring';
}
export function floorActors(tasks: InferenceTask[], now: number) {
  return tasks.filter(t => !['completed', 'cancelled'].includes(t.state)).slice(0, 24).map(t => ({
    id: t.id, agent: t.payload.agent, title: t.payload.title, state: t.state,
    station: taskStation(t, now), leased: t.state === 'running' && !!t.leaseUntil && Date.parse(t.leaseUntil) > now,
    parentId: t.payload.parentId,
  }));
}
