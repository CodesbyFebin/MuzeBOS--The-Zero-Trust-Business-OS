/** No network in --fixture. Live mode requires two typed, exact-hash approvals per provider. */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { BusinessStore } from '../lib/metabos/store';
import { InferenceStore } from '../lib/metabos/inference/store';
import { routes } from '../lib/metabos/inference/routing';
import { runServerOnce } from '../lib/metabos/inference/providers';
import { proposeInferenceAction } from '../lib/metabos/inference/jev-bridge';
import { WorkflowEngine } from '../lib/metabos/workflows';
import { runtimeEnv } from '../lib/creds';
async function main() {
  const args = process.argv.slice(2);
  const mode = args[0];
  const selected = args[1] || 'both';
  if (!['--fixture', '--live'].includes(mode) || !['meta', 'baseten', 'both'].includes(selected) || args.length > 2) throw new Error('Usage: npm run hackathon:demo -- --fixture|--live [meta|baseten|both]');
  const live = mode === '--live';
  if (live && (!process.stdin.isTTY || !process.stdout.isTTY)) throw new Error('Live demo requires an interactive terminal and individual exact-hash approvals');
  const env = live ? { ...runtimeEnv(), MUZEBOS_META_MODEL: 'muse-spark-1.3' } : { MUZEBOS_INFERENCE_PAID: '1', MUZEBOS_META_MODEL: 'muse-spark-1.3', META_MODEL_API_KEY: 'fixture-not-a-credential', BASETEN_API_KEY: 'fixture-not-a-credential' };
  const providers = selected === 'both' ? ['meta', 'baseten'] : [selected];
  // Check configuration before creating any task; never silently switch to fixtures or another model.
  for (const provider of providers) if (!routes(env).find(r => r.provider === provider)?.configured) throw new Error(`${provider} needs its server credential and MUZEBOS_INFERENCE_PAID=1; no requests sent`);
  const dir = mkdtempSync(path.join(tmpdir(), 'metabos-hackathon-'));
  const db = new BusinessStore(path.join(dir, 'demo.sqlite'));
  const store = new InferenceStore(db, () => routes(env));
  const engine = new WorkflowEngine(db);
  const terminal = live ? createInterface({ input: process.stdin, output: process.stdout }) : null;
  const results: unknown[] = [];
  async function approve(label: string, payload: unknown, hash: string) {
    console.log(`\n${label}\n${JSON.stringify(payload, null, 2)}\nSHA256 ${hash}`);
    if (terminal && await terminal.question('Type this exact hash to approve (anything else cancels): ') !== hash) throw new Error('Operator cancelled; no next action authorized');
    if (!live) console.log('FIXTURE: scripted approval, not evidence of human or provider execution');
  }
  console.log(`${live ? 'LIVE — provider billing may apply; credits are not a hard cost cap' : 'FIXTURE — synthetic API responses, zero network, no live-inference claim'}\nDisposable synthetic business DB: ${dir}`);
  try {
    for (const provider of providers) {
      const task = store.create({ title: `Hackathon ${provider} reminder proposal`, prompt: 'Synthetic demo only. Return exactly one JSON object, no markdown or additional fields: {"tool":"reminders.create","args":{"title":"Review demo shelf stock"}}. Propose this reminder only; do not execute any action.', kind: 'draft', lane: provider, maxTokens: 2048, paidConsent: true });
      await approve('Jev gate 1: authorize one model call, maximum 2048 output tokens, no automatic retry', task.payload, task.hash);
      store.approve(task.id, task.hash);
      let requests = 0;
      const fetcher: typeof fetch = live ? async (url, init) => { requests++; if (requests > 1) throw new Error('Demo request budget exhausted'); return fetch(url, init); } : async () => {
        requests++;
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ tool: 'reminders.create', args: { title: 'Review demo shelf stock' } }) }, finish_reason: 'stop' }] }));
      };
      const start = performance.now();
      const result = await runServerOnce(store, `hackathon-${provider}`, env, fetcher);
      const latencyMs = Math.round(performance.now() - start);
      if (result.state !== 'completed') throw new Error(`${provider} did not complete; no action approved or executed. Inspect provider configuration/output and start a fresh reviewed demo. No automatic retry.`);
      const completed = store.task(task.id);
      const run = proposeInferenceAction(store, task.id);
      console.log(`Draft output (untrusted): ${completed.output}\nOutput SHA256 ${completed.outputHash}`);
      await approve('Jev gate 2: authorize one local reminder, no invoice/payment/message scope', { input: run.input, plan: run.plan }, run.payloadHash);
      engine.approve(run.id, run.payloadHash);
      const executed = engine.execute(run.id);
      if (executed.status !== 'succeeded') throw new Error('Reminder workflow did not succeed');
      results.push({ provider, model: task.payload.model, evidenceMode: live ? 'live' : 'fixture', requests, latencyMs, taskId: task.id, payloadHash: task.hash, outputHash: completed.outputHash, usage: completed.usage, workflowId: run.id, actionHash: run.payloadHash, status: executed.status });
    }
    const report = { schemaVersion: 1, evidenceMode: live ? 'live' : 'fixture', syntheticBusiness: true, generatedAt: new Date().toISOString(), auditValid: db.verifyAudit(), results, limitations: 'Local operator-generated report, not independent provider attestation, zk proof, benchmark or compliance certification. Missing usage is unknown, never zero.' };
    const file = path.join(dir, 'report.json');
    writeFileSync(file, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    console.log(`\n${JSON.stringify(report, null, 2)}\nReport: ${file}\nKeep live evidence private until reviewed for publication.`);
  } finally { terminal?.close(); db.close(); }
}
main().catch(() => { console.error('Demo stopped. No automatic retry or fallback. Check configuration, approvals and provider response privately; do not publish secrets.'); process.exitCode = 1; });
