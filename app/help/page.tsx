import Link from 'next/link';
export const metadata = { title: 'Help and about — MuzeBOS' };
export default function Help() {
  return <main className="mb-panel" style={{ maxWidth: 760, margin: '0 auto', padding: 24 }}>
    <h1>Help and about</h1>
    <p>MuzeBOS drafts and proposes; you approve. Every send, post or payment goes through a Jev approval and then /api/dispatch.</p>
    <h2>AI models</h2>
    <p>Drafts use the Meta Model API (<code>muse-spark-1.3-contributor</code> by default), with a spend cap set in <Link href="/workspace/system/ai-settings">AI settings</Link>. An optional local tier runs Llama 3.2 1B and Llama Guard 3 1B on your own server.</p>
    <p data-testid="built-with-llama"><strong>Built with Llama.</strong> Llama 3.2 is licensed under the Llama 3.2 Community License, Copyright © Meta Platforms, Inc. All Rights Reserved. Use follows the Llama Acceptable Use Policy.</p>
    <p>Third-party credits are listed in THIRD_PARTY.md in the source repository. See also the <Link href="/privacy">privacy policy</Link>.</p>
  </main>;
}
