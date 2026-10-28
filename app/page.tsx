import { ExecutiveCockpit, MissionWidgets } from '@/components/metabos/StudioPorts';
import { MissionControl } from '@/components/metabos/MissionControl';
import { Home6Console } from '@/components/Home6Console';
import { BRAND } from '@/lib/brand';
export const dynamic = 'force-dynamic';
export default function HomePage() { return BRAND.id === 'glados' ? <Home6Console /> : <><MissionControl /><div className="mb-console"><MissionWidgets /><ExecutiveCockpit /></div></>; }
