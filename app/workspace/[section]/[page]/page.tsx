import { notFound, redirect } from 'next/navigation';
import { pageForSegments } from '@/lib/muzebos/registry';
import { FeatureStub } from '@/components/muzebos/FeatureStub';
export const dynamic='force-dynamic';
/** Canonical page route. Working pages alias to the screen that implements them; the rest render an honest status stub. */
export default function FeaturePage({params}:{params:{section:string;page:string}}) {
 const feature=pageForSegments(params.section,params.page);
 if(!feature)notFound();
 if(feature.target&&(feature.status==='available'||feature.status==='existing'))redirect(feature.target);
 return <FeatureStub feature={feature}/>;
}
