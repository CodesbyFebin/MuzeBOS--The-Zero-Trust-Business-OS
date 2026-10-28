import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { KpiCard } from '@/components/metabos/KpiCard';
const files = ['components/metabos/MissionControl.tsx', 'components/metabos/HubKpis.tsx', 'components/metabos/KpiCard.tsx', 'components/metabos/CategoryWorkspace.tsx'];
// Sample strings from designs/mission-control-v3-App.tsx (claw-local classified them sample_data; each was reviewed by hand).
const SAMPLES = ['BrewBeans', '471.98', '18,420', 'sample1', 'Sample business records', 'Sample invoice data', 'Sample inventory data', '|| 12'];
describe('Mission Control v3 port', () => {
  it('carries none of the design mock sample data', () => { for (const f of files) { const src = readFileSync(f, 'utf8'); for (const s of SAMPLES) expect(src, `${f} contains ${s}`).not.toContain(s); } });
  it('KPI card shows "No records yet" for a null value, never a placeholder number', () => {
    const html = renderToStaticMarkup(React.createElement(KpiCard, { label: 'Outstanding invoices', value: null, href: '/x', icon: ShieldCheck }));
    expect(html).toContain('No records yet'); expect(html).toContain('data-empty'); expect(html).not.toMatch(/₹\s?\d/);
  });
  it('real zero stays a zero', () => { expect(renderToStaticMarkup(React.createElement(KpiCard, { label: 'Needs approval', value: 0, href: '/x', icon: ShieldCheck }))).toContain('>0<'); });
  it('v3 CSS uses only the allowed palette (no cyan, purple, blue)', () => {
    const css = readFileSync('app/metabos.css', 'utf8'); const v3 = css.slice(css.indexOf('Mission Control v3 design layer'), css.indexOf('Mission Control v3 shell layer'));
    for (const bad of ['#06B6D4', '#8B5CF6', '#3B82F6', '#EC4899', 'cyan', 'purple']) expect(v3).not.toContain(bad);
    expect(v3).toContain('#FF2A2A'); expect(v3).toContain('focus-visible'); expect(v3).toContain('prefers-reduced-motion');
  });
});

import { readFileSync as rf } from 'node:fs';
import { test as t2, expect as e2 } from 'vitest';
t2('v3 shell layer neutralises blue/purple status tokens', () => {
  const css = rf('app/metabos.css', 'utf8');
  const layer = css.slice(css.indexOf('Mission Control v3 shell layer'));
  e2(layer).toContain('--mb-blue:#8a8a8a');
  e2(layer).not.toMatch(/#5b9cff|#a98bff|cyan/i);
});
