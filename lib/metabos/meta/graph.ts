/** One Graph API version for every Meta call (OAuth, discovery, sends).
 *  v25.0 (released 18 Feb 2026, available until 29 Jul 2028 per Meta's versions table, checked 2 Nov 2026).
 *  The earlier OAuth code used v19.0, which expired on 21 May 2026. Override with MUZEBOS_GRAPH_VERSION (e.g. v26.0). */
const v = process.env.MUZEBOS_GRAPH_VERSION?.trim();
export const GRAPH_VERSION = v && /^v\d{2}\.0$/.test(v) ? v : 'v25.0';
/** Channels that call a Meta API. Dry run applies to these. */
export const META_CHANNELS = ['whatsapp', 'instagram', 'messenger', 'page-post', 'ig-publish'] as const;
export const isMetaChannel = (c: string) => (META_CHANNELS as readonly string[]).includes(c);
/** DRY_RUN is ON unless MUZEBOS_META_DRY_RUN is exactly "0" (same default as MeTaPen). */
export const metaDryRun = (env: Record<string, string | undefined>) => env.MUZEBOS_META_DRY_RUN?.trim() !== '0';
