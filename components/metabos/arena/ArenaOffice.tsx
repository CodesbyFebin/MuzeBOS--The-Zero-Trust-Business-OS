'use client';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import type { FloorActor } from '@/lib/metabos/arena/floor-layout';
const ThreeFloor = dynamic(() => import('./Arena3DFloor').then(m => m.Arena3DFloor), { ssr: false });
const TwoFloor = dynamic(() => import('./ArenaFloor').then(m => m.ArenaFloor), { ssr: false });
export function ArenaOffice({ actors, taskIds, selected, onSelect }: { actors: FloorActor[]; taskIds: string[]; selected: string | null; onSelect: (id: string) => void }) {
  const [mode, setMode] = useState<'3d' | '2d'>('3d');
  return <><div className="mb-arena-toolbar" role="group" aria-label="Office view">
    <button aria-pressed={mode === '3d'} onClick={() => setMode('3d')}>3D agents</button>
    <button aria-pressed={mode === '2d'} onClick={() => setMode('2d')}>2D office</button>
  </div>{mode === '3d' ? <ThreeFloor actors={actors} selected={selected} onSelect={onSelect} onFallback={() => setMode('2d')} /> : <TwoFloor actors={actors} taskIds={taskIds} />}</>;
}
