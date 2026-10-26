'use client';
import { MISSION_WIDGETS, WIDGET_LABEL, type MissionWidget } from '@/lib/muzebos/mission-layout-client';
/** Add, remove, reorder and restore Mission Control widgets; saved server-side. */
export function LayoutEditor({ layout, isDefault, busy, onSave, onReset }: { layout: MissionWidget[]; isDefault: boolean; busy: boolean; onSave: (w: MissionWidget[]) => void; onReset: () => void }) {
  const hidden = MISSION_WIDGETS.filter((w) => !layout.includes(w));
  const move = (i: number, d: number) => { const n = [...layout]; [n[i], n[i + d]] = [n[i + d], n[i]]; onSave(n); };
  return <details className="mb-panel" data-testid="layout-editor"><summary>Customize layout{isDefault ? ' (default)' : ' (saved)'}</summary>
    <ol className="mb-help-list">{layout.map((w, i) => <li key={w} className="mb-row"><span>{WIDGET_LABEL[w]}</span><span className="mb-actions">
      <button type="button" aria-label={`Move ${WIDGET_LABEL[w]} up`} disabled={busy || i === 0} onClick={() => move(i, -1)}>↑</button>
      <button type="button" aria-label={`Move ${WIDGET_LABEL[w]} down`} disabled={busy || i === layout.length - 1} onClick={() => move(i, 1)}>↓</button>
      <button type="button" aria-label={`Remove ${WIDGET_LABEL[w]}`} disabled={busy || layout.length === 1} onClick={() => onSave(layout.filter((x) => x !== w))}>Remove</button></span></li>)}</ol>
    {hidden.length > 0 && <p className="mb-actions">{hidden.map((w) => <button key={w} type="button" disabled={busy} onClick={() => onSave([...layout, w])}>Add {WIDGET_LABEL[w]}</button>)}</p>}
    <button type="button" disabled={busy || isDefault} onClick={onReset}>Restore default</button>
  </details>;
}
