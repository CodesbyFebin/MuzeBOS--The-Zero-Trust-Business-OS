/**
 * AC-01-8: with every layer flag false, each layer-dependent section is `not_built` with its
 * LAB_COPY.layer sentence and carries no rows, on a real (non-sample) store holding data.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LAYERS_TEST_OVERRIDE, layerStates } from '@/lib/lab/view/layers';
import { LAB_COPY } from '@/lib/lab/view/copy';
import { FLAGS, fixtureStore, page } from './helpers/lab-v2-v';

const OFF = { measure: false, radar: false, ledger: false, gen: false, ask: false, retention: false, comments: false };

describe('layerStates rules (01 5.3)', () => {
  it('not built, needs_key, off, live', () => {
    const env = { youtubeOAuth: false, instagramOAuth: false, commentsEnabled: false };
    const on = { ...OFF, retention: true, comments: true, radar: true };
    expect(layerStates(env, OFF).radar).toBe('not_built');
    expect(layerStates(env, on)).toMatchObject({ radar: 'live', retention: 'needs_key', comments: 'off' });
    expect(layerStates({ youtubeOAuth: true, instagramOAuth: false, commentsEnabled: true }, on)).toMatchObject({ retention: 'live', comments: 'live' });
  });
});

describe('AC-01-8 every layer not built, real store', () => {
  beforeAll(() => {
    LAYERS_TEST_OVERRIDE.built = OFF;
  });
  afterAll(() => {
    LAYERS_TEST_OVERRIDE.built = null;
  });

  it('Today', async () => {
    const v = await page('today', fixtureStore(), FLAGS.real);
    expect(Object.values(v.frame.layers).every((s) => s === 'not_built')).toBe(true);
    expect(v.brief).toMatchObject({ state: 'not_built', sentence: LAB_COPY.layer.measure });
    expect(v.window).toMatchObject({ layer: 'not_built', card: null, message: LAB_COPY.layer.radar });
    expect(v.launchRadar.state).toMatchObject({ kind: 'not_built', message: LAB_COPY.layer.radar });
    expect(v.launchRadar.tiles).toHaveLength(0);
    expect(v.ledgerLine).toMatchObject({ state: { kind: 'not_built' }, sentence: LAB_COPY.layer.ledger });
    expect(v.askPanel.state.kind).toBe('not_built');
    expect(v.heroes.all?.yourNormal.label).toMatch(/\(not age-matched yet\)$/);
    expect(v.heroes.all?.yourNormal.delta.text).toBeNull();
  });
  it('Radar', async () => {
    const v = await page('radar', fixtureStore(), FLAGS.real);
    expect(v.radar).toBeNull();
    expect(v.timeline.state).toMatchObject({ kind: 'not_built', message: LAB_COPY.layer.radar });
    expect(v.timeline.lanes).toHaveLength(0);
    expect(v.leadTime.rows).toHaveLength(0);
  });
  it('Ledger', async () => {
    const v = await page('ledger', fixtureStore(), FLAGS.real);
    expect(v.ledger).toBeNull();
    expect(v.calibration.state.kind).toBe('not_built');
    expect(v.predictions.rows).toHaveLength(0);
    expect(v.tests.rows).toHaveLength(0);
  });
  it('Playbook rules and Breakouts Dual-High', async () => {
    const pb = await page('playbook', fixtureStore(), FLAGS.real);
    expect(pb.rules.state).toMatchObject({ kind: 'not_built', message: LAB_COPY.layer.gen });
    expect(pb.rules.rows).toHaveLength(0);
    const br = await page('breakouts', fixtureStore(), FLAGS.real);
    expect(br.filters.dualHighAvailable).toBe(false);
    expect(br.measureNote).toBe('Ratios compare against mature posts until age matching is live.');
  });
  it('Studio audience seeds hidden', async () => {
    const v = await page('studio', fixtureStore(), FLAGS.real);
    expect(v.seeds.state.kind).toBe('not_built');
    expect(v.seeds.rows).toHaveLength(0);
  });
});
