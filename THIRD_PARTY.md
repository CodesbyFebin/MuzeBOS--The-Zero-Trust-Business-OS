# Third-party references
These repositories were studied during the event. MeTaBos code inspired by them is a clean-room re-implementation: no source was copied. Any file that does adapt code must carry `// adapted-from: <repo/path>, built during event` and be listed under "Adapted files" below.
| Repo | Licence | Status |
|---|---|---|
| matiasbattocchia/open-bsp-api | Unlicense | may adapt (attribution courtesy) |
| CatchTheTornado/open-agents-builder | MIT © authors | may adapt with notice |
| melgarafael/DeskcommCRM | MIT | may adapt with notice |
| Miosa-osa/BusinessOS | Apache-2.0 | may adapt, keep NOTICE |
| Sri-Krishna-V/awesome-adk-agents | Apache-2.0 | may adapt, keep NOTICE |
| Denis2054/Building-Business-Ready-GenAI-Systems | MIT | may adapt with notice |
| oc8-ai/oc8 | LGPL-3.0 | pattern-only |
| ToolJet/ToolJet | AGPL-3.0 | pattern-only |
| h100envy/crawlhive-brain | none | pattern-only |

## Patterns used (clean-room, no code copied)
| MeTaBos file | Pattern | Source |
|---|---|---|
| lib/metabos/talk/core.ts | pause the bot when a human replies (takeover) | open-bsp-api |
| lib/metabos/talk/core.ts | opt-out registry checked before send | DeskcommCRM |
| lib/metabos/talk/service.ts | sentiment-triggered handoff with a briefing card; follow-up after silence | DeskcommCRM, oc8 (pattern only) |
| lib/metabos/talk/service.ts | approve agent actions from a chat reply | open-agents-builder |
| lib/metabos/brain/ops.ts | flow combinators (sequence, parallel, oneOf, forEach) plus an evaluator loop | open-agents-builder, awesome-adk-agents |
| lib/metabos/brain/metering.ts | per-agent spend metering and monthly caps | oc8 (pattern only) |
| lib/metabos/brain/ops.ts | tool risk tiers; high risk always gated | open-agents-builder |
| lib/metabos/brain/ops.ts | counterparty risk memory with graded outcomes | crawlhive-brain (pattern only) |
| lib/metabos/data/service.ts | question to read-only SQL analyst that shows the query it ran | google/adk-samples data-science agent (Apache-2.0, pattern only) |
| lib/metabos/data/service.ts | customer data export and redaction | DeskcommCRM (MIT, pattern only) |
| lib/metabos/data/service.ts | monthly sales goals against actuals | DeskcommCRM (MIT, pattern only) |

## Adapted files
None yet.
