import type { ReactNode } from 'react';
import { LabRoot } from '@/components/lab/v2/shared/LabRoot';
import { getAppearance } from '@/lib/appearance-server';
import './lab-pages.css';
import './lab-root.css';
import '@/components/lab/v2/shared/lab-motion.css';

/**
 * Content Lab v2 layout (01 1, 03.19). Renders the one `.lab[data-lab-root]` wrapper with the Aurora,
 * the intro script, the glass budget and the run-progress poller, so all of them persist across the
 * six routes (AC-03-29) and a live run keeps polling while the viewer changes page. Pages, loading and
 * error render inside it (`.lab2-page`), never a second root. Next 14 layouts cannot read
 * searchParams, so nothing here depends on them.
 */
export default function LabLayout({ children }: { children: ReactNode }) {
  return <LabRoot legacy={getAppearance().ui === 'legacy'}>{children}</LabRoot>;
}
