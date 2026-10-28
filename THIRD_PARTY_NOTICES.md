# Third-party notices

MeTaBos retains the FounderOS MIT attribution in the root LICENSE. Additional
imports below are scoped material, not a claim that upstream applications are
fully integrated. All original MIT notices are retained in `vendor/`.

| Material | Upstream and pinned revision | Local use | License notice |
| --- | --- | --- | --- |
| `src/rules/permission-entries.ts`, copied without modification | affaan-m/agentshield `b0891303bdcd6037376a94263d45cfd2ff3dfb98` | `vendor/agentshield/permission-entries.ts`, imported by limited browser-local permission review | `vendor/agentshield/LICENSE` |
| Eight `employees/*/employee.json` role fields and 60 `employees/*/routines/*/SKILL.md` documents | markfulton/ai-employees `020feb3d74d96c13243db53403a71c9705c231b3` | `lib/metabos/employee-index.json` and `vendor/reference-documents/*.txt`, inert reference library | `vendor/ai-employees/LICENSE` |
| Eleven `skills/*/SKILL.md` documents | Jakeschincariol/founder-skill `fd9385b0cfe1b96bebce3898fbd506d73eff5a9d` | `vendor/reference-documents/*.txt`, inert founder prompts | `vendor/founder-skill/LICENSE` |
| Five `templates/*.md` documents | failcoach/ai-agent-onboarding `c1abb54c157c1d1453582477c4fbfde5915088f2` | `vendor/reference-documents/*.txt`, inert onboarding templates | `vendor/ai-agent-onboarding/LICENSE` |

The metadata index is a MeTaBos transformation. Imported document content remains
attributed to its original author. Document SHA-256 values accompany the text.
Role names and routine identifiers refer factually to the imported upstream
material; no affiliation or endorsement is implied.

No upstream installers, automation schedules, browser-control routines, code
execution harnesses, Python calculators or outreach tools are executed by these
pages. Clicking Queue human review creates a local reminder only.

All 29 reviewed sources, license evidence hashes, revisions and dispositions
appear in `lib/metabos/source-catalog.json` and
`docs/METABOS-UPSTREAM-INTEGRATIONS.md`. External source clones are deliberately
outside the MeTaBos repository and are not redistributed as an undifferentiated
MIT bundle. Copyleft projects are not incompatible by definition: their source
and obligations need a deliberate integration/distribution design. No such
source merge was performed here.

The inference workspace additionally depends on the packaged
`@mlc-ai/web-llm` library (MLC, Apache License 2.0); its license remains in the
installed package. Llama model weights are a separate, explicit device download
under their upstream model terms. No Muse Code, Wonder Full or OpenClaw source
or model weights are bundled or represented as running in this release.
