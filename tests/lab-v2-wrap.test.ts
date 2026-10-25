/**
 * AC-01-35: each wrapped domain view deep-equals its owner's builder output on the fixture world.
 * Radar, Studio, Ledger, Window (lab-v2-pages / lab-v2-today), Event, Idea, Setup, Ask
 * (lab-v2-sheet-models) are checked there; this file adds the Script sheet and the version rule.
 */
import { describe, expect, it } from 'vitest';
import { scriptSheetView } from '@/lib/lab/gen/view';
import { LAB_COPY } from '@/lib/lab/view/copy';
import { FIXTURE_IDS, FLAGS, NOW, fixtureStore, sheet } from './helpers/lab-v2-v';

describe('AC-01-35 Script sheet wraps 07 scriptSheetView unchanged', () => {
  it('latest version', async () => {
    const s = fixtureStore();
    const sh = await sheet('script', FIXTURE_IDS.script, s, FLAGS.sample);
    const v = sh.kind === 'script' ? sh.view! : null;
    expect(v?.data).toEqual(scriptSheetView(s, FIXTURE_IDS.script, { now: NOW, dry: false, sample: true, readOnly: true }));
    expect(v?.readOnly).toBe(LAB_COPY.readOnly);
    expect(v?.freeze.bands.map((b) => b.id)).toEqual(['below', 'normal', 'above', 'breakout']);
  });
  it('?ver= an older version: that version read-only', async () => {
    const s = fixtureStore();
    const sh = await sheet('script', FIXTURE_IDS.script, s, FLAGS.filming, { ver: '1' });
    const v = sh.kind === 'script' ? sh.view! : null;
    expect(v?.viewingVersion).toBe(1);
    expect(v?.data).toEqual(scriptSheetView(s, FIXTURE_IDS.script, { now: NOW, dry: true, sample: false, readOnly: false, version: 1 }));
    expect(v?.readOnly).toBe('Viewing v1. Open the latest version to edit.');
  });
});
