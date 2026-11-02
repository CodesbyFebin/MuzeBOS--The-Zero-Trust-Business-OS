'use client';
/** MuZe Sanctum home. Layout idea from the owner's AI Studio MuzeSanctum.tsx (owner-made); the code is ours.
 *  The real MUSE fur simulator, real counts only, and no marketing tiles or pricing. */
import { useState } from 'react';
import Link from 'next/link';
import { MuseFurSimulator } from '@/components/metabos/muse/MuseFurSimulator';
import { DEFAULT_COAT, type CoatPresetId } from '@/lib/metabos/fur-sim/presets';
import { PRODUCT_TITLE } from '@/lib/metabos/muze/pure';
type Props = { pending: number; commits: number; workspaces: number; onOpen(channel: string): void };
export function MuzeSanctum({ pending, commits, workspaces, onOpen }: Props) {
  const [coat, setCoat] = useState<CoatPresetId>(DEFAULT_COAT);
  return <div className="mb-av-sanctum" data-testid="muze-sanctum">
    <div className="mb-av-sanctum-hero">
      <div className="mb-muse-stage"><MuseFurSimulator state="idle" coat={coat} onCoatChange={setCoat} size={260} /></div>
      <div>
        <p className="mb-av-eyebrow">MeTaBos platform</p>
        <h2 className="mb-av-title">{PRODUCT_TITLE}</h2>
        <p className="mb-muted">MUSE watches the commit log. Every send waits for you in Jev, then goes out through /api/dispatch.</p>
        <div className="mb-av-actions">
          <button type="button" onClick={() => onOpen('commit-log')}>Open commit console</button>
          <button type="button" onClick={() => onOpen('pending-approvals')}>Pending approvals ({pending})</button>
          <Link className="mb-av-link" href="/workspace/brain/voice">Talk to MUSE</Link>
        </div>
      </div>
    </div>
    <ul className="mb-av-stats" aria-label="Real counts">
      <li><strong>{commits}</strong><span className="mb-muted">commits recorded</span></li>
      <li><strong>{pending}</strong><span className="mb-muted">waiting in Jev</span></li>
      <li><strong>{workspaces}</strong><span className="mb-muted">workspaces you created</span></li>
    </ul>
  </div>;
}
