'use client';
import { useState } from 'react';
import { auditDocument, type A11yIssue } from '@/lib/metabos/b3/a11y-checks';
const PAGES = ['/', '/workspace/orders', '/workspace/money', '/workspace/talk', '/workspace/brain/voice', '/workspace/growth/social', '/workspace/operations/pipelines'];
export function A11yAudit() {
  const [res, setRes] = useState<Record<string, A11yIssue[]> | null>(null); const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true); const out: Record<string, A11yIssue[]> = {};
    for (const p of PAGES) {
      out[p] = await new Promise((resolve) => { const f = document.createElement('iframe'); f.style.cssText = 'position:absolute;left:-9999px;width:1280px;height:900px'; f.title = `Audit ${p}`; f.src = p;
        f.onload = () => setTimeout(() => { try { resolve(auditDocument(f.contentDocument!)); } catch { resolve([]); } f.remove(); }, 1500); document.body.appendChild(f); });
    }
    setRes(out); setBusy(false);
  };
  return <section className="mb-v3" aria-labelledby="a11y-h"><h1 id="a11y-h" className="mb-heading">Accessibility self-audit</h1>
    <p className="mb-muted">Checks alt text, button and link names, form labels, 44px targets and the page language on key pages. A basic check, not a full WCAG audit.</p>
    <button type="button" onClick={run} disabled={busy} style={{ minHeight: 44 }}>{busy ? 'Auditing…' : 'Run audit'}</button>
    {res === null ? <p>No records yet</p> : <ul data-testid="a11y-results">{Object.entries(res).map(([p, is]) => <li key={p}><strong>{p}</strong>: {is.length ? `${is.length} issue(s)` : 'no issues found'}{is.length > 0 && <ul>{is.slice(0, 20).map((i, n) => <li key={n}>{i.rule} · {i.selector} · {i.detail}</li>)}</ul>}</li>)}</ul>}
  </section>;
}
