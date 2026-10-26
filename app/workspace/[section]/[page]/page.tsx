import { notFound, redirect } from 'next/navigation';
import { pageForSegments } from '@/lib/muzebos/registry';
import { FeatureStub } from '@/components/muzebos/FeatureStub';
import { ModuleWorkspace } from '@/components/muzebos/ModuleWorkspace';
import { moduleById } from '@/lib/muzebos/modules';
import { isInfraPage } from '@/lib/muzebos/infra-pages';
import { InfraWorkspace } from '@/components/muzebos/InfraWorkspace';
export const dynamic='force-dynamic';
/** Canonical page route. Working pages alias to the screen that implements them, declarative modules render their workspace, the rest render an honest status stub. */
export default function FeaturePage({params}:{params:{section:string;page:string}}) {
 const feature=pageForSegments(params.section,params.page);
 if(!feature)notFound();
 if((feature.status==='available'||feature.status==='needs-credentials')&&moduleById(feature.id))return <ModuleWorkspace feature={feature}/>;
 if(feature.status==='available'&&isInfraPage(feature.id))return <InfraWorkspace feature={feature}/>;
 if(feature.target&&(feature.status==='available'||feature.status==='existing'))redirect(feature.target);
 return <FeatureStub feature={feature}/>;
}
