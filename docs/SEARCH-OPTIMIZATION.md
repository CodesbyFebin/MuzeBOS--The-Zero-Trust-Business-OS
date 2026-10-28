# Search, answer-engine and generative-engine implementation

Scope: MeTaBos public repository and separately hostable project documentation.
Date: 2026-10-26. Audience: founders, SMB operators and developers evaluating
self-hosted commerce and approval-gated AI. India-specific questions cover UPI
requests and GST limits; no unsupported global tax/payment capability is claimed.

## Observed starting point

GitHub repository description and topics were empty. No Pages site was enabled
and no verified website URL was configured. The README contained useful commerce
facts but mixed current scope with outdated limitations and separate experimental
inference interfaces. No Search Console, analytics or ranking dataset was supplied.
No traffic, ranking improvement or citation lift is measured or inferred here.

## URL-to-intent map

| Canonical public-docs path | Intent | Differentiating evidence |
| --- | --- | --- |
| `/` | Understand MeTaBos | Scope, attribution and answer hub |
| `/self-hosting/` | Run privately | Actual Node/SQLite setup and deployment limits |
| `/invoice-approvals/` | Understand transaction trust | Payload approval, stock recheck and atomic records |
| `/webllm-inference/` | Choose inference workflow | Persistent dispatch versus interactive proposal interface |
| `/upi-and-tax/` | Distinguish request and settlement | Manual evidence labels; tax/filing boundaries |
| `/security-and-data/` | Evaluate data exposure | Durable records, provider boundary and unanchored audit |
| `/verification/` | Check implementation claims | Software fixtures versus unexecuted live gates |

`docs/search/` is the authoritative source. The static export in `site/` uses the
proposed GitHub Pages project URL. **It is not live merely because it was built.**
Each page has a distinct title/description, one main heading, visible answer-first
content, crawlable contextual links, canonical/OG metadata, accessible navigation
and matching SoftwareSourceCode/TechArticle JSON-LD. No fake ratings, offers,
reviews or Meta affiliation are added. FAQ text does not imply rich-result eligibility.

The sitemap contains only those public documentation pages. It never contains
business, account, customer, order, API or approval URLs. The Next.js workspace
retains auth and adds `noindex, nofollow, noarchive` metadata/headers. These
crawler preferences are not security controls. There is no public app sitemap.

## Repository metadata

Reviewed description/topics are in `config/repository.json`. Preview them with
`npm run repo:metadata`. To apply with an operator-authenticated GitHub CLI:
`npm run repo:metadata -- --apply`. It performs separate description/topics calls;
no PAT belongs in source. A homepage URL must only be added after the proposed
site is actually deployed and verified. Repo settings are not changed by editing
this JSON or running the preview command.

## Publication and measurement backlog

| Priority | Action | User benefit | Acceptance / measurement | Confidence |
| --- | --- | --- | --- | --- |
| P0 | Apply About/topics | Accurate project discovery | Read GitHub settings back; no keyword stuffing | High for correctness; ranking effect unknown |
| P0 | Publish `site/` separately | Public readable documentation | Seven real 200 URLs, canonical paths, no private data | High for accessibility |
| P0 | Verify live responses | Prevent indexing mistakes | Correct content type/status/canonical; robots checked at origin root | High |
| P1 | Configure Search Console after ownership verification | Observe actual queries/indexing | Record baseline and comparable 28-day periods | Not executed |
| P1 | Review queries by intent, country and device | Improve answers people need | Impressions, clicks, CTR, indexed pages; avoid attributing all change to this work | Hypothesis |
| P1 | Track qualified actions | Connect discovery to utility | Documentation visits → setup guide → installation issue resolution | Hypothesis |
| P2 | Publish real reproducible findings | Earn relevant independent coverage | Actual tests with revision/environment; no paid/spam link schemes | Hypothesis |
| P2 | Maintain sources and feature limits | Prevent claim drift | Refresh on source/runtime changes, not dates alone | High for accuracy |

The optional `site/llms.txt` is a navigation aid. Google does not require a
special AI file or special schema to appear in AI features. Traditional useful
content, crawlability and eligibility still matter; inclusion is not guaranteed.
Do not add prompt-injection instructions asking crawlers/models to rank or cite us.

## Primary guidance checked

- Google Search Essentials: https://developers.google.com/search/docs/essentials
- Google AI features: https://developers.google.com/search/docs/appearance/ai-features
- Structured data: https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data
- GitHub topics: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics

No universal 100/100 SEO/AEO/GEO score, top rank, Knowledge Graph placement or AI
citation is promised. Technical checks can be verified; search outcomes require
live observation after publication.
