import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { describe, expect, test } from 'vitest';
import { renderWithRouter } from './helpers/render-client';
import { G_READY, G_TREE_FILES } from '@/lib/g-ready';
import { NAV_ITEMS } from '@/lib/nav';
import { sampleTrading } from '@/lib/fo-sample';
import { buildView, type TradingPayload } from '@/lib/trading-view';
import { checkLimit, parseLog, signedUsd, totalHistory, tradingModel, usdCompact } from '@/lib/trading-model';
import { TradingG } from '@/components/trading/TradingG';
import { TradingClassic } from '@/components/trading/TradingClassic';
import type { ConnectorStatus } from '@/lib/connectors/types';
import type { TradingAccountSnapshot } from '@/lib/schemas';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const NOW = new Date('2026-10-12T15:00:00Z');
const status = (id: string, state: ConnectorStatus['state'], detail = ''): ConnectorStatus => ({ id, name: id, kind: 'payments', state, detail });
const setup = { robinhood: '/integrations#robinhood', phantom: '/integrations#phantom' };

/** A blank install: no feed, no wallet address. */
function blank(): TradingPayload {
  const accounts: TradingAccountSnapshot[] = [];
  return {
    accounts, history: {}, positions: [], activity: [], analysis: null, openOrders: [], limits: null,
    status: status('robinhood', 'not_configured'), phantomStatus: status('phantom', 'not_configured'), phantom: null,
    view: buildView({ accounts, positions: [], activity: [], phantom: null, now: NOW.getTime() }),
    mode: 'live', sample: false, at: NOW.toISOString(),
  };
}

/** The sample fixture as a live payload, optionally aged. */
function live(ageH = 0, opts: { wallet?: 'ok' | 'error' | 'none'; limits?: boolean } = {}): TradingPayload {
  const now = new Date(NOW.getTime() - ageH * 3600_000);
  const s = sampleTrading(now);
  const wallet = opts.wallet ?? 'ok';
  const phantom = wallet === 'ok' ? s.phantom : null;
  return {
    ...s,
    limits: opts.limits === false ? null : s.limits,
    phantom,
    status: status('robinhood', ageH >= 24 ? 'error' : 'connected'),
    phantomStatus: wallet === 'none' ? status('phantom', 'not_configured') : wallet === 'error' ? status('phantom', 'error', 'RPC 503') : status('phantom', 'connected'),
    view: buildView({ accounts: s.accounts, positions: s.positions, activity: s.activity, phantom, now: NOW.getTime() }),
    mode: 'live', sample: false, at: NOW.toISOString(),
  };
}

