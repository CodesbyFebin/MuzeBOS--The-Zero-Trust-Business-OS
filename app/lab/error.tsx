'use client';
/** Lab error state (01 4.7): frame title, then one card with the message (first 200 chars, no stack). */
import Link from 'next/link';
import { LAB_COPY } from '@/lib/lab/view/copy';

export default function LabError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const F = LAB_COPY.frame;
  return (
    <div className="lab2-page">
        <header className="lab2-head"><span className="lab2-back" data-lab-ink="">{LAB_COPY.title}</span></header>
        <div className="lab2-empty labv-empty-card lab2-glass" data-tone="strong" data-radius="narrative">
          <h2 className="lab2-empty-title" data-lab-ink="">{F.errorTitle}</h2>
          <p className="lab2-empty-text" data-lab-ink="">{(error?.message ?? '').slice(0, 200)}</p>
          <span className="lab2-empty-actions">
            <button type="button" className="lab2-pill" onClick={reset}>{F.tryAgain}</button>
            <Link href="?setup=spend" className="lab2-textlink" data-lab-ink="">{F.openSetup}</Link>
          </span>
        </div>
    </div>
  );
}
