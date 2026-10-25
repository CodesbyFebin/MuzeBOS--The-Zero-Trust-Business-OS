import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { zernioStatusPill } from '@/lib/social-status';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const base = { detail: 'detail', today: '2026-10-09', filming: false, setupHref: '/integrations#zernio' };

describe('/social status pill (H15, AC03.7)', () => {
  test('not configured reads so and carries the setup link', () => {
    const p = zernioStatusPill({ ...base, state: 'not_configured', newestSnapshot: null });
    expect(p.text).toBe('Zernio not configured');
    expect(p.tone).toBe('off');
    expect(p.setupHref).toBe('/integrations#zernio');
  });

  test('a failed check is an error with the setup link, never "live"', () => {
    const p = zernioStatusPill({ ...base, state: 'error', newestSnapshot: '2026-10-09' });
    expect(p.text).toBe('Zernio check failed');
    expect(p.tone).toBe('err');
    expect(p.setupHref).not.toBeNull();
  });

  test('connected states the snapshot age; older than 48h is a warning', () => {
    expect(zernioStatusPill({ ...base, state: 'connected', newestSnapshot: '2026-10-09' })).toMatchObject({
      text: 'Zernio · synced today',
      tone: 'ok',
      setupHref: null,
    });
    expect(zernioStatusPill({ ...base, state: 'connected', newestSnapshot: '2026-10-08' }).tone).toBe('ok');
    const stale = zernioStatusPill({ ...base, state: 'connected', newestSnapshot: '2026-08-24' });
    expect(stale.text).toBe('Zernio · synced 46d ago');
    expect(stale.tone).toBe('warn');
    expect(stale.title).toContain('2026-08-24');
  });

  test('connected with no snapshots yet is a warning, and Filming appends "sample data"', () => {
    expect(zernioStatusPill({ ...base, state: 'connected', newestSnapshot: null }).tone).toBe('warn');
    expect(zernioStatusPill({ ...base, filming: true, state: 'connected', newestSnapshot: '2026-08-24' }).text).toBe(
      'Zernio · synced 46d ago · sample data',
    );
  });

  test('the page renders the pill from zernioStatus, never a hard-coded "Zernio live"', () => {
    const page = read('app/social/page.tsx');
    expect(page).not.toContain('Zernio live');
    expect(page).toContain('zernioStatusPill(');
    expect(page).toContain('await zernioStatus()');
    expect(page).toMatch(/pill\.setupHref && <SetupLink/);
  });
});

// GladOS's sample-post gate on its /social. FounderOS keeps its own /agents and /social (founderos/, tests/founderos-screens.test.ts).

describe('/social queue Remove with Undo (H40)', () => {
  test('the row goes optimistically, DELETE waits out a 5 s Undo, 409 restores', () => {
    // one state machine for both UI styles (components/social/use-post-composer.ts)
    const c = read('components/social/use-post-composer.ts');
    expect(c).toContain('export const QUEUE_UNDO_MS = 5000;');
    expect(read('components/PostComposer.tsx')).toMatch(/aria-label="Remove from queue"/);
    expect(read('components/social/PostComposerG.tsx')).toMatch(/aria-label="Remove from queue"/);
    expect(c).toMatch(/label: 'Undo'/);
    expect(c).toMatch(/method: 'DELETE'/);
    expect(c).toMatch(/res\.status === 409\) \{\s*restore\(entry\)/);
  });
});