describe('trading model (pages/trading.md §3, §5)', () => {
  test('blank install: unconfigured, no total, no subtitle numbers, no limits', () => {
    const m = tradingModel(blank(), { brandName: 'GladOS' });
    expect(m.unconfigured).toBe(true);
    expect(m.totalUsd).toBeNull();
    expect(m.subtitle).toBeNull();
    expect(m.limits.saved).toBeNull();
    expect(m.limits.savedLabel).toBe('No limits saved');
    expect(m.limits.fields.every((f) => f.stored === null)).toBe(true);
    expect(m.feedPill).toBeNull();
  });

  test('live: subtitle totals brokerage plus the wallet, feed pill ok', () => {
    const m = tradingModel(live(), { brandName: 'GladOS' });
    expect(m.unconfigured).toBe(false);
    expect(m.subtitle).toMatch(/^\$13,225 across 3 accounts · updated 12 min ago$/);
    expect(m.feedPill?.tone).toBe('ok');
    expect(m.initialAcct).toBe('agentic');
  });

  test('stale (T-3): a capture over 24 h old is a warn pill with its age', () => {
    const m = tradingModel(live(49), { brandName: 'GladOS' });
    expect(m.feed).toBe('stale');
    expect(m.feedPill).toMatchObject({ tone: 'warn', text: 'Feed 2 days old' });
  });

  test('partial: wallet unreachable keeps every other number and names the error', () => {
    const m = tradingModel(live(0, { wallet: 'error' }), { brandName: 'GladOS' });
    const w = m.accounts.find((a) => a.kind === 'wallet');
    expect(w).toMatchObject({ valueUsd: null, note: 'Wallet not reachable', error: 'RPC 503' });
    expect(m.totalUsd).toBe(12_730);
  });

  test('wallet only: not unconfigured; the feed still asks to connect', () => {
    const p = blank();
    p.phantomStatus = status('phantom', 'connected');
    p.phantom = { address: 'x', sol: 2, usdPerSol: 100, usdValue: 200, fetchedAt: NOW.toISOString() };
    const m = tradingModel(p, { brandName: 'GladOS' });
    expect(m.unconfigured).toBe(false);
    expect(m.feed).toBe('none');
    expect(m.totalUsd).toBe(200);
  });

  test('?acct and ?log: honoured when valid, defaulted otherwise', () => {
    expect(tradingModel(live(), { acct: 'individual' }).initialAcct).toBe('individual');
    expect(tradingModel(live(), { acct: 'nope' }).initialAcct).toBe('agentic');
    expect(parseLog('rejected')).toBe('rejected');
    expect(parseLog('x')).toBe('all');
  });

  test('sample payloads are read only and badged', () => {
    const p = live();
    p.sample = true;
    p.mode = 'sample';
    const m = tradingModel(p);
    expect(m.readOnly).toBe(true);
    expect(m.fixture).toMatch(/sample/);
  });

  test('copy names the brand from BRAND, never a literal (AC-15)', () => {
    const m = tradingModel(blank(), { brandName: 'FounderOS' });
    expect(m.copy.subtitleEmpty).toContain('FounderOS never places an order');
    expect(m.copy.autopilotBody).toContain('FounderOS does not place orders itself');
  });

  test('helpers: limits validation, signs, compact axis, carried total history', () => {
    const f = { label: 'Max positions', min: 1, max: 500, integer: true };
    expect(checkLimit(f, '')).toEqual({ value: null, error: 'Required' });
    expect(checkLimit(f, '2.5').error).toBe('Whole number only');
    expect(checkLimit(f, '0').error).toBe('At least 1');
    expect(checkLimit(f, '6')).toEqual({ value: 6, error: null });
    expect(checkLimit({ label: 'Budget', min: 1, max: 10_000_000, integer: false }, '$2,000').value).toBe(2000);
    expect(signedUsd(-8.15)).toBe('−$8.15');
    expect(signedUsd(142, false)).toBe('+$142');
    expect(usdCompact(12_488)).toBe('$12.5k');
    const h = totalHistory({
      a: [{ capturedAt: '2026-10-01T00:00:00Z', accountId: 'a', accountValueUsd: 10 } as TradingAccountSnapshot],
      b: [
        { capturedAt: '2026-10-02T00:00:00Z', accountId: 'b', accountValueUsd: 5 } as TradingAccountSnapshot,
        { capturedAt: '2026-10-03T00:00:00Z', accountId: 'b', accountValueUsd: 7 } as TradingAccountSnapshot,
      ],
    });
    expect(h).toEqual([15, 17]); // no partial point before b first reports
  });
});

