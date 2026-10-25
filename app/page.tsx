import { BusinessConsole } from '@/components/muzebos/BusinessConsole';
import { Home6Console } from '@/components/Home6Console';
import { BRAND } from '@/lib/brand';
export const dynamic = 'force-dynamic';
export default function HomePage() { return BRAND.id === 'glados' ? <Home6Console /> : <BusinessConsole />; }
