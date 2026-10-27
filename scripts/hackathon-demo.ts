/** npm run demo:agent -- "request text". Live when META_MODEL_API_KEY / BASETEN_API_KEY is set; else rule mode, labelled. */
import { BusinessStore } from '../lib/muzebos/store';
import { runOpsAgent } from '../lib/muzebos/ai/ops-agent';
import { queue } from '../lib/muzebos/ai/jev';
const request = process.argv.slice(2).filter((a) => a !== '--baseten').join(' ') || 'Invoice Acme for the 3 desk lamps they picked up. Then remind me to follow up with Acme on Friday about payment; and restock SKU LAMP-01 because only 2 are left.';
const store = new BusinessStore(process.env.MUZEBOS_DEMO_DB || ':memory:');
async function main() {
const run = await runOpsAgent(store, request, { prefer: process.argv.includes('--baseten') ? 'baseten' : 'meta' });
console.log(`mode: ${run.mode}${run.mode === 'rule' ? ' (no model key set; no model was called)' : ''}`);
for (const s of run.steps) console.log(`- [${s.subtask.role}/${s.subtask.tier}] ${s.subtask.text}\n    engine=${s.engine} model=${s.model ?? '-'} run=${s.runId ?? '-'}\n    ${s.outcome}${s.raw ? `\n    raw: ${s.raw.replace(/\s+/g, ' ').slice(0, 300)}` : ''}`);
console.log(`Jev queue: ${queue(store).length} proposal(s) waiting for a human. Nothing was executed.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
