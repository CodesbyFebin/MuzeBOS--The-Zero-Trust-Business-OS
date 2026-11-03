import { ExecutiveCockpit, MissionWidgets } from '@/components/metabos/StudioPorts';
import { MissionControl } from '@/components/metabos/MissionControl';
import { Home6Console } from '@/components/Home6Console';
import { BRAND } from '@/lib/brand';
import { MuZeHome } from '@/components/metabos/muse/MuZeHome';
import { HomeTiles } from '@/components/metabos/muse/HomeTiles';
export const dynamic = 'force-dynamic';
/** MuZe home: companion + voice bar first, then one tile per feature (real counts or empty states), then mission control. */
export default function HomePage() {
  if (BRAND.id === 'glados') return <Home6Console />;
  return <><MuZeHome /><HomeTiles /><MissionControl voice={false} /><div className="mb-console"><MissionWidgets /><ExecutiveCockpit /></div></>;
}
