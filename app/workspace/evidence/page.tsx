import { EvidenceExplorer } from '@/components/metabos/EvidenceExplorer';
import { CategoryWorkspace } from '@/components/metabos/CategoryWorkspace';
export const dynamic = 'force-dynamic';
export default function EvidencePage() { return <><EvidenceExplorer/><CategoryWorkspace section="evidence"/></>; }
