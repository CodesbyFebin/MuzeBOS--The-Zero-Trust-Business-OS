import { notFound, redirect } from 'next/navigation';
import { pageForSegments, featureByLegacyRoute } from '@/lib/metabos/registry';
import { FeatureStub } from '@/components/metabos/FeatureStub';
import { ModuleWorkspace } from '@/components/metabos/ModuleWorkspace';
import { moduleById } from '@/lib/metabos/modules';
import { isInfraPage } from '@/lib/metabos/infra-pages';
import { InfraWorkspace } from '@/components/metabos/InfraWorkspace';
export const dynamic='force-dynamic';
/** Canonical page route. Working pages alias to the screen that implements them, declarative modules render their workspace, the rest render an honest status stub. */
export default async function FeaturePage(props:{params: Promise<{section:string;page:string}>}) {
 const params = await props.params;
 const feature=pageForSegments(params.section,params.page);
 if(!feature){const legacy=featureByLegacyRoute(`/workspace/${params.section}/${params.page}`);if(legacy)redirect(legacy.route);notFound();}
 if((feature.status==='available'||feature.status==='needs-credentials')&&moduleById(feature.id))return <ModuleWorkspace feature={feature}/>;
 if(feature.status==='available'&&isInfraPage(feature.id))return <InfraWorkspace feature={feature}/>;
 if(feature.target&&(feature.status==='available'||feature.status==='existing'))redirect(feature.target);
 return <FeatureStub feature={feature}/>;
}
