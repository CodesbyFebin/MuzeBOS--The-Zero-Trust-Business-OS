import { ExecutiveCockpit, MissionWidgets } from '@/components/metabos/StudioPorts';
import { MissionControl } from '@/components/metabos/MissionControl';
import { Home6Console } from '@/components/Home6Console';
import { BRAND } from '@/lib/brand';
import { MuZeHome } from '@/components/metabos/muse/MuZeHome';
export const dynamic = 'force-dynamic';
export default function HomePage() { return BRAND.id === 'glados' ? <Home6Console /> : <><MissionControl /><MuZeHome /><div className="mb-console"><MissionWidgets /><ExecutiveCockpit /></div></>; }
