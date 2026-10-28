# Mock / sample / placeholder audit

Generated on 2026-10-28 for branch `feat/real-backend-audit`. Search used:

```
rg -n -i "mock|fixture|sample|placeholder|demo|Math.random|TODO|setTimeout" app components lib scripts
```

There were 807 raw hits. The table below also lists the 8 targeted findings from a manual pass over `components/metabos`, `app/workspace`, `lib/metabos` and the provider testers.

## Fixed in this PR

| # | File:line | Finding | Resolution |
|---|---|---|---|
| 1 | components/metabos/StudioPorts.tsx (MissionWidgets budget) | Hardcoded `/ 50 attempts` and `/ 65,536 tokens` | Reads `budget.limits` from `mb_inference_limits` (SQLite) via GET /api/inference. An owner-only `setLimits` action (403 for other roles) records evidence `inference.limits`. `claim()` enforces the stored limits |
| 2 | app/api/inference/route.ts POST | New spend-limit write needed a role check | `setLimits` requires a signed-in owner: 401 if not signed in, 403 for other roles. Other actions keep the existing operator/loopback gate |
| 3 | lib/metabos/providers.ts:68 | Meta Graph `v19.0`, which expired on 2026-05-21 per the Meta version table | `v25.0` (available until 2028-07-29) |
| 4 | lib/connectors/whatsapp-send.ts:22 | Graph `v21.0`, which expires 2027-01-21 | `v25.0` |
| 5 | lib/metabos/providers.ts:57 | "Not configured: set X" | "Not connected — add X" (names the env vars that are missing, never their values) |
| 6 | app/layout.tsx | Filming/demo data could look like real data | A global `role=status` banner, "Demo data: filming mode is on", appears whenever `filmingMode()` is on |
| 7 | components/metabos/FeatureStub.tsx | Existing screens said "not implemented yet" | Now says "Existing screen", shows a link to the real route and lists its reviewed `backing` (see docs/PROVIDER-ENV.md) |
| 8 | components/metabos/MemoryBoard.tsx:10 | Default session id `demo` | `session-1` |

## Raw hits by resolution

| Resolution | Count |
|---|---|
| False positive: comment/doc text, no runtime value | 256 |
| Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope | 231 |
| Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner | 175 |
| Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge | 74 |
| Kept: dev-only design kit gallery (/dev), not business data | 44 |
| False positive: "todo" is a real reminders/tasks feature name | 25 |
| Reviewed: id/jitter generation, not a displayed status | 2 |

None of the raw hits shows mock data in default (real) mode. Every fixture path is gated by `DEMO_MODE=1` or the Settings filming toggle, by `LAB_DRY=1`, or by an explicit `?sample=1` on a blank install with a Sample badge.

## Seed scripts (opt-in only)

- `npm run seed` (`scripts/seed.ts`): structural rows only (pillars and the agent roster). No people, money or tasks.
- `npm run seed:demo-story` (`scripts/seed-demo-story.ts`): writes to a separate `data/metabos-demo.sqlite` unless `MUZEBOS_DB` is set. Every record is marked: names end in "(demo)", SKUs start with `DEMO-`, and evidence `demo.seeded` is recorded.
- The app never runs either script on its own.

## Remaining (not changed) and why

- Lab and Creative Engine dry fixtures: separate subsystems, opt-in, and outside the MeTaBos business OS scope.
- `/dev` design kit gallery: developer-only.
- Filming mode stand-ins (`lib/demo-mode.ts`, `lib/finance-demo.ts`, `lib/demo/*`): required for recording. Off by default and now shown by a banner.
- Overdue reminder "fixture" draft (`lib/metabos/overdue-core.ts`): a deterministic template used when no model key is set. It is labelled `mode: fixture` in the UI and still goes through Jev approval.

## Appendix: every raw hit

