/** Pure helpers adapted from the owner's AI Studio app (src/utils/pureLogic.ts, owner-made). They work on real records only.
 *  Differences from the original: no '3.8x' fallback (ROAS is null without insights), money is in integer minor units,
 *  and there is no local approve/send, because approval lives in Jev and sending in /api/dispatch. */
export type Activity = { seq: number; kind: string; action: string; target?: string; detail: string; hash: string };
export function filterActivities<T extends Activity>(list: T[], kind: string, query: string): T[] {
  const q = query.toLowerCase().trim();
  return list.filter((a) => (kind === 'ALL' || a.kind === kind) && (!q || [a.action, a.detail, a.target ?? '', a.hash].some((x) => x.toLowerCase().includes(q))));
}
export type AdLike = { dailyBudgetMinor: number; roas: number | null; status?: string };
export function roasMetrics(ads: AdLike[]) {
  const withRoas = ads.filter((a) => typeof a.roas === 'number' && a.roas > 0) as (AdLike & { roas: number })[];
  return {
    plannedDailyMinor: ads.reduce((n, a) => n + a.dailyBudgetMinor, 0),
    drafts: ads.length,
    shipped: ads.filter((a) => a.status === 'SHIPPED').length,
    averageRoas: withRoas.length ? Math.round((withRoas.reduce((n, a) => n + a.roas, 0) / withRoas.length) * 100) / 100 : null,
  };
}
/** Sparring (Arena): pick a winner and produce the commit message. The commit itself still goes through Jev. */
export function sparringCommitMessage(topic: string, winner: string) { return `feat(copy): adopt ${winner} winning hook for ${topic}`.slice(0, 200); }
export const PRODUCT_TITLE = 'MuZe — Meta AI Business Operating Server';
