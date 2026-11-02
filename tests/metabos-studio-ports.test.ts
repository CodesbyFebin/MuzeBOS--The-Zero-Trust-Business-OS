import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h0 } from 'react';
import { readFileSync } from 'node:fs';
vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ push() {} }) }));
import { ExecutiveCockpit, SwarmRegistry, WorkflowStream, MemoryFabric, AiConsole } from '@/components/metabos/StudioPorts';

describe('AI Studio ports', () => {
  it('render loading state before real data, never mock numbers', () => {
    for (const C of [ExecutiveCockpit, WorkflowStream, MemoryFabric, AiConsole]) expect(renderToStaticMarkup(h0(C))).toContain('Loading');
  });
  it('registry lists bundled employee definitions without invented runtime status', () => {
    const h = renderToStaticMarkup(h0(SwarmRegistry));
    expect(h).toContain('Ad Manager Employee');
    expect(h).not.toMatch(/\b(online|active|idle|busy)\b/i);
  });
  it('source imports no mock data and console only files drafts', () => {
    const src = readFileSync('components/metabos/StudioPorts.tsx', 'utf8');
    expect(src).not.toMatch(/from '[^']*(mockData|genai|three)'|Math\.random|GEMINI/);
    expect(src).toContain("kind: 'draft'");
    expect(src).toContain('paidConsent: false');
    expect(src).not.toMatch(/\b(exec|spawn|eval)\(/);
  });
});
