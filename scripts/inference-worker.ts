/** Always-on draft worker. Supervisor restarts this process; SQLite preserves state. */
import { randomUUID } from 'node:crypto';
import { businessStore } from '../lib/metabos/store';
import { InferenceStore } from '../lib/metabos/inference/store';
import { runServerOnce } from '../lib/metabos/inference/providers';
import { runtimeEnv } from '../lib/creds';
const once = process.argv.includes('--once');
const settings = runtimeEnv();
for (const key of ['MUZEBOS_DB', 'GLADOS_DB', 'GLADOS_DEFAULT_MODE', 'GLADOS_MODE_FILE']) if (settings[key]) process.env[key] = settings[key];
if (runtimeEnv().MUZEBOS_WORKER_ENABLED !== '1') { console.error('Set MUZEBOS_WORKER_ENABLED=1 to run the local inference worker.'); process.exit(1); }
const business = businessStore(), store = new InferenceStore(business);
const workerId = `server-${randomUUID()}`;
let stopping = false;
process.on('SIGTERM', () => { stopping = true; }); process.on('SIGINT', () => { stopping = true; });
async function main() {
  try {
    do {
      const result = await runServerOnce(store, workerId);
      if (result.state !== 'idle') console.log(JSON.stringify(result));
      if (once || stopping) break;
      await new Promise(resolve => setTimeout(resolve, 5000));
    } while (!stopping);
  } finally { business.close(); }
}
main().catch(() => { console.error('Inference worker stopped unexpectedly'); process.exitCode = 1; });
