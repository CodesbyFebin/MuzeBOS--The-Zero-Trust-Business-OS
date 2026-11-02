import { describe, expect, it } from 'vitest';
import { flyTarget, guideTextFor } from '@/lib/metabos/muse/roam';
import { routeMuseVoice } from '@/lib/metabos/muse/voice';
const el = (a: Record<string, string>, text = '') => ({ getAttribute: (n: string) => a[n] ?? null, textContent: text });
describe('MuZe roam', () => {
  it('lands right of a target when it fits, left when not, and stays on screen', () => {
    expect(flyTarget({ left: 10, top: 100, width: 100, height: 40 }, 1000, 800, 96)).toEqual({ x: 122, y: 72 });
    expect(flyTarget({ left: 850, top: 100, width: 100, height: 40 }, 1000, 800, 96)).toEqual({ x: 742, y: 72 });
    expect(flyTarget({ left: 10, top: -50, width: 100, height: 20 }, 1000, 800, 96).y).toBe(0);
    expect(flyTarget({ left: 10, top: 790, width: 100, height: 40 }, 1000, 800, 96).y).toBe(704);
  });
  it('guide text comes only from the element', () => {
    expect(guideTextFor(el({ 'data-guide': 'HQ: counts', 'aria-label': 'x' }))).toBe('HQ: counts');
    expect(guideTextFor(el({ 'aria-label': 'Trust' }))).toBe('Trust');
    expect(guideTextFor(el({}, '  Agent   Office '))).toBe('Agent Office');
    expect(guideTextFor(el({}))).toBe('No description for this element yet.');
    expect(guideTextFor(null)).toMatch(/not on screen/);
  });
  it('routes show me / dance / fullscreen / come back', () => {
    expect(routeMuseVoice('show me the trust stack')).toEqual({ kind: 'view', view: 'trust' });
    expect(routeMuseVoice('where is verification')).toMatchObject({ kind: 'view', view: 'verify' });
    expect(routeMuseVoice('dance')).toEqual({ kind: 'roam', action: 'dance' });
    expect(routeMuseVoice('go fullscreen')).toEqual({ kind: 'roam', action: 'fullscreen' });
    expect(routeMuseVoice('come back')).toEqual({ kind: 'roam', action: 'home' });
    expect(routeMuseVoice('Tell the customer their order is ready').kind).toBe('send');
  });
});
