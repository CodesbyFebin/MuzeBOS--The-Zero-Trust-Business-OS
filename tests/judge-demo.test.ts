import { describe, expect, it } from 'vitest';
import { DemoInput, FIXTURE_BODY, FIXTURE_NAME, fixturesEnabled, templateDraft } from '@/lib/metabos/demo/judge';
describe('judge demo', () => {
  it('labels fixtures and templates', () => {
    expect(FIXTURE_BODY).toMatch(/FIXTURE/); expect(FIXTURE_NAME).toMatch(/Fixture/);
    expect(templateDraft('Acme')).toContain('Acme');
  });
  it('fixtures can be turned off', () => { expect(fixturesEnabled({ MUZE_DEMO_FIXTURES: 'off' })).toBe(false); expect(fixturesEnabled({})).toBe(true); });
  it('rejects unknown actions', () => { expect(DemoInput.safeParse({ action: 'send' }).success).toBe(false); expect(DemoInput.safeParse({ action: 'fixtureLead' }).success).toBe(true); });
});
