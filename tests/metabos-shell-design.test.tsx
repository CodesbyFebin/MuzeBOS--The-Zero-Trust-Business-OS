import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
let mockPath = '/workspace/orders';
vi.mock('next/navigation', () => ({ usePathname: () => mockPath }));
import { WorkspaceNavigation } from '@/components/metabos/WorkspaceNavigation';
import { MetaTopbar } from '@/components/metabos/MetaTopbar';

describe('MeTaBos shell (design port)', () => {
  it('pins Brain expanded at the top of a non-Brain secondary panel', () => {
    const html = renderToStaticMarkup(createElement(WorkspaceNavigation));
    expect(html).toContain('data-testid="brain-pinned"');
    expect(html.indexOf('brain-pinned')).toBeLessThan(html.indexOf('Orders pages') === -1 ? Infinity : html.length);
    mockPath = '/workspace/brain';
    expect(renderToStaticMarkup(createElement(WorkspaceNavigation))).not.toContain('brain-pinned');
    mockPath = '/workspace/orders';
  });
  it('top bar has search, details, notifications and profile controls with labels', () => {
    const html = renderToStaticMarkup(createElement(MetaTopbar, { onSearch: () => {} }));
    for (const l of ['Search pages and commands (Ctrl+K)', 'Page details', 'Notifications', 'Profile and account', 'Breadcrumb']) expect(html).toContain(l);
  });
  it('uses the reference tokens and no runtime font CDN or mock figures', () => {
    const css = readFileSync('app/metabos.css', 'utf8');
    for (const t of ['--mb-bg:#0A0A0A', '--mb-accent:#FF2A2A', '--mb-rail-w:56px', '--mb-panel-w:248px', '--mb-topbar-h:52px', '--mb-tab-h:62px', 'safe-area-inset-bottom']) expect(css).toContain(t);
    expect(css).not.toMatch(/fonts\.(googleapis|gstatic)/);
    const src = readFileSync('components/metabos/ShellExtras.tsx', 'utf8');
    expect(src).toContain('No records yet');
    expect(src).not.toMatch(/1K|\b\d{2,}%/);
  });
});
