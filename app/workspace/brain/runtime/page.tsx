import { AiConsole } from '@/components/metabos/StudioPorts';
import { BrainRuntime } from '@/components/metabos/BrainRuntime';
import { BrainConsole } from '@/components/metabos/BrainConsole';
import { MetaBudget } from '@/components/metabos/MetaBudget';
export default function BrainRuntimePage() { return <><BrainRuntime/><MetaBudget/><div className="mb-console"><AiConsole/><div className="mb-talk-wrap"><BrainConsole panel="agents"/></div></div></>; }
