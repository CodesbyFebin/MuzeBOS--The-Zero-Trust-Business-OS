import { notFound } from 'next/navigation';
import { CategoryWorkspace } from '@/components/muzebos/CategoryWorkspace';
import { SIDEBAR_ENTRIES } from '@/lib/muzebos/navigation';
export const dynamic='force-dynamic';
export default function WorkspacePage({params}:{params:{section:string}}) {
 const section=params.section;
 if(!SIDEBAR_ENTRIES.some(e=>e.href===`/workspace/${section}`))notFound();
 return <CategoryWorkspace section={section}/>;
}
