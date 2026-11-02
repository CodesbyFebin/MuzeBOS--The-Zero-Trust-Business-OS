import { BusinessError, type BusinessStore } from './store';
/** Slice 9d: Mission Control widget layout, persisted in mb_settings (key mission.layout). */
import { MISSION_WIDGETS, DEFAULT_LAYOUT, type MissionWidget } from './mission-layout-client';
export { MISSION_WIDGETS, DEFAULT_LAYOUT, WIDGET_LABEL, type MissionWidget } from './mission-layout-client';
export function validLayout(v: unknown): MissionWidget[] {
  if (!Array.isArray(v) || v.length === 0 || v.length > MISSION_WIDGETS.length) throw new BusinessError('Layout must list 1 to 7 widgets', 422);
  if (new Set(v).size !== v.length || !v.every((x) => (MISSION_WIDGETS as readonly string[]).includes(x))) throw new BusinessError('Layout has unknown or repeated widgets', 422);
  return v as MissionWidget[];
}
export function getLayout(store: BusinessStore): { widgets: MissionWidget[]; isDefault: boolean } {
  const row = store.db.prepare("SELECT value FROM mb_settings WHERE key='mission.layout'").get() as { value: string } | undefined;
  if (!row) return { widgets: DEFAULT_LAYOUT, isDefault: true };
  try { return { widgets: validLayout(JSON.parse(row.value)), isDefault: false }; } catch { return { widgets: DEFAULT_LAYOUT, isDefault: true }; }
}
export function saveLayout(store: BusinessStore, widgets: unknown) {
  const w = validLayout(widgets);
  store.db.transaction(() => { store.db.prepare("INSERT INTO mb_settings VALUES('mission.layout',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(w)); store.appendEvidence('mission.layout.save', 'mission-control', w.join(',')); })();
  return getLayout(store);
}
export function resetLayout(store: BusinessStore) {
  store.db.transaction(() => { store.db.prepare("DELETE FROM mb_settings WHERE key='mission.layout'").run(); store.appendEvidence('mission.layout.reset', 'mission-control', 'default'); })();
  return getLayout(store);
}
