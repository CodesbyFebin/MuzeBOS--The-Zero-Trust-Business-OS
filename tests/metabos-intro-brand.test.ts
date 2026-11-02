import { describe, it, expect, vi } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ push() {} }) }));
import { BrandMark, BrandLockup, MARK_PATH } from '@/components/metabos/BrandMark';
import { OpeningIntro, INTRO_CAPTIONS } from '@/components/metabos/OpeningIntro';
import { MissionWidgets } from '@/components/metabos/StudioPorts';

describe('brand, intro and widgets', () => {
  it('mark is inline SVG shared by icon and lockup', () => {
    expect(renderToStaticMarkup(h(BrandMark))).toContain(MARK_PATH);
    expect(renderToStaticMarkup(h(BrandLockup))).toContain('OPERATOR MODE');
    expect(readFileSync('app/icon.svg', 'utf8')).toContain(MARK_PATH);
    expect(readFileSync('app/icon.svg', 'utf8')).toContain('#FF2A2A');
  });
  it('intro renders nothing on the server and has a reduced-motion rule', () => {
    expect(renderToStaticMarkup(h(OpeningIntro))).toBe('');
    expect(readFileSync('app/metabos.css', 'utf8')).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.mb-intro-mark/);
    expect(INTRO_CAPTIONS.join(' ')).not.toMatch(/autonomous/i);
  });
  it('narration uses only browser speechSynthesis and is off by default', () => {
    const src = readFileSync('components/metabos/OpeningIntro.tsx', 'utf8');
    expect(src).toContain("localStorage.getItem(VOICE) === 'on'");
    expect(src).not.toMatch(/fetch\(|\.mp3|\.wav|api[_-]?key/i);
  });
  it('widgets wait for real data and state voice input is off', () => {
    const out = renderToStaticMarkup(h(MissionWidgets));
    expect(out).toContain('Loading');
    expect(out).toContain('Muse Voice is not connected');
  });
});
