import { AgentReviewWorkspace } from '@/components/metabos/AgentReviewWorkspace';
import { BrainConsole } from '@/components/metabos/BrainConsole';
export default function AgentReviewPage() { return <AgentReviewWorkspace><div className="mb-talk-wrap"><BrainConsole panel="risk"/><BrainConsole panel="tools"/></div></AgentReviewWorkspace>; }
