# MuzeBOS upstream integration review

Reviewed: 2026-10-25. All 29 repositories were cloned as shallow sparse checkouts, with the full path tree indexed and selected source files inspected. Upstream applications were not installed or executed. Branch heads are pinned below. Root license identification is a source review, not a complete component-level legal audit.

| Source | Revision | Section | Disposition | License | Scope and remaining work |
| --- | --- | --- | --- | --- | --- |
| [zentyal/zentyal](https://github.com/zentyal/zentyal) | `08030fe9a044` | system | companion | GPL-2.0 | Small-business network/server administration. Separate Linux host and authenticated adapter; no service deployed. |
| [qingchencloud/clawpanel](https://github.com/qingchencloud/clawpanel) | `51aeb748022f` | brain | review | AGPL-3.0 + additional terms | Desktop agent control-panel reference. AGPL with additional terms and separate Tauri runtime; no source copied. |
| [markfulton/ai-employees](https://github.com/markfulton/ai-employees) | `020feb3d74d9` | brain | imported | MIT | Eight role definitions and 60 routine documents. Read-only library and manual review queue only; no agent execution or schedule installed. |
| [affaan-m/agentshield](https://github.com/affaan-m/agentshield) | `b0891303bdcd` | brain | imported | MIT | Pure permission parser and normalizer. Limited local checks only; full scanner and runtime enforcement not integrated. |
| [lsfusion-solutions/mycompany](https://github.com/lsfusion-solutions/mycompany) | `c06696110e37` | operations | companion | Apache-2.0 | ERP, manufacturing and HR service candidate. lsFusion runtime and business-data mapping need a separate adapter. |
| [papa-torb/adtruth](https://github.com/papa-torb/adtruth) | `5683e7039542` | growth | companion | MIT | Advertising fraud analysis candidate. Requires reviewed event inputs and independent evaluation; no fraud predictions run. |
| [dragotin/kraft](https://github.com/dragotin/kraft) | `95ad3706bba3` | money | companion | GPL-2.0 | Desktop quotation and invoice workflows. C++/Qt desktop application; no code merged into local commerce. |
| [5dive-ai/5dive](https://github.com/5dive-ai/5dive) | `4d9e1d2a391d` | brain | companion | MIT | Self-hosted agent-team operations. Separate runtime and credential boundaries require execution qualification. |
| [mert28kar-stack/Wave-Bookkeeping-Setup-Guide](https://github.com/mert28kar-stack/Wave-Bookkeeping-Setup-Guide) | `aa9a2b1b5320` | money | excluded | Unresolved; no root license | Bookkeeping download/setup guide. No root license grant found. Download-oriented guide is not an accounting engine; no linked installers fetched. |
| [SGrappelli/pronto](https://github.com/SGrappelli/pronto) | `e89c5920ef92` | orders | reference | MIT | Booking, CRM and retail workflow reference. Native SQLite reservations implemented independently; Next.js 16/Supabase stack not transplanted. |
| [seldonframe/seldonframe](https://github.com/seldonframe/seldonframe) | `3f386a221849` | growth | companion | AGPL-3.0 | Front-office website, intake and booking service. AGPL service remains separate; no source copied or deployment run. |
| [MicroPyramid/opensource-startup-crm](https://github.com/MicroPyramid/opensource-startup-crm) | `b51c85dabbf6` | orders | reference | MIT | CRM pipeline reference. Archived upstream; dependency/security review required before any import. |
| [phpledger/phpledger](https://github.com/phpledger/phpledger) | `e83a494e8e4e` | money | companion | AGPL-3.0 | Double-entry accounting and bank reconciliation. AGPL PHP/MySQL service; maintenance notice and adapter qualification remain. |
| [orekoapp/oreko](https://github.com/orekoapp/oreko) | `32e3278ada2e` | money | companion | AGPL-3.0 | Visual quote and invoice editing. AGPL service; no source copied or data synchronization implemented. |
| [ilyautov/small-business-ru](https://github.com/ilyautov/small-business-ru) | `43ad4add8a4d` | foundation | reference | Apache-2.0 | Jurisdiction-specific deterministic business calculators. Russian tax assumptions cannot be presented as Indian GST or global tax rules. |
| [NowSquare/VoxelBooking](https://github.com/NowSquare/VoxelBooking) | `cbf54db39db5` | orders | companion | AGPL-3.0 | Resource/capacity appointment service. AGPL PHP/MySQL application; separate adapter remains planned. |
| [oyekamal/maps2whatsapp](https://github.com/oyekamal/maps2whatsapp) | `a2d6ea69c11b` | growth | review | MIT | Local lead-research workflow reference. No scraping or outreach enabled; consent, source terms and send approvals need review. |
| [True-Good-Craft/TGC-BUS-Core](https://github.com/True-Good-Craft/TGC-BUS-Core) | `0a4676863033` | stock | review | Unresolved; no root license | Shop-floor production tracking reference. No root license file found; package-level permissions require review before copying. |
| [adris-misra/multi-agentic-framework](https://github.com/adris-misra/multi-agentic-framework) | `5cc9dd3c3abd` | brain | reference | MIT | Manufacturing agent architecture reference. Architecture reference is not a deployed industrial control or compliance system. |
| [failcoach/ai-agent-onboarding](https://github.com/failcoach/ai-agent-onboarding) | `c1abb54c157c` | brain | imported | MIT | Five agent onboarding templates. Imported as inert reference text; operator queues manual review only. |
| [cube-js/cube](https://github.com/cube-js/cube) | `091be1334e85` | growth | companion | Apache-2.0 / MIT by component | Semantic analytics layer. Root declares Apache-2.0 default with MIT packages; service, data model and auth not connected. |
| [thenaturalist/awesome-business-intelligence](https://github.com/thenaturalist/awesome-business-intelligence) | `ff35bce37c85` | growth | reference | MIT | BI discovery directory. Curated links are not an executable analytics engine. |
| [jortilles/EDA](https://github.com/jortilles/EDA) | `a559eea0cfde` | growth | companion | AGPL-3.0 | BI dashboard service. AGPL service remains separate; no dashboards or database credentials connected. |
| [hossainchisty/FreshGerium-ERP-Platform](https://github.com/hossainchisty/FreshGerium-ERP-Platform) | `bbabea1e7d4c` | operations | companion | GPL-3.0 (root text) | ERP workflow reference. Root GPL-3.0 text; separate service and dependency qualification required. |
| [odoo/odoo](https://github.com/odoo/odoo) | `0af7f93d7b4e` | operations | companion | LGPL-3.0 (component exceptions) | ERP module and external service candidate. Root LGPL-3.0 with component exceptions; no Odoo server or modules deployed. |
| [jtmuller5/The-HustleGPT-Challenge](https://github.com/jtmuller5/The-HustleGPT-Challenge) | `6d1f632f9458` | brain | excluded | Unresolved; no root license | Founder experiment collection. No root license grant found; not a runtime or verified business decision engine. |
| [Jakeschincariol/founder-skill](https://github.com/Jakeschincariol/founder-skill) | `fd9385b0cfe1` | brain | imported | MIT | Eleven founder skill documents. Text library only; Python calculators and simulated consumer panels are not executed. |
| [vishnuraghavb/EnBizCard](https://github.com/vishnuraghavb/EnBizCard) | `03e85c8c9be7` | foundation | companion | AGPL-3.0 | Digital business-card generator. AGPL application; no source copied or publishing adapter connected. |
| [hypaware/Hypastack](https://github.com/hypaware/Hypastack) | `4347a8353d13` | system | excluded | Reference-only; reuse prohibited | Reference-only licensed source. License explicitly disallows product reuse and production hosting. No source copied or used to design integration. |

## Integration contract

- Imported means explicitly identified MIT material is present and used in the application. It does not mean the upstream application runs here.
- Companion means a separately deployable candidate, with no configured connection or runtime integration in this release.
- Reference means inspected for requirements or discovery; no upstream code copied.
- Review means licensing, maintenance or operational questions remain before copying or execution.
- Excluded means no implementation reuse authorized by the inspected license, or no license grant was found.
- No source from Hypastack, the Wave guide, or HustleGPT is included in MuzeBOS.
- No remote installers, scraper campaigns, privileged server installation, or agent schedules were executed.
- MuzeBOS remains single-operator and SQLite-backed. No tenant-isolation, PostgreSQL, external-provider or production qualification is claimed.

## New working sections

- `/workspace/system/sources`: searchable provenance and integration-status catalog for all 29 sources.
- `/workspace/brain/employees`: eight roles, 60 routine documents and 16 founder/onboarding templates, with manual reminder creation.
- `/workspace/brain/security`: browser-local limited permission review using the imported AgentShield normalizer.
- `/workspace/orders/bookings`: persistent resource reservations with transactional overlap rejection and audited cancellation.

## Reproduce source checkouts

Run `python3 scripts/clone-upstream-sources.py --destination /absolute/path/outside-the-app`. This checks out the pinned revisions sparsely without running source code. Existing directories are verified rather than reset. Full applications require their own license, deployment and security qualification.
