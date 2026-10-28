/** QA only: seed a protocol-fixture draft into the qualification harness's disposable DB. */
import path from 'node:path';
import { tmpdir } from 'node:os';
import { BusinessStore } from '../lib/metabos/store';
import { InferenceStore } from '../lib/metabos/inference/store';
import { routes } from '../lib/metabos/inference/routing';
import { runServerOnce } from '../lib/metabos/inference/providers';
const target = path.resolve(process.argv[2] || '.');
if (path.dirname(path.dirname(target)) !== path.resolve(tmpdir()) || !path.basename(path.dirname(target)).startsWith('metabos-browser-') || path.basename(target) !== 'business.sqlite') throw new Error('Only the QA harness disposable DB is allowed');
const business = new BusinessStore(target);
const env = { BASETEN_API_KEY: 'fixture-not-a-credential', MUZEBOS_INFERENCE_PAID: '1' };
async function main() {
  try {
    const store = new InferenceStore(business, () => routes(env));
    const title = `Browser fixture Jev handoff ${Date.now()}`;
    const task = store.create({ title, prompt: 'Synthetic QA reminder proposal', kind: 'draft', lane: 'baseten', paidConsent: true });
    store.approve(task.id, task.hash); // Scripted fixture approval, not a human/live-model claim.
    const result = await runServerOnce(store, 'browser-protocol-fixture', env, (async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ tool: 'reminders.create', args: { title } }) }, finish_reason: 'stop' }] }))) as typeof fetch);
    if (result.state !== 'completed') throw new Error('Fixture draft failed');
    console.log(JSON.stringify({ taskId: task.id, title, evidenceMode: 'fixture' }));
  } finally { business.close(); }
}
main().catch(() => { console.error('Jev browser fixture failed'); process.exitCode = 1; });
