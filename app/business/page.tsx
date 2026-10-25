import { BusinessConsole } from '@/components/muzebos/BusinessConsole';
export const dynamic = 'force-dynamic';
export default function BusinessPage(props:{searchParams?:{view?:string}}) { return <BusinessConsole initialView={props?.searchParams?.view}/>; }
