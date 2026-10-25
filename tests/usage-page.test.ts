import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ReactElement } from 'react';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { renderWithRouter } from './helpers/render-client';
import { classifyClaude, classifyCodex, resetUsageCache, scanLocalUsage, summarizeLanes } from '@/lib/usage';
import { buildUsagePayload, type UsageOn, type UsagePayload } from '@/lib/usage-payload';
import { NO_GAUGE, NOT_REPORTED, buildUsageView } from '@/lib/usage-view';
import { G_READY, G_TREE_FILES } from '@/lib/g-ready';
import { NAV_ORDER } from '@/lib/nav';

/** /usage page (pages/usage.md §3, §9): the view model and both trees, blank, sample and filming. */

const NOW = new Date('2026-10-13T12:00:00');

beforeAll(() => {
  process.env.GLADOS_DB = path.join(mkdtempSync(path.join(tmpdir(), 'glados-usage-page-')), 'test.db');
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetUsageCache();
});

function emptyDirs() {
  const root = mkdtempSync(path.join(tmpdir(), 'glados-usage-'));
  vi.stubEnv('CLAUDE_PROJECTS_DIR', path.join(root, 'none-claude'));
  vi.stubEnv('CODEX_SESSIONS_DIR', path.join(root, 'none-codex'));
  vi.stubEnv('OLLAMA_HOST', 'http://127.0.0.1:9');
  vi.stubEnv('DEMO_MODE', '0');
  return root;
}

async function render(searchParams: Record<string, string>, ui: 'glados' | 'classic') {
  vi.doMock('@/lib/appearance-server', () => ({
    getAppearance: () => ({
      ui,
      accent: 'ice',
      mode: 'dark',
      theme: 'grey-frost',
    }),
  }));
  vi.resetModules();
  const { default: Page } = await import('@/app/usage/page');
  const html = renderWithRouter((await Page({ searchParams })) as ReactElement);
  vi.doUnmock('@/lib/appearance-server');
  return html;
}

describe('/usage view model', () => {
  test('blank install: Not configured with what was checked, never a zero', async () => {
    emptyDirs();
    const p = await buildUsagePayload({
      url: 'http://localhost/usage',
      now: NOW,
    });
    const v = buildUsageView(p, NOW.getTime());
    expect(v.kind).toBe('unconfigured');
    if (v.kind !== 'unconfigured') return;
    expect(v.title).toBe('No usage source found on this machine.');
    expect(v.checks.map((c) => c.ok)).toEqual([false, false, false]);
    expect(v.push.path).toBe('/api/usage/push');
  });

  test('sample: badged, three plan cards, an unreported plan says "Not reported" (U-2), no gauge without a provider (U-3)', async () => {
    emptyDirs();
    const p = await buildUsagePayload({
      url: 'http://localhost/usage?sample=1',
      now: NOW,
    });
    const v = buildUsageView(p, NOW.getTime());
    expect(v.kind).toBe('ready');
    if (v.kind !== 'ready') return;
    expect(v.sample).toBe(true);
    expect(v.plans.map((x) => x.plan)).toEqual(['claude', 'codex', 'ollama']);
    const ollama = v.plans.find((x) => x.plan === 'ollama')!;
    expect(ollama.total).toBe(NOT_REPORTED);
    expect(ollama.burn).toBeNull();
    expect(ollama.status).toEqual({
      tone: 'err',
      text: 'Ollama not answering',
    });
    expect(v.limits.gauges).toEqual([]);
    expect(v.limits.note).toBe(NO_GAUGE);
    // the chart stacks only plans that reported
    expect(v.burnChart.keys.map((k) => k.id)).toEqual(['claude', 'codex']);
    expect(v.lanes.rows?.map((l) => l.label)).toEqual(['Agent board', 'My sessions', 'Terminal', 'Crons and headless']);
  });

  test('official gauges only when the provider reported one', () => {
    const base = {
      available: true,
      mode: 'live',
      sample: false,
      configured: true,
      range: 7,
      totalBurn: 10,
      topBurner: null,
      machine: 'm',
      sources: { claude: false, codex: true },
      ollama: { state: 'down', models: [], error: null },
      lanes: null,
      planLanes: { claude: null, codex: null, ollama: null },
      push: { path: '/api/usage/push', tokenSet: false },
      readAt: NOW.toISOString(),
      footnote: '',
    } as const;
    const plan = (official: UsageOn['plans'][number]['official']) => ({
      plan: 'codex' as const,
      label: 'ChatGPT / Codex',
      reported: true,
      burn: 10,
      days: [{ day: '2026-10-13', burn: 10 }],
      byModel: [{ model: 'codex', burn: 10 }],
      machines: [],
      official,
    });
    const withGauge = buildUsageView(
      {
        ...base,
        plans: [
          plan({
            session: null,
            weekly: { usedPercent: 41, windowMinutes: 10080, resetsAt: null },
            at: NOW.toISOString(),
          }),
        ],
      } as unknown as UsagePayload,
      NOW.getTime(),
    );
    const without = buildUsageView({ ...base, plans: [plan(null)] } as unknown as UsagePayload, NOW.getTime());
    expect(withGauge.kind === 'ready' && withGauge.limits.gauges.map((g) => g.used)).toEqual([41]);
    expect(without.kind === 'ready' && without.limits.gauges).toEqual([]);
  });

  test('lanes: board, Superset sessions, headless and terminal from cwd and entrypoint', () => {
    expect(classifyClaude({ cwd: '/home/op/.paperclip/workspaces/seat' })).toBe('board');
    expect(classifyClaude({ cwd: '/home/op/.superset/worktrees/glados/a' })).toBe('sessions');
    expect(classifyClaude({ cwd: '/home/op/code', entrypoint: 'sdk-ts' })).toBe('automation');
    expect(classifyClaude({ cwd: '/home/op/code', entrypoint: 'cli' })).toBe('terminal');
    expect(classifyCodex({ cwd: '/tmp', originator: 'codex_exec' })).toBe('automation');
    const root = mkdtempSync(path.join(tmpdir(), 'glados-usage-'));
    mkdirSync(path.join(root, 'p'), { recursive: true });
    vi.stubEnv('CLAUDE_PROJECTS_DIR', root);
    vi.stubEnv('CODEX_SESSIONS_DIR', path.join(root, 'none'));
    const line = (cwd: string, n: number) =>
      JSON.stringify({
        type: 'assistant',
        timestamp: new Date().toISOString(),
        cwd,
        entrypoint: 'cli',
        message: {
          model: 'opus',
          usage: {
            input_tokens: n,
            output_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 500,
          },
        },
      });
    writeFileSync(path.join(root, 'p', 's.jsonl'), `${line('/home/op/.superset/worktrees/a', 10)}\n${line('/home/op/code', 5)}\n`);
    const scan = scanLocalUsage();
    const lanes = summarizeLanes({
      lanes: scan.lanes,
      range: 7,
      now: new Date(),
    });
    expect(Object.fromEntries(lanes.map((l) => [l.lane, l.burn]))).toEqual({
      board: 0,
      sessions: 10,
      terminal: 5,
      automation: 0,
    });
  });

  test('demo mode: the badged sample, and a demo instance stays "not available" (U-1)', async () => {
    vi.stubEnv('DEMO_MODE', '1');
    const p = await buildUsagePayload({
      url: 'http://localhost/usage',
      now: NOW,
    });
    expect(p).toMatchObject({ available: true, mode: 'sample', sample: true, machine: 'sample-laptop' });
    const demo = buildUsageView({
      available: false,
      reason: 'demo instance',
      message: 'Usage is not available on this instance.',
      sample: false,
    });
    expect(demo).toMatchObject({ kind: 'off', filming: false });
  });
});

