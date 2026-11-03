'use client';
/**
 * MuZe home tiles: one card per feature, each opening that view in the Business Open Server. Every number comes from
 * /api/home or /api/board/status on this server; a missing value renders an empty state, never a placeholder figure.
 * "Guide me" sends MuZe (MuZeRoam) to each tile in turn and reads the tile's own data-guide text.
 */
import { useEffect, useState } from 'react';
import type { Home } from '@/lib/metabos/home';
import { emitRoam } from '@/lib/metabos/muse/roam';
type Tile = { id: string; status: string };
const V = (v: string) => `/workspace/builder/business-open-server?view=${v}`;
const n = (o: Record<string, number> | undefined, k: string) => o?.[k] ?? 0;
type Card = { id: string; view: string; title: string; guide: string; body: React.ReactNode };

export function HomeTiles() {
  const [h, setH] = useState<Home | null>(null); const [board, setBoard] = useState<Tile[] | null>(null); const [err, setErr] = useState<string | null>(null); const [step, setStep] = useState(-1);
  useEffect(() => {
    fetch('/api/home', { cache: 'no-store' }).then(async (r) => { if (!r.ok) throw new Error(r.status === 401 ? 'Sign in to see your workspace numbers.' : `Home summary unavailable (HTTP ${r.status}).`); setH(await r.json()); }).catch((e) => setErr(e.message));
    fetch('/api/board/status', { cache: 'no-store' }).then(async (r) => { if (r.ok) setBoard((await r.json()).tiles); }).catch(() => undefined);
  }, []);
  const empty = (t: string) => <p className="mb-home-empty">{t}</p>;
  const stat = (label: string, v: number | string) => <div className="mb-home-stat"><b>{v}</b><span>{label}</span></div>;
  const by = (k: string) => (board ?? []).filter((t) => t.status === k).length;
  const cards: Card[] = [
    { id: 'board', view: 'board', title: 'Systems board', guide: 'Systems board: real health pings for each configured service. Unconfigured services say so.', body: board ? <div className="mb-home-stats">{stat('up', by('ok'))}{stat('dry run', by('dry run'))}{stat('down', by('down'))}{stat('not configured', by('not configured'))}</div> : empty('Board status not loaded.') },
    { id: 'jev', view: 'sanctum', title: 'Jev two-reviewer queue', guide: 'Jev queue: every external send waits here for two different reviewers approving the exact payload hash.', body: h ? (h.jev.waiting ? <><div className="mb-home-stats">{stat('waiting', h.jev.waiting)}</div><ul>{h.jev.top.map((r) => <li key={r.id}>{r.title}</li>)}</ul></> : empty('Nothing waiting for review.')) : null },
    { id: 'dispatch', view: 'hq', title: 'Dispatch and receipts', guide: 'Dispatch: proposed, approved and sent messages, with the receipts recorded for each send.', body: h ? (h.dispatch.total ? <div className="mb-home-stats">{stat('pending', n(h.dispatch.byStatus, 'pending'))}{stat('sent', n(h.dispatch.byStatus, 'sent'))}{stat('receipts', h.receipts)}</div> : empty(`No dispatches yet.${h.dispatch.dryRun ? ' Meta sends are in dry-run mode.' : ''}`)) : null },
    { id: 'office', view: 'office', title: 'Agent Office', guide: 'Agent Office: each agent desk and the runtime agents run on (built-in or Rakazo).', body: h ? <><div className="mb-home-stats">{stat('desks', h.office.desks.length)}{stat('runtime', h.office.runtime === 'local' ? 'built-in' : h.office.runtime)}</div><p className="mb-home-note">Rakazo: {h.office.rakazoConfigured ? 'configured (URL set)' : 'not configured'}</p></> : null },
    { id: 'canvas', view: 'canvas', title: 'Design canvas', guide: 'Design canvas: HTML frames agents and people write together, reviewed by Jev before use.', body: h ? (h.canvas.total ? <ul>{h.canvas.frames.map((f) => <li key={f.id}>{f.title} · {f.status} · r{f.rev}</li>)}</ul> : empty('No frames yet.')) : null },
    { id: 'issues', view: 'issues', title: 'Issues', guide: 'Issues: work items raised by people, agents and canvas comments.', body: h ? (Object.keys(h.issues).length ? <div className="mb-home-stats">{Object.entries(h.issues).map(([k, v]) => <span key={k}>{stat(k.replace('_', ' '), v)}</span>)}</div> : empty('No issues.')) : null },
    { id: 'sanctum', view: 'sanctum', title: 'Sanctum', guide: 'Sanctum: the approval room where reviewers sign off on sends.', body: h ? <div className="mb-home-stats">{stat('receipts', h.receipts)}</div> : null },
    { id: 'operator', view: 'operator', title: 'Operator console and Discord', guide: 'Operator console: swarms, channels and the CLI for operators.', body: h ? <><div className="mb-home-stats">{stat('swarms', h.operator.swarms)}{stat('channels', h.operator.channels.length)}</div><p className="mb-home-note">{h.operator.channels.filter((c) => c.messages).map((c) => `#${c.name} ${c.messages}`).join(' · ') || 'Channels are empty.'}</p></> : null },
    { id: 'mcp', view: 'mcp', title: 'MCP directory', guide: 'MCP directory: catalogued tool servers, their licence, risk and whether they are connected.', body: h ? <><div className="mb-home-stats">{stat('servers', h.mcp.total)}{stat('built in', h.mcp.builtIn.length)}</div></> : null },
    { id: 'trust', view: 'trust', title: 'Trust R0–R6', guide: 'Trust stack: what each layer from R0 to R6 actually is on this server. Unattested layers say so.', body: h ? <ul className="mb-home-trust">{h.trust.map((t) => <li key={t.id}><b>{t.id}</b> {t.state.replace(/_/g, ' ')}</li>)}</ul> : null },
    { id: 'meta', view: 'discord', title: 'Meta products', guide: 'Meta products: manual status marks set by an operator. Live status is not fetched.', body: h ? <><div className="mb-home-stats">{Object.entries(h.meta.byStatus).map(([k, v]) => <span key={k}>{stat(k, v)}</span>)}</div><p className="mb-home-note">Not fetched live; marks are manual.</p></> : null },
    { id: 'evidence', view: 'verify', title: 'Evidence ledger', guide: 'Evidence ledger: a SHA-256 hash chain of every recorded action, verified on each read.', body: h ? (h.evidence.rows ? <><div className="mb-home-stats">{stat('rows', h.evidence.rows)}{stat('chain', h.evidence.chainValid ? 'verified' : 'BROKEN')}</div><ul>{h.evidence.recent.map((e) => <li key={e.seq}>#{e.seq} {e.action}</li>)}</ul></> : empty('No evidence recorded yet.')) : null },
  ];
  const go = (i: number) => { const k = (i + cards.length) % cards.length; setStep(k); emitRoam({ kind: 'guide', selector: `[data-guide-id="home-${cards[k].id}"]` }); };
  return (
    <section className="mb-home" aria-labelledby="mb-home-h" data-testid="home-tiles">
      <div className="mb-home-head">
        <h2 id="mb-home-h">Your workspace</h2>
        <div className="mb-home-tour" role="group" aria-label="MuZe guide">
          {step < 0 ? <button type="button" onClick={() => go(0)} data-testid="home-guide">Guide me</button>
            : <><button type="button" onClick={() => go(step - 1)}>Previous</button><span aria-live="polite">{step + 1} / {cards.length}</span><button type="button" onClick={() => go(step + 1)} data-testid="home-guide-next">Next</button><button type="button" onClick={() => { setStep(-1); emitRoam({ kind: 'home' }); }}>End tour</button></>}
        </div>
      </div>
      {err && <p className="mb-home-empty" role="status">{err}</p>}
      <ul className="mb-home-grid">
        {cards.map((c) => (
          <li key={c.id} className="mb-home-tile" data-guide-id={`home-${c.id}`} data-guide={c.guide} data-testid={`home-tile-${c.id}`}>
            <h3><a href={V(c.view)}>{c.title}</a></h3>
            {c.body ?? (err ? null : empty('Loading…'))}
          </li>
        ))}
      </ul>
    </section>
  );
}
