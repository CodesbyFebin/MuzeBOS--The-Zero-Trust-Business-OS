import { BusinessOpenServer } from '@/components/metabos/bos/BusinessOpenServer';
export default async function BusinessOpenServerPage(props: { searchParams?: Promise<{ view?: string }> }) { const params = await props?.searchParams; return <main className="mb-page mb-page-flush" aria-label="MuZe Business Open Server"><BusinessOpenServer requestedView={params?.view} /></main>; }