describe('/usage trees', () => {
  test.each(['glados', 'classic'] as const)('%s: blank install renders Not configured with a Set up link', async (ui) => {
    emptyDirs();
    const html = await render({}, ui);
    expect(html).toContain('No usage source found on this machine.');
    expect(html).toContain('Not configured');
    expect(html).toContain('Set up');
    expect(html).not.toContain('data-sample-badge');
    if (ui === 'glados') expect(html).toContain('data-g="GEmpty"');
    else expect(html).not.toContain('data-g=');
  });

  test.each(['glados', 'classic'] as const)('%s: sample renders every card with the badge', async (ui) => {
    emptyDirs();
    const html = await render({ sample: '1' }, ui);
    for (const t of ['Token burn', 'Burn by model', 'Plan limits', 'Claude', 'ChatGPT / Codex', 'Ollama', NOT_REPORTED, NO_GAUGE, 'Burn = input + output + cache writes.'])
      expect(html, t).toContain(t);
    expect(html).toContain('data-sample-badge');
    expect(html).not.toMatch(/% of limit/);
  });

  test.each(['glados', 'classic'] as const)('%s: demo mode shows the sample with the Sample badge', async (ui) => {
    vi.stubEnv('DEMO_MODE', '1');
    const html = await render({}, ui);
    expect(html).not.toContain('Usage is not available on this instance.');
    expect(html).toContain('Token burn');
    expect(html).toContain('data-sample-badge');
  });

  test('the first transcript scan is warmed at boot, never on a demo or filming instance (U-4, U-1)', async () => {
    const { warmTasks } = await import('@/lib/warm');
    vi.stubEnv('DEMO_MODE', '0');
    expect(warmTasks().map((t) => t.name)).toContain('usage');
    vi.stubEnv('DEMO_MODE', '1');
    expect(warmTasks().map((t) => t.name)).not.toContain('usage');
  });

  test('route is in the nav after Connections and in G_READY with its tree file', () => {
    expect(NAV_ORDER.indexOf('/usage')).toBe(NAV_ORDER.indexOf('/integrations') + 1);
    expect(G_READY).toContain('/usage');
    expect(G_TREE_FILES['/usage']).toEqual(['components/usage/UsageG.tsx']);
  });

  test('no raw hex and no emojis in the usage files', () => {
    for (const f of ['components/usage/UsageG.tsx', 'components/usage/UsageClassic.tsx', 'components/usage/use-usage.ts', 'lib/usage-view.ts', 'app/usage/page.tsx']) {
      const src = readFileSync(path.join(process.cwd(), f), 'utf8');
      expect(src, f).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(src, f).not.toMatch(/\p{Extended_Pictographic}/u);
    }
    const css = readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8');
    const block = css.slice(css.indexOf('/* ── FounderOS merge · /usage'), css.indexOf('/* ── end /usage ── */'));
    expect(block.length).toBeGreaterThan(100);
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