| File:line | Resolution |
|---|---|
| `app/funnel/page.tsx:115` | False positive: comment/doc text, no runtime value |
| `app/funnel/page.tsx:118` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/funnel/page.tsx:120` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `app/funnel/page.tsx:121` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `components/funnel/FunnelChannels.tsx:34` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `components/funnel/sample.ts:5` | False positive: comment/doc text, no runtime value |
| `components/funnel/sample.ts:65` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/dev/l-kit/LegacyKitSpecimen.tsx:30` | False positive: comment/doc text, no runtime value |
| `app/dev/l-kit/LegacyKitSpecimen.tsx:167` | Kept: dev-only design kit gallery (/dev), not business data |
| `components/funnel/FunnelLinksG.tsx:100` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `components/funnel/FunnelLinks.tsx:86` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `components/funnel/FunnelChannelsG.tsx:51` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `app/dev/g-kit/KitGallery.tsx:56` | False positive: comment/doc text, no runtime value |
| `app/dev/g-kit/KitGallery.tsx:170` | Kept: dev-only design kit gallery (/dev), not business data |
| `app/dev/g-kit/KitGallery.tsx:206` | Kept: dev-only design kit gallery (/dev), not business data |
| `app/dev/g-kit/KitGallery.tsx:208` | Kept: dev-only design kit gallery (/dev), not business data |
| `app/dev/g-kit/KitGallery.tsx:273` | Kept: dev-only design kit gallery (/dev), not business data |
| `app/dev/g-kit/KitGallery.tsx:274` | Kept: dev-only design kit gallery (/dev), not business data |
| `app/dev/g-kit/KitGallery.tsx:275` | Kept: dev-only design kit gallery (/dev), not business data |
| `app/dev/g-kit/KitGallery.tsx:276` | Kept: dev-only design kit gallery (/dev), not business data |
| `app/dev/g-kit/KitGallery.tsx:277` | Kept: dev-only design kit gallery (/dev), not business data |
| `app/dev/g-kit/KitGallery.tsx:278` | Kept: dev-only design kit gallery (/dev), not business data |
| `app/dev/g-kit/KitGallery.tsx:279` | Kept: dev-only design kit gallery (/dev), not business data |
| `app/dev/g-kit/KitGallery.tsx:280` | Kept: dev-only design kit gallery (/dev), not business data |
| `app/dev/g-kit/KitGallery.tsx:281` | Kept: dev-only design kit gallery (/dev), not business data |
| `app/dev/g-kit/KitGallery.tsx:301` | Kept: dev-only design kit gallery (/dev), not business data |
| `app/dev/g-kit/KitGallery.tsx:308` | Kept: dev-only design kit gallery (/dev), not business data |
| `app/dev/g-kit/KitGallery.tsx:311` | Kept: dev-only design kit gallery (/dev), not business data |
| `app/dev/g-kit/KitGallery.tsx:338` | Kept: dev-only design kit gallery (/dev), not business data |
| `app/dev/g-kit/KitGallery.tsx:373` | Kept: dev-only design kit gallery (/dev), not business data |
| `app/dev/g-kit/KitGallery.tsx:395` | Kept: dev-only design kit gallery (/dev), not business data |
| `app/dev/g-kit/KitGallery.tsx:397` | Kept: dev-only design kit gallery (/dev), not business data |
| `app/dev/g-kit/KitGallery.tsx:413` | Kept: dev-only design kit gallery (/dev), not business data |
| `app/dev/g-kit/KitGallery.tsx:425` | Kept: dev-only design kit gallery (/dev), not business data |
| `app/dev/g-kit/KitGallery.tsx:437` | Kept: dev-only design kit gallery (/dev), not business data |
| `app/dev/g-kit/KitGallery.tsx:439` | Kept: dev-only design kit gallery (/dev), not business data |
| `app/dev/g-kit/KitGallery.tsx:447` | Kept: dev-only design kit gallery (/dev), not business data |
| `app/dev/g-kit/KitGallery.tsx:455` | Kept: dev-only design kit gallery (/dev), not business data |
| `app/dev/g-kit/KitGallery.tsx:470` | Kept: dev-only design kit gallery (/dev), not business data |
| `app/dev/g-kit/KitGallery.tsx:473` | Kept: dev-only design kit gallery (/dev), not business data |
| `app/dev/g-kit/KitGallery.tsx:478` | Kept: dev-only design kit gallery (/dev), not business data |
| `app/dev/g-kit/KitGallery.tsx:485` | Kept: dev-only design kit gallery (/dev), not business data |
| `app/dev/g-kit/KitGallery.tsx:486` | Kept: dev-only design kit gallery (/dev), not business data |
| `app/dev/g-kit/KitGallery.tsx:487` | Kept: dev-only design kit gallery (/dev), not business data |
| `app/dev/g-kit/KitGallery.tsx:490` | Kept: dev-only design kit gallery (/dev), not business data |
| `app/dev/g-kit/KitGallery.tsx:521` | Kept: dev-only design kit gallery (/dev), not business data |
| `app/dev/g-kit/KitGallery.tsx:533` | Kept: dev-only design kit gallery (/dev), not business data |
| `app/dev/g-kit/KitGallery.tsx:534` | Kept: dev-only design kit gallery (/dev), not business data |
| `app/dev/g-kit/KitGallery.tsx:538` | Kept: dev-only design kit gallery (/dev), not business data |
| `app/dev/g-kit/KitGallery.tsx:547` | Kept: dev-only design kit gallery (/dev), not business data |
| `app/dev/g-kit/KitGallery.tsx:552` | Kept: dev-only design kit gallery (/dev), not business data |
| `app/dev/g-kit/KitGallery.tsx:565` | Kept: dev-only design kit gallery (/dev), not business data |
| `app/dev/g-kit/KitGallery.tsx:594` | Kept: dev-only design kit gallery (/dev), not business data |
| `app/dev/g-kit/KitGallery.tsx:602` | Kept: dev-only design kit gallery (/dev), not business data |
| `components/funnel/FunnelDashboard.tsx:1615` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `components/funnel/FunnelDashboard.tsx:1626` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `components/funnel/FunnelDashboard.tsx:1631` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `app/workflows/tree.ts:17` | False positive: comment/doc text, no runtime value |
| `components/funnel/FunnelDashboardG.tsx:448` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `components/funnel/FunnelDashboardG.tsx:552` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `components/funnel/FunnelDashboardG.tsx:555` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `components/funnel/FunnelDashboardG.tsx:556` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `lib/demo-mode.ts:8` | False positive: comment/doc text, no runtime value |
| `lib/demo-mode.ts:9` | False positive: comment/doc text, no runtime value |
| `lib/demo-mode.ts:37` | False positive: comment/doc text, no runtime value |
| `lib/demo-mode.ts:42` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/demo-mode.ts:54` | False positive: comment/doc text, no runtime value |
| `lib/demo-mode.ts:60` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/demo-mode.ts:75` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/demo-mode.ts:85` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/demo-mode.ts:90` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/demo-mode.ts:91` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/demo-mode.ts:136` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/demo-mode.ts:171` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/demo-mode.ts:192` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/demo-mode.ts:197` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/demo-mode.ts:198` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/demo-mode.ts:204` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/demo-mode.ts:261` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/demo-mode.ts:280` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/demo-mode.ts:310` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/demo-mode.ts:311` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/creative-engine/page.tsx:7` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/wizard/page.tsx:7` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/api/trading/route.ts:12` | False positive: comment/doc text, no runtime value |
| `components/trading/TradingClassic.tsx:71` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `components/trading/TradingClassic.tsx:72` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `app/api/workflows/draft/logic.ts:65` | False positive: comment/doc text, no runtime value |
| `app/setup/page.tsx:33` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/setup/page.tsx:69` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/setup/page.tsx:137` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/setup/page.tsx:142` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/schemas.ts:704` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/schemas.ts:706` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/schemas.ts:1175` | False positive: comment/doc text, no runtime value |
| `lib/schemas.ts:1201` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `lib/schemas.ts:1202` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `lib/schemas.ts:1349` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `lib/schemas.ts:1385` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `lib/schemas.ts:1540` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `app/lead-magnets/page.tsx:20` | False positive: comment/doc text, no runtime value |
| `components/trading/TradingLegacy.tsx:63` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `app/inbox/page.tsx:15` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/inbox/page.tsx:37` | False positive: comment/doc text, no runtime value |
| `app/inbox/page.tsx:40` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/inbox/page.tsx:41` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `components/trading/TradingG.tsx:44` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `lib/funnel-viz.ts:4` | False positive: comment/doc text, no runtime value |
| `lib/social-status.ts:42` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/connectors/zernio.ts:6` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/connectors/zernio.ts:175` | False positive: comment/doc text, no runtime value |
| `lib/connectors/zernio.ts:176` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/nav.ts:133` | False positive: "todo" is a real reminders/tasks feature name |
| `app/social/page.tsx:25` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/social/page.tsx:110` | False positive: comment/doc text, no runtime value |
| `app/social/page.tsx:138` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/content-schema.ts:132` | False positive: comment/doc text, no runtime value |
| `lib/brand-deal-rules.ts:27` | False positive: comment/doc text, no runtime value |
| `lib/brand-deal-rules.ts:30` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/brand-deal-rules.ts:31` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/connectors/slack.ts:3` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/connectors/slack.ts:14` | False positive: comment/doc text, no runtime value |
| `lib/connectors/slack.ts:15` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/funnel-live.ts:262` | False positive: comment/doc text, no runtime value |
| `app/clients/page.tsx:18` | False positive: comment/doc text, no runtime value |
| `lib/connectors/wispr.ts:11` | False positive: comment/doc text, no runtime value |
| `lib/connectors/wispr.ts:36` | False positive: "todo" is a real reminders/tasks feature name |
| `lib/connectors/wispr.ts:45` | False positive: "todo" is a real reminders/tasks feature name |
| `lib/connectors/wispr.ts:46` | False positive: "todo" is a real reminders/tasks feature name |
| `lib/connectors/apify.ts:74` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `app/finances/Spending.tsx:54` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `app/api/usage/route.ts:10` | False positive: comment/doc text, no runtime value |
| `app/api/settings/filming/route.ts:13` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/api/settings/filming/route.ts:36` | False positive: comment/doc text, no runtime value |
| `app/api/settings/filming/route.ts:52` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/finances/SpendingG.tsx:56` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `lib/ventures-store.ts:8` | False positive: comment/doc text, no runtime value |
| `lib/connectors/gcal.ts:3` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/connectors/gcal.ts:264` | False positive: comment/doc text, no runtime value |
| `lib/connectors/gcal.ts:265` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/finances/page.tsx:12` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/finances/page.tsx:15` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/finances/page.tsx:16` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/finances/page.tsx:17` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/finances/page.tsx:18` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/finances/page.tsx:19` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/finances/page.tsx:20` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/finances/page.tsx:21` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/finances/page.tsx:22` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/finances/page.tsx:23` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/finances/page.tsx:24` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/finances/page.tsx:65` | False positive: comment/doc text, no runtime value |
| `app/finances/page.tsx:70` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/finances/page.tsx:71` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/finances/page.tsx:72` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/finances/page.tsx:74` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/finances/page.tsx:76` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/finances/page.tsx:79` | False positive: comment/doc text, no runtime value |
| `app/finances/page.tsx:95` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/finances/page.tsx:112` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/finances/page.tsx:118` | False positive: comment/doc text, no runtime value |
| `app/finances/page.tsx:122` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/finances/page.tsx:125` | False positive: comment/doc text, no runtime value |
| `app/finances/page.tsx:127` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/finances/page.tsx:128` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `app/finances/page.tsx:137` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/paths.ts:7` | False positive: comment/doc text, no runtime value |
| `lib/paths.ts:15` | False positive: comment/doc text, no runtime value |
| `lib/paths.ts:18` | False positive: comment/doc text, no runtime value |
| `lib/paths.ts:19` | False positive: comment/doc text, no runtime value |
| `lib/paths.ts:24` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/paths.ts:37` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/paths.ts:38` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/paths.ts:89` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `components/knowledge/DriftRail.tsx:54` | False positive: comment/doc text, no runtime value |
| `components/knowledge/DriftRail.tsx:55` | False positive: comment/doc text, no runtime value |
| `components/knowledge/DriftRail.tsx:237` | False positive: comment/doc text, no runtime value |
| `lib/gbrain-observatory.ts:18` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/gbrain-observatory.ts:221` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/connectors/index.ts:31` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/connectors/index.ts:98` | False positive: comment/doc text, no runtime value |
| `lib/connectors/index.ts:99` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/compute/miosa.ts:70` | False positive: comment/doc text, no runtime value |
| `lib/compute/miosa.ts:119` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/connectors/gbrain.ts:45` | False positive: comment/doc text, no runtime value |
| `app/usage/page.tsx:14` | False positive: comment/doc text, no runtime value |
| `components/setup/SetupControlsG.tsx:71` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `components/setup/SetupControlsG.tsx:81` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/connectors/email.ts:4` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/connectors/email.ts:169` | False positive: comment/doc text, no runtime value |
| `lib/connectors/email.ts:170` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `components/lead-magnets/LeadMagnetsLegacy.tsx:49` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `components/lead-magnets/LeadMagnetsLegacy.tsx:82` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/lab/scripts.ts:129` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/scripts.ts:176` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/scripts.ts:335` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/scripts.ts:358` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/lead-magnets/LeadMagnetsG.tsx:31` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `components/lead-magnets/LeadMagnetsG.tsx:122` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/lab/pipeline.ts:19` | False positive: comment/doc text, no runtime value |
| `lib/chats-view.ts:10` | False positive: comment/doc text, no runtime value |
| `lib/chats-view.ts:102` | False positive: comment/doc text, no runtime value |
| `lib/chats-view.ts:104` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/chats-view.ts:105` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `components/lead-magnets/LeadMagnetsClassic.tsx:29` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `components/lead-magnets/LeadMagnetsClassic.tsx:44` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/api/content/refine-prompt/logic.ts:38` | False positive: comment/doc text, no runtime value |
| `components/SetupFilming.tsx:13` | False positive: comment/doc text, no runtime value |
| `components/SetupFilming.tsx:60` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `components/SetupFilming.tsx:77` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/api/clients/route.ts:12` | False positive: comment/doc text, no runtime value |
| `lib/interject.ts:7` | False positive: comment/doc text, no runtime value |
| `lib/interject.ts:52` | False positive: "todo" is a real reminders/tasks feature name |
| `lib/interject.ts:53` | False positive: "todo" is a real reminders/tasks feature name |
| `lib/lab/ledger/view.ts:303` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/ledger/view.ts:304` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/ledger/view.ts:308` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/ledger/view.ts:324` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/demo/company.ts:9` | False positive: comment/doc text, no runtime value |
| `lib/demo/company.ts:10` | False positive: comment/doc text, no runtime value |
| `lib/demo/company.ts:15` | False positive: comment/doc text, no runtime value |
| `lib/demo/company.ts:127` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/lab/ledger/fixtures.ts:2` | False positive: comment/doc text, no runtime value |
| `lib/lab/ledger/fixtures.ts:10` | False positive: comment/doc text, no runtime value |
| `lib/lab/ledger/fixtures.ts:11` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/ledger/fixtures.ts:21` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/ledger/fixtures.ts:28` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/demo/store.ts:5` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/demo/store.ts:7` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/demo/store.ts:11` | False positive: comment/doc text, no runtime value |
| `lib/demo/store.ts:13` | False positive: comment/doc text, no runtime value |
| `lib/demo/store.ts:14` | False positive: comment/doc text, no runtime value |
| `lib/demo/store.ts:15` | False positive: comment/doc text, no runtime value |
| `lib/demo/store.ts:18` | False positive: comment/doc text, no runtime value |
| `lib/demo/store.ts:20` | False positive: comment/doc text, no runtime value |
| `lib/demo/store.ts:31` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/demo/store.ts:62` | False positive: comment/doc text, no runtime value |
| `lib/demo/store.ts:63` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/demo/store.ts:69` | False positive: comment/doc text, no runtime value |
| `lib/demo/store.ts:70` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/demo/store.ts:71` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/demo/store.ts:81` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/demo/store.ts:94` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/demo/store.ts:99` | False positive: comment/doc text, no runtime value |
| `lib/demo/store.ts:100` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/demo/store.ts:101` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/lab-frames/[state]/FrameToday.tsx:46` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `app/lab-frames/[state]/FrameToday.tsx:126` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `app/lab-frames/[state]/FrameComponents.tsx:44` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `app/lab-frames/[state]/FrameComponents.tsx:101` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `app/api/mission-control/route.ts:23` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/api/mission-control/route.ts:24` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/api/mission-control/route.ts:26` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/api/mission-control/route.ts:27` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `components/social/SocialG.tsx:241` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/lab/ledger/retention/due.ts:4` | False positive: comment/doc text, no runtime value |
| `lib/lab/ledger/retention/due.ts:12` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/ledger/retention/due.ts:129` | False positive: comment/doc text, no runtime value |
| `lib/lab/ledger/retention/due.ts:137` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/demo/seed-v1.ts:32` | False positive: comment/doc text, no runtime value |
| `lib/demo/seed-v1.ts:68` | False positive: comment/doc text, no runtime value |
| `lib/demo/seed-v1.ts:507` | False positive: comment/doc text, no runtime value |
| `lib/demo/seed-v1.ts:1099` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/demo/seed-v1.ts:1131` | False positive: comment/doc text, no runtime value |
| `lib/demo/seed-v1.ts:1169` | False positive: comment/doc text, no runtime value |
| `lib/demo/seed-v1.ts:1189` | False positive: comment/doc text, no runtime value |
| `lib/demo/seed-v1.ts:1290` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/demo/seed-v1.ts:1292` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/demo/seed-v1.ts:1375` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/demo/seed-v1.ts:1424` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/demo/seed-v1.ts:1433` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/demo/seed-v1.ts:1535` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/demo/seed-v1.ts:1542` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/demo/seed-v1.ts:1664` | False positive: comment/doc text, no runtime value |
| `lib/demo/seed-v1.ts:1725` | False positive: comment/doc text, no runtime value |
| `lib/demo/seed-v1.ts:1744` | False positive: comment/doc text, no runtime value |
| `lib/demo/seed-v1.ts:1810` | False positive: comment/doc text, no runtime value |
| `lib/demo/seed-v1.ts:1928` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/demo/brain.ts:7` | False positive: comment/doc text, no runtime value |
| `lib/demo/brain.ts:8` | False positive: comment/doc text, no runtime value |
| `lib/demo/brain.ts:9` | False positive: comment/doc text, no runtime value |
| `lib/demo/brain.ts:10` | False positive: comment/doc text, no runtime value |
| `lib/demo/brain.ts:13` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/demo/brain.ts:210` | False positive: comment/doc text, no runtime value |
| `lib/demo/brain.ts:241` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/api/metabos/overdue/route.ts:21` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `lib/trading-payload.ts:6` | False positive: comment/doc text, no runtime value |
| `lib/trading-payload.ts:20` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `lib/lab/setup/view.ts:283` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/setup/view.ts:334` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/setup/view.ts:362` | False positive: comment/doc text, no runtime value |
| `components/comms-fo/CommsFoClassic.tsx:33` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `components/comms-fo/CommsFoClassic.tsx:35` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `components/comms-fo/CommsFoClassic.tsx:80` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `components/comms-fo/CommsFoClassic.tsx:168` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `components/comms-fo/CommsFoClassic.tsx:245` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `components/comms-fo/CommsFoClassic.tsx:305` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `components/legacy/States.tsx:88` | False positive: comment/doc text, no runtime value |
| `components/comms-fo/hooks.ts:24` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `lib/content-campaigns.ts:99` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/content-campaigns.ts:111` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `components/comms-fo/CommsFoG.tsx:71` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `components/comms-fo/CommsFoG.tsx:182` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `components/comms-fo/CommsFoG.tsx:287` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `components/comms-fo/CommsFoG.tsx:347` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `app/api/lab/run/route.ts:54` | False positive: comment/doc text, no runtime value |
| `app/api/lab/run/route.ts:55` | False positive: comment/doc text, no runtime value |
| `lib/lab/setup/checklist.ts:16` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/setup/checklist.ts:79` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/setup/instance.ts:7` | False positive: comment/doc text, no runtime value |
| `lib/lab/setup/instance.ts:15` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/setup/agent.ts:5` | False positive: comment/doc text, no runtime value |
| `lib/lab/setup/agent.ts:23` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/setup/agent.ts:26` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/tasks-metrics.ts:409` | False positive: "todo" is a real reminders/tasks feature name |
| `app/api/lab/verify-actors/route.ts:18` | False positive: comment/doc text, no runtime value |
| `components/usage/UsageG.tsx:362` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `components/adpilot/AdPilotDeck.tsx:295` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `components/adpilot/projection.ts:5` | False positive: comment/doc text, no runtime value |
| `lib/trading-model.ts:129` | False positive: comment/doc text, no runtime value |
| `lib/trading-model.ts:130` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `lib/trading-model.ts:272` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `lib/trading-model.ts:273` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `components/usage/UsageClassic.tsx:347` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `app/api/creative-engine/arcads/presets/route.ts:15` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/usage/UsageLegacy.tsx:235` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `components/adpilot/Globe.tsx:3` | False positive: comment/doc text, no runtime value |
| `lib/lab/setup/progress.ts:318` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/KnowledgeGraphFullscreen.tsx:77` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `components/clients/ClientsLegacy.tsx:51` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `components/clients/ClientsLegacy.tsx:85` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `components/clients/ClientsLegacy.tsx:370` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `components/clients/ClientsLegacy.tsx:422` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `lib/lab/view/frame.ts:95` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/view/frame.ts:112` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/clients/ClientsClassic.tsx:34` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `components/clients/ClientsClassic.tsx:58` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `components/clients/ClientsClassic.tsx:197` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `components/clients/ClientsClassic.tsx:312` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `components/clients/ClientsClassic.tsx:348` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `lib/lab/view/classic-copy.ts:11` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/view/classic-copy.ts:15` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/view/classic-copy.ts:25` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/view/classic-copy.ts:303` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/clients/ClientsG.tsx:35` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `components/clients/ClientsG.tsx:56` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `components/clients/ClientsG.tsx:91` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `components/clients/ClientsG.tsx:401` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `components/clients/ClientsG.tsx:444` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `lib/social.ts:235` | False positive: comment/doc text, no runtime value |
| `components/content/PipelineBuilder.tsx:66` | Reviewed: id/jitter generation, not a displayed status |
| `components/FinancePipelineStrip.tsx:18` | False positive: comment/doc text, no runtime value |
| `components/creative-engine/CreativeGenerator.tsx:123` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/creative-engine/CreativeGenerator.tsx:242` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/creative-engine/CreativeGenerator.tsx:267` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/knowledge-g.ts:65` | False positive: comment/doc text, no runtime value |
| `lib/lab/view/legacy.ts:61` | False positive: comment/doc text, no runtime value |
| `lib/lab/view/legacy.ts:94` | False positive: comment/doc text, no runtime value |
| `lib/lab/view/legacy.ts:96` | False positive: comment/doc text, no runtime value |
| `lib/lab/view/legacy.ts:100` | False positive: comment/doc text, no runtime value |
| `lib/lab/view/legacy.ts:105` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/view/legacy.ts:123` | False positive: comment/doc text, no runtime value |
| `lib/lab/view/legacy.ts:466` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/view/legacy.ts:1039` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/Home6Console.tsx:35` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `components/Home6Console.tsx:37` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `components/Home6Console.tsx:288` | False positive: comment/doc text, no runtime value |
| `components/Home6Console.tsx:291` | False positive: comment/doc text, no runtime value |
| `components/Home6Console.tsx:309` | False positive: comment/doc text, no runtime value |
| `components/Home6Console.tsx:310` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `components/Home6Console.tsx:312` | False positive: comment/doc text, no runtime value |
| `lib/lab/view/copy.ts:7` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/view/copy.ts:63` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/view/copy.ts:67` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/view/copy.ts:327` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/comms-digest.ts:97` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `components/creative-engine/ConnectArcads.tsx:14` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/creative-engine/ConnectArcads.tsx:142` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/creative-engine/ConnectArcads.tsx:155` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/creative-engine/ConnectArcads.tsx:156` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/creative-engine/MotionConsole.tsx:71` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/creative-engine/MotionConsole.tsx:345` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/creative-engine/MotionConsole.tsx:346` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/creative-engine/MotionConsole.tsx:348` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/creative-engine/MotionConsole.tsx:349` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/creative-engine/MotionConsole.tsx:646` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `app/api/lab/frames/route.ts:6` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `app/api/lab/frames/route.ts:13` | False positive: comment/doc text, no runtime value |
| `app/api/lab/frames/route.ts:14` | False positive: comment/doc text, no runtime value |
| `app/api/lab/frames/route.ts:26` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `app/api/lab/frames/route.ts:27` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `app/api/lab/frames/route.ts:28` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/creative-engine/CampaignSwitcher.tsx:33` | False positive: comment/doc text, no runtime value |
| `components/creative-engine/CampaignSwitcher.tsx:85` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/creative-engine/CampaignSwitcher.tsx:106` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/creative-engine/Drawers.tsx:18` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/view/ui-copy.ts:39` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/view/ui-copy.ts:129` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/creative-engine/Scripter.tsx:130` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/creative-engine/Scripter.tsx:151` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/creative-engine/Scripter.tsx:162` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/creative-engine/Scripter.tsx:165` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/creative-engine/Scripter.tsx:166` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/creative-engine/Scripter.tsx:168` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/creative-engine/Scripter.tsx:187` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/tasks/Board.tsx:6` | False positive: "todo" is a real reminders/tasks feature name |
| `components/tasks/Board.tsx:63` | False positive: "todo" is a real reminders/tasks feature name |
| `components/tasks/Board.tsx:172` | False positive: "todo" is a real reminders/tasks feature name |
| `components/tasks/Board.tsx:173` | False positive: "todo" is a real reminders/tasks feature name |
| `lib/lab/view/today.ts:144` | False positive: comment/doc text, no runtime value |
| `lib/lab/view/today.ts:370` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/creative-engine/Dashboard.tsx:312` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/creative-engine/Dashboard.tsx:485` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/creative-engine/Dashboard.tsx:507` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/creative-engine/Dashboard.tsx:625` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/creative-engine/Dashboard.tsx:714` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/content-examples.ts:45` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `components/creative-engine/Briefings.tsx:41` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/tasks/TasksG.tsx:41` | False positive: "todo" is a real reminders/tasks feature name |
| `components/tasks/TasksG.tsx:285` | False positive: "todo" is a real reminders/tasks feature name |
| `components/tasks/TasksG.tsx:337` | False positive: "todo" is a real reminders/tasks feature name |
| `components/tasks/TasksG.tsx:356` | False positive: "todo" is a real reminders/tasks feature name |
| `components/creative-engine/UgcStudio.tsx:157` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/usage-guard.ts:6` | False positive: comment/doc text, no runtime value |
| `lib/usage-guard.ts:8` | False positive: comment/doc text, no runtime value |
| `lib/usage-guard.ts:9` | False positive: comment/doc text, no runtime value |
| `lib/usage-guard.ts:11` | False positive: comment/doc text, no runtime value |
| `lib/usage-guard.ts:19` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/usage-guard.ts:32` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/usage-guard.ts:33` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/usage-guard.ts:34` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/usage-guard.ts:37` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/lab/dry-items.ts:4` | False positive: comment/doc text, no runtime value |
| `lib/lab/dry-items.ts:12` | False positive: comment/doc text, no runtime value |
| `lib/lab/dry-items.ts:72` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/dry-items.ts:88` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/dry-items.ts:169` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/dry-items.ts:193` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/dry-items.ts:198` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/dry-items.ts:199` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/dry-items.ts:233` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/creative-engine/WorkflowCanvas.tsx:14` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/measures.ts:295` | False positive: comment/doc text, no runtime value |
| `lib/lab/view/frames.ts:2` | False positive: comment/doc text, no runtime value |
| `lib/lab/view/frames.ts:3` | False positive: comment/doc text, no runtime value |
| `lib/lab/view/frames.ts:4` | False positive: comment/doc text, no runtime value |
| `lib/lab/view/frames.ts:181` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/view/frames.ts:201` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/view/frames.ts:205` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/comms-feed.ts:5` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/comms-feed.ts:10` | False positive: comment/doc text, no runtime value |
| `lib/comms-feed.ts:11` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/lab/context.ts:8` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/context.ts:9` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/context.ts:21` | False positive: comment/doc text, no runtime value |
| `lib/lab/context.ts:24` | False positive: comment/doc text, no runtime value |
| `lib/lab/context.ts:25` | False positive: comment/doc text, no runtime value |
| `lib/lab/context.ts:31` | False positive: comment/doc text, no runtime value |
| `lib/lab/context.ts:32` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/context.ts:40` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/context.ts:51` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/context.ts:66` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/priors.ts:19` | False positive: comment/doc text, no runtime value |
| `lib/lab/api.ts:12` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `app/api/lab/snapshots/route.ts:33` | False positive: comment/doc text, no runtime value |
| `lib/spend-report.ts:131` | False positive: comment/doc text, no runtime value |
| `lib/lab/feeds.ts:26` | False positive: comment/doc text, no runtime value |
| `lib/lab/feeds.ts:27` | False positive: comment/doc text, no runtime value |
| `lib/lab/feeds.ts:28` | False positive: comment/doc text, no runtime value |
| `lib/lab/feeds.ts:185` | False positive: comment/doc text, no runtime value |
| `lib/lab/feeds.ts:194` | False positive: comment/doc text, no runtime value |
| `lib/lab/feeds.ts:278` | False positive: comment/doc text, no runtime value |
| `lib/lab/brain.ts:124` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/radar.ts:2` | False positive: comment/doc text, no runtime value |
| `lib/lab/fixtures/radar.ts:4` | False positive: comment/doc text, no runtime value |
| `lib/lab/fixtures/radar.ts:7` | False positive: comment/doc text, no runtime value |
| `lib/lab/fixtures/radar.ts:12` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/radar.ts:13` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/radar.ts:160` | False positive: comment/doc text, no runtime value |
| `lib/lab/fixtures/ops.ts:2` | False positive: comment/doc text, no runtime value |
| `lib/lab/fixtures/ops.ts:10` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/ops.ts:110` | False positive: comment/doc text, no runtime value |
| `lib/lab/measure/actors.ts:171` | False positive: comment/doc text, no runtime value |
| `lib/lab/distill.ts:24` | False positive: comment/doc text, no runtime value |
| `lib/lab/measure/scheduler.ts:12` | False positive: comment/doc text, no runtime value |
| `lib/lab/measure/scheduler.ts:165` | False positive: comment/doc text, no runtime value |
| `lib/lab/measure/scheduler.ts:193` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/measure/scheduler.ts:196` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/dissect.ts:45` | False positive: comment/doc text, no runtime value |
| `lib/lab/dissect.ts:234` | False positive: comment/doc text, no runtime value |
| `lib/lab/dissect.ts:240` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/comms-extras-server.ts:7` | False positive: comment/doc text, no runtime value |
| `lib/lab/fixtures/scenarios.ts:2` | False positive: comment/doc text, no runtime value |
| `lib/lab/fixtures/scenarios.ts:3` | False positive: comment/doc text, no runtime value |
| `lib/lab/fixtures/scenarios.ts:4` | False positive: comment/doc text, no runtime value |
| `lib/lab/fixtures/scenarios.ts:7` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/scenarios.ts:11` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/scenarios.ts:12` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/scenarios.ts:14` | False positive: comment/doc text, no runtime value |
| `lib/lab/fixtures/scenarios.ts:15` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/scenarios.ts:16` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/scenarios.ts:56` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/scenarios.ts:103` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/metabos/StudioPorts.tsx:4` | False positive: comment/doc text, no runtime value |
| `components/metabos/HubOverview.tsx:16` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `lib/lab/measure/checklist.ts:66` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/stores.ts:9` | False positive: comment/doc text, no runtime value |
| `lib/stores.ts:10` | False positive: comment/doc text, no runtime value |
| `lib/stores.ts:11` | False positive: comment/doc text, no runtime value |
| `lib/stores.ts:24` | False positive: comment/doc text, no runtime value |
| `lib/lab/measure/jobs.ts:5` | False positive: comment/doc text, no runtime value |
| `lib/lab/fixtures/world.ts:30` | False positive: comment/doc text, no runtime value |
| `lib/lab/fixtures/world.ts:32` | False positive: comment/doc text, no runtime value |
| `lib/lab/fixtures/world.ts:38` | False positive: comment/doc text, no runtime value |
| `lib/lab/fixtures/world.ts:42` | False positive: comment/doc text, no runtime value |
| `lib/lab/fixtures/world.ts:43` | False positive: comment/doc text, no runtime value |
| `lib/lab/fixtures/world.ts:46` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/world.ts:47` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/world.ts:139` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/world.ts:170` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/world.ts:185` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/world.ts:187` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/world.ts:192` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/world.ts:193` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/world.ts:199` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/world.ts:206` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/world.ts:256` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/world.ts:259` | False positive: comment/doc text, no runtime value |
| `lib/lab/fixtures/world.ts:324` | False positive: comment/doc text, no runtime value |
| `lib/lab/fixtures/world.ts:327` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/world.ts:401` | False positive: comment/doc text, no runtime value |
| `lib/lab/fixtures/world.ts:404` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/world.ts:570` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/world.ts:579` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/world.ts:666` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/world.ts:673` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/metabos/MemoryBoard.tsx:10` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/lab/gen/rules.ts:60` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/gen/rules.ts:187` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/gen.ts:2` | False positive: comment/doc text, no runtime value |
| `lib/lab/fixtures/gen.ts:13` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/gen.ts:14` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/gen.ts:15` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/gen.ts:21` | False positive: comment/doc text, no runtime value |
| `lib/lab/fixtures/gen.ts:22` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/gen.ts:68` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/g/States.tsx:106` | False positive: comment/doc text, no runtime value |
| `components/g/States.tsx:107` | Kept: dev-only design kit gallery (/dev), not business data |
| `components/g/States.tsx:110` | Kept: dev-only design kit gallery (/dev), not business data |
| `lib/finance-demo.ts:2` | False positive: comment/doc text, no runtime value |
| `lib/finance-demo.ts:7` | False positive: comment/doc text, no runtime value |
| `lib/finance-demo.ts:9` | False positive: comment/doc text, no runtime value |
| `lib/finance-demo.ts:10` | False positive: comment/doc text, no runtime value |
| `lib/finance-demo.ts:15` | False positive: comment/doc text, no runtime value |
| `lib/finance-demo.ts:21` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/finance-demo.ts:27` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/finance-demo.ts:28` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/finance-demo.ts:46` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/finance-demo.ts:47` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/finance-demo.ts:51` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/finance-demo.ts:52` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/finance-demo.ts:55` | False positive: comment/doc text, no runtime value |
| `lib/finance-demo.ts:90` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/finance-demo.ts:100` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/finance-demo.ts:111` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/finance-demo.ts:129` | False positive: comment/doc text, no runtime value |
| `lib/finance-demo.ts:141` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/finance-demo.ts:142` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/finance-demo.ts:144` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/finance-demo.ts:146` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/finance-demo.ts:154` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/finance-demo.ts:155` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/finance-demo.ts:156` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/finance-demo.ts:161` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/finance-demo.ts:166` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/finance-demo.ts:179` | False positive: comment/doc text, no runtime value |
| `lib/finance-demo.ts:180` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/lab/fixtures/index.ts:2` | False positive: comment/doc text, no runtime value |
| `lib/lab/fixtures/index.ts:3` | False positive: comment/doc text, no runtime value |
| `lib/lab/fixtures/index.ts:15` | False positive: comment/doc text, no runtime value |
| `lib/lab/fixtures/index.ts:16` | False positive: comment/doc text, no runtime value |
| `lib/lab/fixtures/index.ts:19` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/index.ts:21` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/index.ts:22` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/index.ts:23` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/index.ts:24` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/index.ts:25` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/index.ts:26` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/index.ts:27` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/index.ts:30` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/index.ts:31` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/index.ts:32` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/index.ts:34` | False positive: comment/doc text, no runtime value |
| `lib/lab/fixtures/index.ts:35` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/index.ts:38` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/index.ts:51` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/index.ts:53` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/index.ts:76` | False positive: comment/doc text, no runtime value |
| `lib/lab/fixtures/index.ts:79` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/index.ts:87` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/index.ts:93` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/index.ts:111` | False positive: comment/doc text, no runtime value |
| `lib/lab/fixtures/index.ts:112` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/index.ts:115` | False positive: comment/doc text, no runtime value |
| `lib/lab/fixtures/index.ts:116` | False positive: comment/doc text, no runtime value |
| `lib/lab/fixtures/index.ts:117` | False positive: comment/doc text, no runtime value |
| `lib/lab/fixtures/index.ts:119` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/index.ts:121` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/index.ts:124` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/index.ts:126` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/index.ts:128` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/text.ts:2` | False positive: comment/doc text, no runtime value |
| `lib/lab/fixtures/text.ts:4` | False positive: comment/doc text, no runtime value |
| `lib/lab/fixtures/text.ts:8` | False positive: comment/doc text, no runtime value |
| `lib/lab/fixtures/text.ts:53` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `app/api/lab/retention/run/route.ts:8` | False positive: comment/doc text, no runtime value |
| `lib/usage-view.ts:274` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/lab/fixtures/rand.ts:2` | False positive: comment/doc text, no runtime value |
| `lib/lab/fixtures/rand.ts:4` | False positive: comment/doc text, no runtime value |
| `lib/lab/fixtures/rand.ts:6` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/rand.ts:28` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/gen/view.ts:111` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/ledger.ts:2` | False positive: comment/doc text, no runtime value |
| `lib/lab/fixtures/ledger.ts:12` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/ledger.ts:13` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/ledger.ts:19` | False positive: comment/doc text, no runtime value |
| `lib/lab/fixtures/ledger.ts:47` | False positive: comment/doc text, no runtime value |
| `lib/lab/fixtures/ledger.ts:106` | False positive: comment/doc text, no runtime value |
| `lib/lab/fixtures/ledger.ts:117` | False positive: comment/doc text, no runtime value |
| `lib/lab/fixtures/ledger.ts:200` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/fixtures/ledger.ts:204` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/metabos/MissionControl.tsx:7` | False positive: "todo" is a real reminders/tasks feature name |
| `components/metabos/MissionControl.tsx:43` | False positive: "todo" is a real reminders/tasks feature name |
| `components/metabos/MissionControl.tsx:54` | False positive: "todo" is a real reminders/tasks feature name |
| `app/api/chats/route.ts:14` | False positive: comment/doc text, no runtime value |
| `app/api/chats/route.ts:15` | False positive: comment/doc text, no runtime value |
| `lib/data.ts:6` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/data.ts:33` | False positive: comment/doc text, no runtime value |
| `lib/data.ts:34` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/lab/gen/comments.ts:297` | False positive: comment/doc text, no runtime value |
| `lib/lab/gen/comments.ts:316` | False positive: comment/doc text, no runtime value |
| `lib/lab/gen/comments.ts:340` | False positive: comment/doc text, no runtime value |
| `lib/lab/sync.ts:24` | False positive: comment/doc text, no runtime value |
| `lib/lab/sync.ts:337` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/comms-gravity.ts:19` | False positive: comment/doc text, no runtime value |
| `lib/comms-gravity.ts:25` | False positive: comment/doc text, no runtime value |
| `lib/clients-data.ts:61` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `lib/lab/transcribe.ts:78` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/transcribe.ts:82` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/transcribe.ts:84` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/warm.ts:30` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/warm.ts:65` | False positive: comment/doc text, no runtime value |
| `lib/metabos/overdue-core.ts:92` | False positive: comment/doc text, no runtime value |
| `lib/metabos/overdue-core.ts:93` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `lib/metabos/overdue-core.ts:108` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `components/metabos/OverdueBoard.tsx:6` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `components/metabos/OverdueBoard.tsx:24` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `lib/lab/discover.ts:15` | False positive: comment/doc text, no runtime value |
| `lib/lab/discover.ts:107` | False positive: comment/doc text, no runtime value |
| `lib/lab/gen/embed.ts:144` | False positive: comment/doc text, no runtime value |
| `lib/lab/gen/embed.ts:146` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/gen/embed.ts:147` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/gen/embed.ts:171` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/gen/embed.ts:172` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/gen/embed.ts:173` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/fo-sample.ts:2` | False positive: comment/doc text, no runtime value |
| `lib/fo-sample.ts:6` | False positive: comment/doc text, no runtime value |
| `lib/fo-sample.ts:11` | False positive: comment/doc text, no runtime value |
| `lib/metabos/mission.ts:5` | False positive: "todo" is a real reminders/tasks feature name |
| `lib/metabos/mission.ts:12` | False positive: "todo" is a real reminders/tasks feature name |
| `lib/metabos/mission.ts:21` | False positive: "todo" is a real reminders/tasks feature name |
| `lib/metabos/mission.ts:33` | False positive: "todo" is a real reminders/tasks feature name |
| `lib/lab/gen/frames.ts:208` | False positive: comment/doc text, no runtime value |
| `lib/lab/gen/frames.ts:229` | False positive: comment/doc text, no runtime value |
| `lib/lab/gen/frames.ts:232` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/dry.ts:6` | False positive: comment/doc text, no runtime value |
| `lib/lab/dry.ts:36` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/drift-store.ts:9` | False positive: comment/doc text, no runtime value |
| `lib/metabos/workflows.ts:110` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `lib/metabos/workflows.ts:112` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `lib/metabos/demo-story.ts:2` | False positive: comment/doc text, no runtime value |
| `lib/metabos/demo-story.ts:3` | False positive: comment/doc text, no runtime value |
| `lib/metabos/demo-story.ts:11` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/metabos/demo-story.ts:13` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/metabos/demo-story.ts:14` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/metabos/demo-story.ts:15` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/metabos/demo-story.ts:16` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/metabos/demo-story.ts:17` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/metabos/demo-story.ts:18` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/metabos/demo-story.ts:23` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/metabos/demo-story.ts:24` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/metabos/demo-story.ts:25` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/lab/store.ts:363` | False positive: comment/doc text, no runtime value |
| `lib/lab/store.ts:1149` | False positive: comment/doc text, no runtime value |
| `lib/lab/store.ts:1158` | False positive: comment/doc text, no runtime value |
| `lib/lab/store.ts:1159` | False positive: comment/doc text, no runtime value |
| `lib/lab/intel.ts:27` | False positive: comment/doc text, no runtime value |
| `lib/agents/conductor.ts:13` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/lab/radar/view.ts:289` | False positive: comment/doc text, no runtime value |
| `lib/knowledge-views.ts:271` | False positive: comment/doc text, no runtime value |
| `lib/finances.ts:4` | False positive: comment/doc text, no runtime value |
| `lib/finances.ts:129` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/finances.ts:133` | False positive: comment/doc text, no runtime value |
| `lib/finances.ts:139` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/finances.ts:141` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/finances.ts:142` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/lab/radar/fixtures.ts:2` | False positive: comment/doc text, no runtime value |
| `lib/lab/radar/fixtures.ts:3` | False positive: comment/doc text, no runtime value |
| `lib/lab/radar/fixtures.ts:5` | False positive: comment/doc text, no runtime value |
| `lib/lab/radar/fixtures.ts:17` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/radar/fixtures.ts:24` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/radar/fixtures.ts:28` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/radar/fixtures.ts:32` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/radar/fixtures.ts:33` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/radar/fixtures.ts:79` | False positive: comment/doc text, no runtime value |
| `lib/lab/radar/fixtures.ts:82` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/radar/fixtures.ts:84` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/gate.ts:4` | False positive: comment/doc text, no runtime value |
| `lib/usage-payload.ts:8` | False positive: comment/doc text, no runtime value |
| `lib/usage-payload.ts:10` | False positive: comment/doc text, no runtime value |
| `lib/usage-payload.ts:72` | False positive: comment/doc text, no runtime value |
| `lib/clients-view.ts:56` | False positive: comment/doc text, no runtime value |
| `lib/clients-view.ts:209` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `lib/lab/radar/namer.ts:38` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/radar/namer.ts:39` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/radar/namer.ts:40` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/radar/namer.ts:45` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/radar/namer.ts:51` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/radar/namer.ts:61` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/content-feed.ts:93` | False positive: comment/doc text, no runtime value |
| `lib/lab/radar/novelty.ts:102` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/radar/novelty.ts:106` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/radar/seed.ts:3` | False positive: comment/doc text, no runtime value |
| `lib/lab/radar/run.ts:6` | False positive: comment/doc text, no runtime value |
| `lib/lab/radar/run.ts:7` | False positive: comment/doc text, no runtime value |
| `lib/lab/radar/run.ts:44` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/radar/run.ts:265` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/radar/run.ts:272` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/radar/run.ts:273` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/radar/run.ts:285` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/radar/run.ts:302` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/radar/run.ts:304` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/radar/run.ts:354` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/radar/run.ts:355` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/radar/angles.ts:172` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/radar/angles.ts:173` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/lab/radar/angles.ts:187` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/creative-engine/status-card.ts:30` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/creative-engine/status-card.ts:31` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/creative-engine/status-card.ts:37` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/creative-engine/status-card.ts:40` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/creative-engine/status-card.ts:46` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/metabos/overdue.ts:2` | False positive: comment/doc text, no runtime value |
| `lib/metabos/overdue.ts:9` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `lib/metabos/overdue.ts:68` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `lib/metabos/overdue.ts:83` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `lib/metabos/overdue.ts:84` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `lib/metabos/overdue.ts:104` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `lib/metabos/overdue.ts:109` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `lib/creative-engine/frameworks.ts:10` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/creative-engine/frameworks.ts:11` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/creative-engine/frameworks.ts:15` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/creative-engine/frameworks.ts:40` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/creative-engine/console-ui.ts:119` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/creative-engine/pick.ts:42` | False positive: comment/doc text, no runtime value |
| `lib/creative-engine/dry.ts:6` | False positive: comment/doc text, no runtime value |
| `lib/creative-engine/dry.ts:7` | False positive: comment/doc text, no runtime value |
| `lib/creative-engine/dry.ts:10` | False positive: comment/doc text, no runtime value |
| `lib/creative-engine/dry.ts:39` | False positive: comment/doc text, no runtime value |
| `lib/creative-engine/dry.ts:41` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/metabos/registry.ts:197` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `components/chats/ChatsClassic.tsx:34` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/creative-engine/workflow-run.ts:40` | False positive: comment/doc text, no runtime value |
| `lib/creative-engine/store.ts:38` | False positive: comment/doc text, no runtime value |
| `lib/creative-engine/store.ts:150` | False positive: comment/doc text, no runtime value |
| `lib/metabos/ai/swarm.ts:19` | False positive: "todo" is a real reminders/tasks feature name |
| `lib/creative-engine/angles.ts:84` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/creative-engine/workflow-edit.ts:280` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/chats/ChatsLegacy.tsx:29` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/creative-engine/research.ts:7` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/creative-engine/workflow.ts:76` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/chats/ChatsG.tsx:32` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/arcads/catalog.ts:52` | Kept: opt-in ?sample=1 preview on a blank install, rendered with a Sample badge |
| `lib/metabos/store.ts:384` | Kept: Filming/Demo mode only (DEMO_MODE=1 or Settings toggle, default off); now flagged by the global "Demo data" banner |
| `lib/creative-engine/demo.ts:59` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/creative-engine/demo.ts:66` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/creative-engine/demo.ts:89` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/creative-engine/demo.ts:128` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/creative-engine/demo.ts:131` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/creative-engine/demo.ts:132` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/metabos/mission-layout-client.ts:2` | False positive: "todo" is a real reminders/tasks feature name |
| `lib/metabos/mission-layout-client.ts:4` | False positive: "todo" is a real reminders/tasks feature name |
| `lib/content-pipelines.ts:415` | False positive: comment/doc text, no runtime value |
| `lib/creative-engine/schemas.ts:91` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `lib/creative-engine/schemas.ts:223` | False positive: comment/doc text, no runtime value |
| `lib/creative-engine/schemas.ts:224` | False positive: comment/doc text, no runtime value |
| `lib/creative-engine/schemas.ts:230` | False positive: comment/doc text, no runtime value |
| `lib/creative-engine/schemas.ts:339` | False positive: comment/doc text, no runtime value |
| `lib/creative-engine/schemas.ts:519` | False positive: comment/doc text, no runtime value |
| `lib/creative-engine/schemas.ts:525` | False positive: comment/doc text, no runtime value |
| `components/lab/v2/classic/sheets/SetupSheet.tsx:94` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/lab/v2/legacy/Frame.tsx:119` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/workflow-canvas/engine.ts:92` | Reviewed: id/jitter generation, not a displayed status |
| `components/lab/v2/legacy/sheets/SetupSheet.tsx:90` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/lab/v2/classic/Frame.tsx:124` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/lab/v2/g/setup/SetupSections.tsx:54` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
| `components/lab/v2/g/Frame.tsx:136` | Kept: Lab/Creative dry-run fixtures; only under LAB_DRY=1 or Filming (opt-in); out of MeTaBos business scope |
