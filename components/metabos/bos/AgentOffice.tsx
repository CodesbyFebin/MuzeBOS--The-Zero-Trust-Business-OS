'use client';
/** Agent Office: a 2.5D pixel office (SVG). One desk per real agent; state comes only from Jev runs and agent drafts. */
import { useState } from 'react';
export type Desk = { agent: string; state: 'working' | 'awaiting_approval' | 'rejected' | 'idle'; records: number; pending: number; rejected: number; toolCalls: number | null; lastAction: string | null; lastAt: string | null; model: string | null };
const LABEL = { working: 'Working', awaiting_approval: 'Awaiting approval', rejected: 'Rejected', idle: 'Idle' } as const;
const COLS = 4, W = 150, H = 110;
export function AgentOffice({ desks }: { desks: Desk[] }) {
  const [hover, setHover] = useState<Desk | null>(null);
  if (desks.length === 0) return <div data-testid="bos-office" className="mb-bos-office-empty"><h2>Agent Office</h2>
    <svg viewBox="0 0 320 140" width="320" height="140" aria-hidden><path d="M20 100 L160 30 L300 100 L160 135 Z" fill="#111" stroke="#242424" /><text x="160" y="92" textAnchor="middle" fill="#8a8a8a" fontSize="12">Empty office</text></svg>
    <p>No agents have recorded any work yet. A desk appears when an agent writes a draft or a Jev proposal.</p></div>;
  const rows = Math.ceil(desks.length / COLS);
  return <div data-testid="bos-office"><h2>Agent Office</h2><p className="mb-muted">{desks.length} agents with records. Glow = waiting for you in Jev.</p>
    <div className="mb-bos-office-wrap">
      <svg className="mb-bos-office" viewBox={`0 0 ${COLS * W + 40} ${rows * H + 40}`} role="list" aria-label="Agent desks">
        {desks.map((d, i) => { const x = 20 + (i % COLS) * W + (Math.floor(i / COLS) % 2) * 20, y = 20 + Math.floor(i / COLS) * H; const pile = d.toolCalls ? Math.min(8, Math.ceil(d.toolCalls / 2)) : 0;
          return <g key={d.agent} role="listitem" tabIndex={0} aria-label={`${d.agent}: ${LABEL[d.state]}`} className={`mb-bos-desk is-${d.state}`} transform={`translate(${x} ${y})`} onMouseEnter={() => setHover(d)} onFocus={() => setHover(d)} onMouseLeave={() => setHover(null)} onBlur={() => setHover(null)}>
            {d.state === 'awaiting_approval' && <ellipse className="mb-bos-glow" cx="60" cy="60" rx="62" ry="30" />}
            <path d="M10 55 L60 30 L110 55 L60 80 Z" fill="#161616" stroke="#2a2a2a" />
            <path d="M10 55 L10 65 L60 90 L60 80 Z" fill="#111" /><path d="M110 55 L110 65 L60 90 L60 80 Z" fill="#0d0d0d" />
            <rect x="48" y="28" width="26" height="18" fill="#0A0A0A" stroke={d.state === 'rejected' ? '#8a8a8a' : '#FF2A2A'} className="mb-bos-screen" />
            <rect className="mb-bos-agent" x="30" y="40" width="10" height="14" fill={d.state === 'idle' ? '#3a3a3a' : '#FF2A2A'} />
            {Array.from({ length: pile }, (_, k) => <rect key={k} x="80" y={48 - k * 3} width="16" height="3" fill="#E5E5E5" opacity={0.9 - k * 0.05} />)}
            <text x="60" y="104" textAnchor="middle" fill="#E5E5E5" fontSize="10">{d.agent.slice(0, 22)}</text>
          </g>; })}
      </svg>
      <aside className="mb-bos-hover" aria-live="polite">{hover ? <dl>
        <dt>Agent</dt><dd>{hover.agent}</dd><dt>State</dt><dd>{LABEL[hover.state]}</dd><dt>Records</dt><dd>{hover.records}</dd><dt>Waiting in Jev</dt><dd>{hover.pending}</dd><dt>Rejected</dt><dd>{hover.rejected}</dd>
        <dt>Tool calls</dt><dd>{hover.toolCalls ?? 'Not recorded'}</dd><dt>Model</dt><dd>{hover.model ?? 'Not recorded'}</dd><dt>Last</dt><dd>{hover.lastAction ?? '—'}</dd><dt>At</dt><dd>{hover.lastAt ? new Date(hover.lastAt).toLocaleString() : '—'}</dd></dl> : <p className="mb-muted">Hover or focus a desk to see its records.</p>}</aside>
    </div></div>;
}
