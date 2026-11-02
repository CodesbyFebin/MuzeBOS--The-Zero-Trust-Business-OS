import { BusinessConsole } from '@/components/metabos/BusinessConsole';
export const dynamic = 'force-dynamic';
export default async function BusinessPage(props:{searchParams?: Promise<{view?:string}>}) { return <BusinessConsole initialView={(await props?.searchParams)?.view}/>; }
