'use client';
/** MuZe Sanctum home. Layout ideas from the owner's AI Studio MuzeSanctum.tsx and MUSE companion HTML (owner-made); the code is ours.
 *  The real MUSE fur simulator, real counts and links only. No marketing tiles, pricing or invented settings. */
import { useState } from 'react';
import Link from 'next/link';
import { MuseFurSimulator } from '@/components/metabos/muse/MuseFurSimulator';
import { DEFAULT_COAT, type CoatPresetId } from '@/lib/metabos/fur-sim/presets';
import { PRODUCT_TITLE } from '@/lib/metabos/muze/pure';
type Props = { pending: number; commits: number; workspaces: number; onOpen(channel: string): void };
const TABS = ['Appearance', 'Voice', 'Fleet console', 'Automate', 'Memory', 'About'] as const;
const LANGS = [['auto', 'Auto-detect'], ['en', 'English'], ['hi', 'Hindi'], ['ml', 'Malayalam'], ['ta', 'Tamil']] as const;
export function MuzeSanctum({ pending, commits, workspaces, onOpen }: Props) {
  const [coat, setCoat] = useState<CoatPresetId>(DEFAULT_COAT);
  const [tab, setTab] = useState<(typeof TABS)[number]>('Appearance');
  const [lang, setLang] = useState<string>(() => (typeof window !== 'undefined' && window.localStorage.getItem('muze.voice.lang')) || 'auto');
  return <div className="mb-av-sanctum" data-testid="muze-sanctum">
    <div className="mb-av-sanctum-hero">
      <div className="mb-muse-stage"><MuseFurSimulator state="idle" coat={coat} onCoatChange={setCoat} size={260} /></div>
      <div>
        <p className="mb-av-eyebrow">MuZe platform</p>
        <h2 className="mb-av-title">{PRODUCT_TITLE}</h2>
        <p className="mb-muted">MUSE watches the commit log. Every send waits for you in Jev, then goes out through /api/dispatch.</p>
        <div className="mb-av-actions">
          <button type="button" onClick={() => onOpen('commit-log')}>Open commit console</button>
          <button type="button" onClick={() => onOpen('pending-approvals')}>Pending approvals ({pending})</button>
          <Link className="mb-av-link" href="/workspace/brain/voice">Talk to MUSE</Link>
          <Link className="mb-av-link" href="/workspace/builder/demo">Demo mode (3 min)</Link>
        </div>
      </div>
    </div>
    <div className="mb-av-tabs" role="tablist" aria-label="Sanctum">{TABS.map((t) => <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t}</button>)}</div>
    <div role="tabpanel" aria-label={tab} className="mb-av-sanctum-panel">
      {tab === 'Appearance' && <p className="mb-muted">Coat and fur physics are set on the simulator above (drag to stroke, choose a coat). The choice stays in this browser.</p>}
      {tab === 'Voice' && <><label>Speech language<select value={lang} onChange={(e) => { setLang(e.target.value); window.localStorage.setItem('muze.voice.lang', e.target.value); }}>{LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <p className="mb-muted">Stored in this browser only. Voice runs only after you start it on the voice page.</p><Link className="mb-av-link" href="/workspace/brain/voice">Open voice</Link></>}
      {tab === 'Fleet console' && <><p className="mb-muted">{workspaces} workspaces you created. Agents act only through Jev items.</p><button type="button" onClick={() => onOpen('fleet-console')}>Open fleet console</button></>}
      {tab === 'Automate' && <><p className="mb-muted">Rules propose Jev items; nothing runs without your approval.</p><button type="button" onClick={() => onOpen('roas-dashboard')}>Open ROAS rules</button> <Link className="mb-av-link" href="/workspace/developer/meta-integration">Meta integration</Link></>}
      {tab === 'Memory' && <><p className="mb-muted">{commits} commits recorded in the evidence-backed log.</p><button type="button" onClick={() => onOpen('knowledge-graph')}>Open knowledge graph</button> <Link className="mb-av-link" href="/workspace/brain/memory">Search memory</Link></>}
      {tab === 'About' && <p className="mb-muted">MuZe is an approval-first business OS. It is independent and has no relationship with Meta. Design references from the owner&apos;s AI Studio sketches are listed in THIRD_PARTY.md.</p>}
    </div>
    <ul className="mb-av-stats" aria-label="Real counts">
      <li><strong>{commits}</strong><span className="mb-muted">commits recorded</span></li>
      <li><strong>{pending}</strong><span className="mb-muted">waiting in Jev</span></li>
      <li><strong>{workspaces}</strong><span className="mb-muted">workspaces you created</span></li>
    </ul>
  </div>;
}
