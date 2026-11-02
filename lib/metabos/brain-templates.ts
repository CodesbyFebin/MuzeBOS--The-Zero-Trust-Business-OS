/**
 * Founder templates for the Brain workspace. Eleven are adapted from the MIT-licensed
 * Jakeschincariol/founder-skill reference documents (the full source text is linked, read-only);
 * one (weekly review) is original to MeTaBos. "Use template" only creates a local draft:
 * nothing is sent, scheduled or executed.
 */
export const BRAIN_ROLES = ['founder', 'finance', 'marketing', 'sales', 'operations'] as const;
export type BrainRole = (typeof BRAIN_ROLES)[number];
export const ROLE_LABELS: Record<BrainRole, string> = { founder: 'Founder', finance: 'Finance', marketing: 'Marketing', sales: 'Sales', operations: 'Operations' };
export type FounderTemplate = { id: string; name: string; roles: BrainRole[]; summary: string; body: string; referenceId: string | null; source: string };
const ref = (slug: string) => `founder-skill-founder-${slug}`;
const FS = 'Jakeschincariol/founder-skill (MIT)';
const T = (id: string, name: string, roles: BrainRole[], summary: string, steps: string[], referenceId: string | null, source = FS): FounderTemplate =>
  ({ id, name, roles, summary, referenceId, source, body: `${name}\n\nGoal: ${summary}\n\nWork through:\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nNotes:\n- ` });
export const FOUNDER_TEMPLATES: FounderTemplate[] = [
  T('founder-plan', 'Business plan', ['founder'], 'Turn an idea into a one-page plan a founder can act on.', ['Problem and who has it', 'Offer and price', 'First 10 customers: where they come from', 'Costs to launch', 'What must be true in 90 days'], ref('plan')),
  T('founder-offer', 'Offer design', ['founder', 'sales'], 'Define exactly what is sold, to whom, and why it beats the alternative.', ['Customer and situation', 'Promised outcome', 'What is included and excluded', 'Guarantee or risk reversal', 'Reasons to buy now'], ref('offer')),
  T('founder-pricing', 'Pricing review', ['founder', 'finance', 'sales'], 'Set or check a price against costs, competitors and willingness to pay.', ['Direct cost per unit (minor units)', 'Competitor price points', 'Target margin', 'Proposed price and tiers', 'Test plan'], ref('pricing')),
  T('founder-cfo', 'Unit economics', ['finance', 'founder'], 'Margin, break-even and cash needed before money is spent.', ['Revenue per unit', 'Direct costs per unit', 'Fixed monthly costs', 'Break-even units per day', 'Cash needed until break-even'], ref('cfo')),
  T('founder-competitors', 'Competitor scan', ['founder', 'marketing'], 'List real alternatives and where the business can win.', ['Direct competitors', 'Substitutes and do-nothing', 'Their price and promise', 'Gaps customers complain about', 'Our position'], ref('competitors')),
  T('founder-consumer', 'Customer research', ['marketing', 'sales'], 'Plan customer conversations and capture what was actually said.', ['Who to talk to', 'Questions about past behaviour', 'Recorded quotes', 'Patterns', 'Decision this changes'], ref('consumer')),
  T('founder-brand', 'Brand brief', ['marketing'], 'Name, voice and promise in one brief.', ['Audience', 'Promise in one sentence', 'Voice: do and do not', 'Visual cues', 'Proof points'], ref('brand')),
  T('founder-marketing', 'Marketing plan', ['marketing'], 'Pick channels and a weekly cadence the team can sustain.', ['Goal and metric', 'Two channels to start', 'Weekly content cadence', 'Budget', 'How results are measured'], ref('marketing')),
  T('founder-launch', 'Launch checklist', ['founder', 'marketing', 'operations'], 'Everything that must be ready before launch day.', ['Offer and price final', 'Payment path tested', 'Stock or capacity confirmed', 'Announcement copy', 'Day-one support plan'], ref('launch')),
  T('founder-ops', 'Operations runbook', ['operations'], 'Document how orders are fulfilled, step by step.', ['Order received', 'Stock check', 'Fulfilment steps and owner', 'Customer updates', 'What to do when something fails'], ref('ops')),
  T('founder-board', 'Board update', ['founder', 'finance'], 'A monthly update for advisers or investors.', ['Headline numbers', 'Wins', 'Misses and why', 'Cash and runway', 'Asks'], ref('board')),
  T('weekly-review', 'Weekly founder review', ['founder', 'operations', 'finance'], 'Review the week from your own records before planning the next one.', ['Invoices issued and settled this week', 'Approvals still waiting', 'Low-stock items', 'Overdue reminders', 'Three priorities for next week'], null, 'MeTaBos original'),
];
export const templateById = (id: string) => FOUNDER_TEMPLATES.find((t) => t.id === id);
