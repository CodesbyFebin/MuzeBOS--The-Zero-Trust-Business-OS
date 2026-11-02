/** Accessibility self-audit checks (batch 3 #15). Clean rebuild during the event; idea from the
 *  Open-Source-Accessibility-Framework fork (idea only, no code). Runs on any Document (browser or Playwright). */
export type A11yIssue = { rule: 'img-alt' | 'button-name' | 'link-name' | 'label' | 'target-size' | 'lang'; selector: string; detail: string };
const sel = (e: Element) => e.tagName.toLowerCase() + (e.id ? `#${e.id}` : '') + (e.getAttribute('data-testid') ? `[data-testid="${e.getAttribute('data-testid')}"]` : '');
const named = (e: Element) => !!((e.textContent ?? '').trim() || e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.getAttribute('title') || e.querySelector('img[alt]:not([alt=""])'));
export function auditDocument(doc: Document, opts: { minTarget?: number } = {}): A11yIssue[] {
  const out: A11yIssue[] = []; const min = opts.minTarget ?? 44;
  if (!doc.documentElement.getAttribute('lang')) out.push({ rule: 'lang', selector: 'html', detail: 'Missing lang attribute' });
  doc.querySelectorAll('img:not([alt])').forEach((e) => out.push({ rule: 'img-alt', selector: sel(e), detail: 'Image without alt' }));
  doc.querySelectorAll('button').forEach((e) => { if (!named(e)) out.push({ rule: 'button-name', selector: sel(e), detail: 'Button without an accessible name' }); });
  doc.querySelectorAll('a[href]').forEach((e) => { if (!named(e)) out.push({ rule: 'link-name', selector: sel(e), detail: 'Link without an accessible name' }); });
  doc.querySelectorAll('input:not([type=hidden]), select, textarea').forEach((e) => {
    const id = e.getAttribute('id'); const ok = e.closest('label') || (id && doc.querySelector(`label[for="${id}"]`)) || e.getAttribute('aria-label') || e.getAttribute('aria-labelledby');
    if (!ok) out.push({ rule: 'label', selector: sel(e), detail: 'Form field without a label' });
  });
  doc.querySelectorAll('button, a[href], [role=button]').forEach((e) => {
    const r = (e as HTMLElement).getBoundingClientRect?.(); if (r && r.width > 0 && r.height > 0 && (r.width < min && r.height < min)) out.push({ rule: 'target-size', selector: sel(e), detail: `${Math.round(r.width)}×${Math.round(r.height)}px, below ${min}px` });
  });
  return out;
}
