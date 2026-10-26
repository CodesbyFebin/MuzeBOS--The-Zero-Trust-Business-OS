/** Client-safe widget ids (mirrors mission-layout.ts, which imports the store). */
export const MISSION_WIDGETS = ['stats', 'launchers', 'graph', 'attention', 'todo', 'connections', 'activity'] as const;
export type MissionWidget = typeof MISSION_WIDGETS[number];
export const WIDGET_LABEL: Record<MissionWidget, string> = { stats: 'Counters', launchers: 'Daily launchers', graph: 'Connected business graph', attention: 'Attention desk', todo: 'To do & reminders', connections: 'Connection status', activity: 'Recent activity' };
export const DEFAULT_LAYOUT: MissionWidget[] = [...MISSION_WIDGETS];