describe('trading trees render every state', () => {
  for (const [name, Tree] of [['GladOS', TradingG], ['Classic', TradingClassic]] as const) {
    test(`${name}: blank install shows Not configured with Set up links and no numbers (T-1)`, () => {
      const html = renderWithRouter(createElement(Tree, { model: tradingModel(blank(), { brandName: 'GladOS' }), pushPath: '/api/trading/snapshot', setup }));
      expect(html).toContain('Not configured');
      expect(html).toContain('href="/integrations#robinhood"');
      expect(html).toContain('href="/integrations#phantom"');
      expect(html).toContain('Connect the Markets agent feed. Its first push fills this page.');
      expect(html).toContain('/api/trading/snapshot');
      expect(html).not.toMatch(/\$\d/);
      expect(html).not.toContain('data-sample-badge');
    });

    test(`${name}: live board renders every card; no Sample badge`, () => {
      const html = renderWithRouter(createElement(Tree, { model: tradingModel(live(), { brandName: 'GladOS' }), pushPath: '/api/trading/snapshot', setup }));
      for (const t of ['Agent sleeve', 'Accounts', 'Agent reasoning', 'Positions', 'Open orders', 'Trade log', 'Agent limits']) expect(html).toContain(t);
      expect(html).toContain('Only the agentic sleeve can be traded by an agent. Wallet read from a public RPC.');
      expect(html).toContain('SOFI');
      expect(html).not.toContain('data-sample-badge');
    });

    test(`${name}: sample shows the Sample badge and read-only limits`, () => {
      const p = live();
      p.sample = true;
      p.mode = 'filming';
      const html = renderWithRouter(createElement(Tree, { model: tradingModel(p, { brandName: 'GladOS' }), pushPath: '/api/trading/snapshot', setup }));
      expect(html).toContain('data-sample-badge');
      expect(html).toContain('Sample data: limits are read only here');
    });

    test(`${name}: empty feed (no positions, trades or analysis) says so plainly`, () => {
      const p = live();
      p.positions = [];
      p.activity = [];
      p.analysis = null;
      p.openOrders = [];
      p.view = buildView({ accounts: p.accounts, positions: [], activity: [], phantom: p.phantom, now: NOW.getTime() });
      const html = renderWithRouter(createElement(Tree, { model: tradingModel(p, { brandName: 'GladOS' }), pushPath: '/api/trading/snapshot', setup }));
      expect(html).toContain('No open positions.');
      expect(html).toContain('No trades yet.');
      expect(html).toContain('No analysis pushed yet.');
      expect(html).toContain('No live orders at the broker.');
    });

    test(`${name}: no limits saved keeps autopilot locked behind a reason`, () => {
      const html = renderWithRouter(createElement(Tree, { model: tradingModel(live(0, { limits: false }), { brandName: 'GladOS' }), pushPath: '/api/trading/snapshot', setup }));
      expect(html).toContain('No limits saved');
      expect(html).toContain('Save limits first');
    });
  }
});

describe('trading wiring and house rules', () => {
  const g = read('components/trading/TradingG.tsx');
  const c = read('components/trading/TradingClassic.tsx');
  const page = read('app/trading/page.tsx');

  test('nav: Revenue, after Finances, Trading with CandlestickChart', () => {
    const i = NAV_ITEMS.findIndex((n) => n.href === '/trading');
    expect(NAV_ITEMS[i - 1].href).toBe('/finances');
    expect(NAV_ITEMS[i].label).toBe('Trading');
    expect(read('lib/nav.ts')).toMatch(/href: '\/trading', label: 'Trading', icon: CandlestickChart/);
  });

  test('one build, trees only render; registered for the guard', () => {
    expect(page).toContain('buildTradingPage(searchParams)');
    expect(page).toMatch(/treeFor\(getAppearance\(\), '\/trading'\)/);
    expect(G_READY).toContain('/trading');
    expect(G_TREE_FILES['/trading']).toContain('components/trading/TradingG.tsx');
    for (const src of [g, c]) {
      expect(src).not.toMatch(/getDb|@\/lib\/data|fetch\(/);
    }
  });

  test('monitor only (T13): the only write is PATCH /api/trading/limits', () => {
    const hook = read('components/trading/use-trading.ts');
    const calls = [...hook.matchAll(/fetch\('([^']+)', \{ method: '(\w+)'/g)].map((m) => `${m[2]} ${m[1]}`);
    expect(calls).toEqual(['PATCH /api/trading/limits']);
    expect(hook).toContain('{ autopilot: true, confirm: true }');
  });

  test('GladOS tree: kit parts only, no raw controls, no literals, no mono class, no brand literal', () => {
    expect(g).not.toMatch(/<(button|input|select|textarea)\b/);
    expect(g).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsl\(/);
    expect(g).not.toMatch(/font-mono/);
    expect(code(g)).not.toContain('GladOS');
  });

  test('Classic tree: no colour literals, no brand literal', () => {
    expect(c).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsl\(/);
    expect(code(c)).not.toContain('GladOS');
  });

  test('Trading CSS block uses tokens only', () => {
    const css = read('app/globals.css');
    const block = css.slice(css.indexOf('/* ── Trading (/trading'), css.indexOf('/* ── end Trading ── */'));
    expect(block.length).toBeGreaterThan(100);
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsl\(/);
    expect(block).toMatch(/prefers-reduced-motion: reduce/);
  });
});
