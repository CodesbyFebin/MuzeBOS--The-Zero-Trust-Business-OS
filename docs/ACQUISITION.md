# Why Meta: strategic-fit memo for MuZe (MeTaBos)

**Status:** This is a thesis written by the MuZe team. MuZe has **no relationship with Meta**: no partnership, investment, endorsement, App Review approval, Tech Provider status or contact. Nothing below claims traction, revenue, users or customers, because none has been measured. Market statements are framed as hypotheses to check against Meta's own public reports before use.

## What MuZe is today (verifiable in this repo)
- An approval-first business OS for small businesses and creators. Every outbound action (WhatsApp, Instagram, email, ads) is a proposal that a person approves in Jev and then sends through one gate, `/api/dispatch`.
- A hash-chained evidence ledger (`mb_audit`, `verifyAudit`) behind every decision, revert, cherry-pick and blame view.
- A Meta integration surface (`/workspace/developer/meta-integration`) that reports the real state of each build-order step and shows "Not configured" until the env or a token exists.

## Fit with Meta's platform (why it matters to Meta)
1. **Meta API usage.** The product is built on official Graph API surfaces: Login with Facebook (12 scopes, all App Review-gated), signed webhooks (X-Hub-Signature-256), WhatsApp Cloud API, Instagram messaging, Marketing API (read first, writes later), Catalog and Conversions API. Graph throttling codes (4, 17, 32, 613, 80000–80014) are honoured with exponential backoff, so the client is well-behaved by design.
2. **WhatsApp Business adoption.** The Click-to-WhatsApp lead pipeline turns inbox threads into staged leads with follow-up reminders and approval-gated replies. Hypothesis: this lowers the effort for a small business to respond on WhatsApp, which is the behaviour Meta's business messaging depends on. We have not measured this.
3. **Advantage+ and SMB / creator ad spend in India.** Ad creation is a draft-then-approve wizard. ROAS is shown only from real insights, and pause rules are proposals. Hypothesis: owners who trust the guardrails are more willing to run their first campaigns. Ads writes are blocked until Meta App Review grants `ads_management`. No spend figures are claimed here.
4. **Safety via approval-gated agents.** Agents never send on their own. Each send is bound to a payload hash, approved by a named person and recorded in the evidence chain, and can be blamed or reverted. This matches the scrutiny Meta applies to automated messaging and ads.

## What is not built (honest gaps)
- Page publishing adapter, catalogue write sync, Conversions API event sending (consent, dedup and test events), billing and partner mode.
- Meta business verification, App Review and Tech Provider onboarding — none started.

## What would have to be true before any conversation
Real usage data from consenting businesses, completed App Review, and a privacy and security review. Until then this memo is a product-direction document, not a pitch with numbers.
