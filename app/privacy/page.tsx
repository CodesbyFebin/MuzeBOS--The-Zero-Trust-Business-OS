import Link from 'next/link';
import { CONTRIBUTOR_DISCLOSURE } from '@/lib/metabos/ai/meta-call';
export const metadata = { title: 'Privacy policy — MuzeBOS' };
/** Plain-language privacy notice. Describes what this install does; it is not legal advice. */
export default function Privacy() {
  return <main className="mb-panel" style={{ maxWidth: 760, margin: '0 auto', padding: 24 }}>
    <h1>Privacy policy</h1>
    <p>MuzeBOS stores your business records (customers, invoices, approvals and the audit log) in a SQLite database on the server you run it on.</p>
    <h2>AI providers</h2>
    <p>When an AI draft is requested, the prompt is sent to the configured provider: the Meta Model API by default, or OpenRouter as a fallback. Nothing is sent when no provider key is set.</p>
    <p data-testid="privacy-meta-training"><strong>{CONTRIBUTOR_DISCLOSURE}</strong> The owner can switch to standard models in <Link href="/workspace/system/ai-settings">AI settings</Link>.</p>
    <h2>Your rights (DPDP Act)</h2>
    <p>The owner can export or redact the personal data held about a customer from the DPDP data requests panel. Invoice numbers and amounts are kept for tax records.</p>
  </main>;
}
