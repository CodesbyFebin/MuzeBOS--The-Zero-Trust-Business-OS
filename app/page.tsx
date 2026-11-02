import { ExecutiveCockpit, MissionWidgets } from '@/components/metabos/StudioPorts';
import { MissionControl } from '@/components/metabos/MissionControl';
import { Home6Console } from '@/components/Home6Console';
import { BRAND } from '@/lib/brand';
import { MuZeVoice } from '@/components/metabos/muse/MuZeVoice';
export const dynamic = 'force-dynamic';
export default function HomePage() { return BRAND.id === 'glados' ? <Home6Console /> : <><MissionControl /><section className="mb-muse-home" aria-label="MuZe assistant"><h2>MuZe</h2><MuZeVoice size={200} /></section><div className="mb-console"><MissionWidgets /><ExecutiveCockpit /></div></>; }
