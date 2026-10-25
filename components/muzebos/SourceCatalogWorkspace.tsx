'use client';
import { useState } from 'react';
import catalog from '@/lib/muzebos/source-catalog.json';
export function SourceCatalogWorkspace() {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('all');
  const results = catalog.filter(r => (mode === 'all' || r.mode === mode) && `${r.repo} ${r.section} ${r.use} ${r.license}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="mb-console mb-category"><span className="mb-eyebrow">SYSTEM / SOURCE PROVENANCE</span><h1>Source integration catalog</h1><p className="mb-muted">{catalog.length} pinned source reviews. Imported material is distinguished from optional external applications, references and excluded sources. Cloning is not deployment or a verified connection.</p>
    <div className="mb-category-toolbar"><label className="mb-search"><span className="sr-only">Search sources</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search sources, licenses or sections…"/></label><label>Disposition <select value={mode} onChange={e => setMode(e.target.value)}>{['all', 'imported', 'companion', 'reference', 'review', 'excluded'].map(value => <option value={value} key={value}>{value}</option>)}</select></label><span className="mb-muted">{results.length} sources</span></div>
    <div className="mb-tool-grid">{results.map(source => <article className="mb-panel" key={source.repo}><div className="mb-panel-head"><span className="mb-eyebrow">{source.section}</span><span className="mb-badge">{source.mode}</span></div><h2>{source.repo}</h2><p>{source.use}</p><p className="mb-muted">{source.remaining}</p><p>License: {source.license}{source.archived ? ' · Archived upstream' : ''}</p><details><summary>Revision & license evidence</summary><p className="mb-source-hash">{source.sha}</p>{source.licenseFiles.length ? source.licenseFiles.map(file => <p className="mb-source-hash" key={file.path}>{file.path}<br/>SHA-256 {file.sha256}</p>) : <p>No root license grant found.</p>}</details><a className="mb-link" href={`${source.url}/tree/${source.sha}`} target="_blank" rel="noreferrer noopener">Inspect pinned source</a></article>)}</div>{!results.length && <p className="mb-empty">No matching source reviews.</p>}
  </div>;
}
