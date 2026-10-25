import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { menuById, type FeatureDefinition } from '@/lib/muzebos/registry';
import { StatusBadge } from '@/components/muzebos/StatusBadge';
/** A planned or blocked page: states its status and dependencies, and offers no controls that would imply it works. */
export function FeatureStub({feature}:{feature:FeatureDefinition}) {
 const menu=menuById(feature.menuId);const cluster=menu?.clusters.find(c=>c.id===feature.clusterId);
 return <div className="mb-console mb-category mb-stub" data-feature={feature.id} data-status={feature.status}>
  <header className="mb-heading"><div><span className="mb-eyebrow">{menu?.label.toUpperCase()} / {cluster?.label.toUpperCase()}{feature.pillar?` / PILLAR ${feature.pillar}`:''}</span><h1>{feature.label}</h1><p>{feature.summary}</p></div><StatusBadge status={feature.status}/></header>
  <section className="mb-panel"><h2>Why this page has no controls</h2><p className="mb-muted">{feature.status==='blocked'?'This feature needs an external provider integration that has not been built or verified. ':'This feature has not been implemented yet. '}It will become available only after its operation works and is verified by tests.</p>
   {feature.dependencies.length>0&&<><h2>Dependencies</h2><ul className="mb-help-list">{feature.dependencies.map(d=><li key={d}>{d}</li>)}</ul></>}</section>
  {menu&&<Link className="mb-link" href={menu.route}><ArrowLeft size={13}/> Back to {menu.label}</Link>}
 </div>;
}
