'use client';
/** Server presets modal. Logic ported from the owner's AI Studio ServerPresetModal.tsx + pureLogic.ts (t88; owner-made); gradients and mock data removed.
 *  Deploy creates a real workspace through the API; the preset layout and notification settings are kept in this browser only. */
import { useEffect, useRef, useState } from 'react';
import { PRESET_LIBRARY, saveCustomPreset, type ServerPreset } from '@/lib/metabos/agentverse/presets';
const KEY = 'muze.serverPresets'; const BY_WS = 'muze.serverPresetByName';
const read = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? '') as T; } catch { return d; } };
export const presetFor = (name: string): ServerPreset | null => read<Record<string, ServerPreset>>(BY_WS, {})[name] ?? null;
export function ServerPresets({ onClose, onDeploy, busy }: { onClose(): void; onDeploy(name: string): Promise<boolean>; busy: boolean }) {
  const [lib, setLib] = useState<ServerPreset[]>(() => [...PRESET_LIBRARY, ...read<ServerPreset[]>(KEY, []).filter((p) => p.isCustom)]);
  const [p, setP] = useState<ServerPreset>(structuredClone(PRESET_LIBRARY[0])); const [cat, setCat] = useState(''); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.querySelector<HTMLElement>('[role=radio]')?.focus(); const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const n = p.notificationSettings; const setN = (x: Partial<typeof n>) => setP({ ...p, notificationSettings: { ...n, ...x } });
  const saveLocal = () => { const next = saveCustomPreset(lib, { ...p, id: p.isCustom ? p.id : `custom-${p.id}-${Date.now().toString(36)}` }); setLib(next); localStorage.setItem(KEY, JSON.stringify(next.filter((x) => x.isCustom))); };
  return <div className="mb-av-presets-overlay" role="dialog" aria-modal="true" aria-label="Server presets" ref={ref} data-testid="server-presets">
    <div className="mb-av-presets">
      <h2>Server presets</h2>
      <div className="mb-av-tabs" role="radiogroup" aria-label="Preset library">{lib.map((x) => <button key={x.id} type="button" role="radio" aria-checked={p.id === x.id} onClick={() => setP(structuredClone(x))}>{x.name}{x.isCustom ? ' (custom)' : ''}</button>)}</div>
      <form className="mb-av-form" aria-label="Preset settings" onSubmit={(e) => { e.preventDefault(); onDeploy(p.name.trim()).then((ok) => { if (!ok) return; localStorage.setItem(BY_WS, JSON.stringify({ ...read<Record<string, ServerPreset>>(BY_WS, {}), [p.name.trim()]: p })); onClose(); }); }}>
        <label>Server name<input required minLength={2} maxLength={60} value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></label>
        <fieldset><legend>Channel categories</legend>{p.channelCategories.map((c, i) => <div key={c.categoryName + i} className="mb-av-actions"><span>{c.categoryName} <span className="mb-muted">{c.channelNames.map((x) => `#${x}`).join(' ') || 'no channels'}</span></span><button type="button" aria-label={`Remove category ${c.categoryName}`} onClick={() => setP({ ...p, channelCategories: p.channelCategories.filter((_, j) => j !== i) })}>Remove</button></div>)}
          <label>New category<input value={cat} maxLength={40} onChange={(e) => setCat(e.target.value)} /></label><button type="button" disabled={!cat.trim()} onClick={() => { setP({ ...p, channelCategories: [...p.channelCategories, { categoryName: cat.trim(), channelNames: [] }] }); setCat(''); }}>Add category</button></fieldset>
        <fieldset><legend>Default agent roles</legend>{(['Admin', 'Agent', 'Viewer'] as const).map((r) => <label key={r} className="mb-av-check"><input type="checkbox" checked={p.defaultAgentRoles.includes(r)} onChange={(e) => setP({ ...p, defaultAgentRoles: e.target.checked ? [...p.defaultAgentRoles, r] : p.defaultAgentRoles.filter((x) => x !== r) })} />{r}</label>)}</fieldset>
        <fieldset><legend>Notifications</legend>
          <label className="mb-av-check"><input type="checkbox" checked={n.notifyOnPendingApproval} onChange={(e) => setN({ notifyOnPendingApproval: e.target.checked })} />Approval alerts</label>
          <label className="mb-av-check"><input type="checkbox" checked={n.notifyOnHighValueLead} onChange={(e) => setN({ notifyOnHighValueLead: e.target.checked })} />High-value lead alerts</label>
          <label>High-value lead threshold (₹)<input type="number" min={0} inputMode="numeric" value={n.highValueLeadThresholdInr ?? ''} onChange={(e) => setN({ highValueLeadThresholdInr: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })} /></label>
          <label>Digest frequency<select value={n.emailDigest} onChange={(e) => setN({ emailDigest: e.target.value as typeof n.emailDigest })}><option value="off">Off</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label></fieldset>
        <p className="mb-muted">Deploy creates a real workspace. Layout and notification settings stay in this browser; nothing is sent.</p>
        <div className="mb-av-actions"><button type="submit" disabled={busy}>Deploy to server rail</button><button type="button" onClick={saveLocal}>Save as custom preset</button><button type="button" onClick={onClose}>Cancel</button></div>
      </form>
    </div>
  </div>;
}
