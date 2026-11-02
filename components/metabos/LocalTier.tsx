'use client';
import { useEffect, useState } from 'react';
type S = { state: string; label: string; model?: string };
/** Local Llama tier status card. Shows "Not connected" unless the server answered just now. */
export function LocalTier() {
  const [d, setD] = useState<{ chat: S; guard: S } | null>(null); const [err, setErr] = useState('');
  useEffect(() => { fetch('/api/ai/local').then((r) => r.json()).then((j) => j.error ? setErr(j.error) : setD(j)).catch(() => setErr('Usage unavailable')); }, []);
  const cls = (s: S) => s.state === 'ready' ? 'mb-ok' : 'mb-bad';
  return <section className="mb-panel" aria-labelledby="local-tier-h" data-testid="local-tier">
    <h2 id="local-tier-h">Local Llama tier (optional)</h2>
    <p>Order: rules first, then local Llama 3.2 1B for classification and short replies, then Meta <code>muse-spark-1.3-contributor</code> for drafts. Llama Guard 3 1B checks every AI draft before it becomes a Jev item; unsafe drafts are blocked and show their S-category.</p>
    {err ? <p>{err}</p> : !d ? <p>Checking…</p> : <ul>
      <li>Chat (MUZEBOS_LOCAL_LLM_URL): <span className={cls(d.chat)} data-testid="local-chat-state">{d.chat.state === 'ready' ? `Connected — ${d.chat.model ?? 'model unknown'}` : d.chat.label}</span></li>
      <li>Guard (MUZEBOS_LOCAL_GUARD_URL): <span className={cls(d.guard)} data-testid="local-guard-state">{d.guard.state === 'ready' ? `Connected — ${d.guard.label}` : d.guard.label}</span></li>
    </ul>}
    <p className="mb-warn">Local 1B and 8B models invented a promo code ("BAKE20") in testing. Every draft still needs your review in Jev.</p>
    <p>Built with Llama.</p>
  </section>;
}
