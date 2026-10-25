/**
 * Content Lab v2 server rendering (01 D1): each route builds only its own page model and forks to the
 * GladOS, Classic or Bennett Legacy tree through treeFor (founderos-ui SPEC 2.5). Under Legacy the Lab
 * renders its own Legacy tree (components/lab/v2/legacy, pages/lab.md, L_READY) from the same page model
 * (LB-1); LabRoot drops the Aurora and the LO.5 block in app/globals.css re-keys the shared Lab tokens.
 * Private folder file (`_render`), not a route.
 */
import { getAppearance } from '@/lib/appearance-server';
import { treeFor } from '@/lib/appearance';
import { labParamsFrom, resolveLab } from '@/lib/lab/context';
import { buildPageView } from '@/lib/lab/view/build';
import type { LabPage } from '@/lib/lab/view/shared';
import * as G from '@/components/lab/v2/g';
import * as C from '@/components/lab/v2/classic';
import * as L from '@/components/lab/v2/legacy';

export type SearchParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

/** 01 2.4: v1 `?tab=` -> the v2 route, every other param kept (family -> format). Null when no tab. */
export function legacyRedirect(sp: SearchParams): string | null {
  const tab = first(sp.tab);
  if (tab === null) return null;
  const to: Record<string, string> = { today: '/lab', breakouts: '/lab/breakouts', profile: '/lab/playbook', trends: '/lab/radar', ideas: '/lab/studio', scripts: '/lab/studio', sources: '/lab', creatorverse: '/lab/creatorverse', network: '/lab/creatorverse' };
  const path = to[tab] ?? '/lab';
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === 'tab' || v === undefined) continue;
    const val = first(v);
    if (val === null) continue;
    q.set(k === 'family' && tab === 'profile' ? 'format' : k, val);
  }
  if (tab === 'sources') q.set('setup', 'sources');
  const s = q.toString();
  return `${path}${s ? `?${s}` : ''}`;
}

export async function renderLab(page: LabPage, sp: SearchParams) {
  const params = labParamsFrom(sp);
  const ctx = resolveLab({ sample: params.sample, scenario: first(sp.scenario) });
  const view = await buildPageView(page, ctx.store, params, ctx.flags, new Date(), { prefillPost: params.sheet?.kind === 'test' ? first(sp.post) : null });
  const tree = treeFor(getAppearance(), '/lab');
  const T = tree === 'glados' ? G : tree === 'legacy' ? L : C;
  switch (page) {
    case 'today': return <T.TodayPage view={view as Awaited<ReturnType<typeof buildPageView<'today'>>>} />;
    case 'radar': return <T.RadarPage view={view as Awaited<ReturnType<typeof buildPageView<'radar'>>>} />;
    case 'breakouts': return <T.BreakoutsPage view={view as Awaited<ReturnType<typeof buildPageView<'breakouts'>>>} />;
    case 'playbook': return <T.PlaybookPage view={view as Awaited<ReturnType<typeof buildPageView<'playbook'>>>} />;
    case 'studio': return <T.StudioPage view={view as Awaited<ReturnType<typeof buildPageView<'studio'>>>} />;
    case 'ledger': return <T.LedgerPage view={view as Awaited<ReturnType<typeof buildPageView<'ledger'>>>} />;
    case 'creatorverse': return <T.CreatorversePage view={view as Awaited<ReturnType<typeof buildPageView<'creatorverse'>>>} />;
  }
}
