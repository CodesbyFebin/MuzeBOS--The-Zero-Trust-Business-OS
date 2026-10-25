import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { resolveBdpilotBotUrl, safeHttpUrl } from '@/lib/creds';
import { formatDelta } from '@/lib/delta';

/**
 * Phase 0 lane 0b honesty fixes (SPEC §3.4 H5 to H13), both styles. These
 * scan the shared data code and the Classic trees; the GladOS trees prove
 * the same rows through their own ACs in Phase 3.
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('H5: the approval bot link exists only when BDPILOT_BOT_URL is a real URL', () => {
  const prevOverride = process.env.GLADOS_ENV_LOCAL;
  const prevUrl = process.env.BDPILOT_BOT_URL;
  let tmp: string;

  beforeEach(() => {
    tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bdbot-')), '.env.local');
    process.env.GLADOS_ENV_LOCAL = tmp;
    delete process.env.BDPILOT_BOT_URL;
  });
  afterEach(() => {
    if (prevOverride === undefined) delete process.env.GLADOS_ENV_LOCAL;
    else process.env.GLADOS_ENV_LOCAL = prevOverride;
    if (prevUrl === undefined) delete process.env.BDPILOT_BOT_URL;
    else process.env.BDPILOT_BOT_URL = prevUrl;
  });

  test('unset resolves to null', () => {
    expect(resolveBdpilotBotUrl()).toBeNull();
  });

  test('set in the environment or in .env.local resolves to the URL (.env.local wins)', () => {
    process.env.BDPILOT_BOT_URL = 'https://t.me/example_env_bot';
    expect(resolveBdpilotBotUrl()).toBe('https://t.me/example_env_bot');
    fs.writeFileSync(tmp, 'BDPILOT_BOT_URL=https://t.me/example_local_bot\n');
    expect(resolveBdpilotBotUrl()).toBe('https://t.me/example_local_bot');
  });

  test('safeHttpUrl refuses empty, relative and script URLs', () => {
    expect(safeHttpUrl('')).toBeNull();
    expect(safeHttpUrl('   ')).toBeNull();
    expect(safeHttpUrl(undefined)).toBeNull();
    expect(safeHttpUrl('/brand-deals')).toBeNull();
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('t.me/bot')).toBeNull();
    expect(safeHttpUrl(' http://example.com/x ')).toBe('http://example.com/x');
  });

  test('the board takes botUrl from the server and renders no link without it', () => {
    const page = read('app/brand-deals/page.tsx');
    expect(page).toContain('resolveBdpilotBotUrl()');
    expect(page).toMatch(/botUrl=\{resolveBdpilotBotUrl\(\)\}/);
    const board = read('components/brand-deals/DealBoard.tsx');
    expect(board).not.toMatch(/BOT_URL\s*=\s*''/);
    expect(board).not.toMatch(/href=\{BOT_URL\}/);
    // every href built from the bot URL sits behind a botUrl guard
    const hrefs = board.match(/href=\{botUrl\}/g) ?? [];
    const guards = board.match(/\{botUrl && \(/g) ?? [];
    expect(hrefs.length).toBeGreaterThan(0);
    expect(guards.length).toBeGreaterThanOrEqual(hrefs.length);
  });

  test('.env.example documents BDPILOT_BOT_URL', () => {
    expect(read('.env.example')).toMatch(/^# BDPILOT_BOT_URL=/m);
  });
});

describe('H6 to H8: brand deals poll status, missing daemon, dollar bars', () => {
  const board = read('components/brand-deals/DealBoard.tsx');

  test('H6: no static "live · refreshes" claim; the pill reads pollStatus', () => {
    expect(board).not.toContain('live · refreshes 30s');
    expect(board).toContain('pollStatus(lastOkAt, now, lastError)');
    // a non-200 poll counts as a failure, not a silent keep
    expect(board).toMatch(/if \(!r\.ok\) throw/);
    expect(board).toContain('setLastError(true)');
  });

  test('H7: bdpilot not reporting renders the unconfigured state with a SetupLink', () => {
    expect(board).toMatch(/if \(!snap\.sources\.state\)/);
    expect(board).toMatch(/bdpilot is not reporting[\s\S]{0,400}<SetupLink/);
  });

  test('H8: Pipeline bars are measured in dollars from stageBars', () => {
    expect(board).toContain('stageBars(snap)');
    expect(board).toMatch(/measure=\{\(s\) => s\.value\}/);
    expect(board).toMatch(/value: c\.usd/);
    expect(read('components/PipelineChart.tsx')).toContain('stageBarGeometry(');
  });
});

describe('H12, H13: funnel deltas and windows', () => {
  const funnel = read('components/funnel/FunnelDashboard.tsx');

  test('H12: the Revenue delta goes through lib/delta formatDelta; no local percentage maths', () => {
    expect(funnel).toContain("import { formatDelta } from '@/lib/delta'");
    expect(funnel).toMatch(/formatDelta\(cur, prev, \{ money \}\)/);
    expect(funnel).not.toMatch(/\{Math\.abs\(p\)\}%/);
    // a 1571% swing off a small base reads as dollars (AC02.8)
    const d = formatDelta(374_255, 22_355, { money: true })!;
    expect(d.kind).toBe('abs');
    expect(d.text).not.toMatch(/%/);
    expect(d.text).toMatch(/^\+\$352K vs previous$/);
    expect(formatDelta(374_255, 0, { money: true })!.text).toMatch(/vs nothing before$/);
    expect(formatDelta(110, 100)!.text).toBe('+10%');
  });

  test('H13: Pipeline says all active journeys; period cards name the period', () => {
    expect(funnel).toMatch(/Pipeline<span className="fc-card-window">All active journeys<\/span>/);
    for (const card of ['Revenue', 'New leads', 'Converted']) {
      expect(funnel).toContain(`${card}<span className="fc-card-window">{periodWindow}</span>`);
    }
    expect(funnel).toMatch(/const periodWindow = PERIODS\.find/);
  });
});

describe('H9 to H11: finances shows only figures it can source', () => {
  const page = read('app/finances/page.tsx');
  const client = read('app/finances/FinancesClient.tsx');

  test('H9: the page never falls back to SAMPLE_EXPENSES; it passes expensesSource', () => {
    expect(page).not.toContain('SAMPLE_EXPENSES');
    expect(page).toContain('expensesView(');
    expect(page).toMatch(/expensesSource=\{expensesSource\}|^\s*expensesSource,$/m); // JSX prop or the shared props object (two trees, lane R)
    // no expense figure and no donut when the source is none
    expect(client).toMatch(/expensesSource === 'none' \? '—'/);
    expect(client).toContain('Upload a card CSV to see spend by category');
    expect(client).toContain('no expenses uploaded');
  });

  test('H10: processor suffix follows the page period, no hard-coded YTD', () => {
    expect(client).toContain('processorPeriodLabel(a, headlinePeriod)');
    expect(client).not.toMatch(/a\.live \? 'YTD'/);
  });
});
