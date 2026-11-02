import { STATIONS } from './snapshot';
export type FloorActor = { id: string; agent: string; title: string; state: string; station: string; leased: boolean; parentId: string | null };
/** Same bounded observation as the 2D floor, in world coordinates. Unknown stations are ignored. */
export function layoutActors(actors: FloorActor[]) {
  const slots = new Map<string, number>();
  return actors.slice(0, 24).flatMap(actor => {
    const station = STATIONS.find(s => s.id === actor.station);
    const slot = slots.get(actor.station) ?? 0;
    if (!station || slot >= 4) return [];
    slots.set(actor.station, slot + 1);
    return [{ ...actor, x: (station.x - 465) / 45 - 1.8 + slot * 1.2, z: (station.y - 220) / 45 + .65 }];
  });
}
