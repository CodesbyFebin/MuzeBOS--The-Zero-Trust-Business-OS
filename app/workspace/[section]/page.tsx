import { notFound } from 'next/navigation';
import { CategoryWorkspace } from '@/components/metabos/CategoryWorkspace';
import { MENUS } from '@/lib/metabos/registry';
export const dynamic='force-dynamic';
export default async function WorkspacePage(props:{params: Promise<{section:string}>}) {
 const params = await props.params;
 const section=params.section;
 if(!MENUS.some(m=>m.route===`/workspace/${section}`))notFound();
 return <CategoryWorkspace section={section}/>;
}
