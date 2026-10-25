import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BusinessStore } from '@/lib/muzebos/store';
import { InferenceStore } from '@/lib/muzebos/inference/store';
import { routes } from '@/lib/muzebos/inference/routing';
describe('Separate server worker process', () => {
  it('claims once across two real processes and persists an HTTP protocol fixture result', async () => {
    let calls = 0;
    const server = createServer((req, res) => {
      calls++;
      expect(req.url).toBe('/v1/chat/completions');
      req.resume();
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content: 'HTTP fixture only: no live model inference' } }], usage: { prompt_tokens: 7, completion_tokens: 9 } }));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    const directory = mkdtempSync(path.join(tmpdir(), 'mb-inference-process-'));
    const env = { ...process.env, MUZEBOS_WORKER_ENABLED: '1', MUZEBOS_DB: path.join(directory, 'business.sqlite'), GLADOS_ENV_LOCAL: path.join(directory, 'unused-env'), GLADOS_MODE_FILE: path.join(directory, 'unused-mode'), GLADOS_DEFAULT_MODE: 'real', MUZEBOS_OLLAMA_URL: `http://127.0.0.1:${address.port}/v1`, NO_PROXY: '127.0.0.1,localhost' };
    const business = new BusinessStore(env.MUZEBOS_DB);
    try {
      const store = new InferenceStore(business, () => routes(env));
      const task = store.create({ title: 'Fixture worker', prompt: 'Protocol test', kind: 'analysis', lane: 'ollama' }); store.approve(task.id, task.hash);
      const run = () => new Promise<string>((resolve, reject) => {
        const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/inference-worker.ts', '--once'], { cwd: process.cwd(), env });
        let out = '', err = '';
        child.stdout.on('data', value => out += value); child.stderr.on('data', value => err += value);
        child.on('error', reject); child.on('close', code => code === 0 ? resolve(out) : reject(new Error(err)));
      });
      const results = await Promise.all([run(), run()]);
      expect(results.filter(result => result.includes('"completed"'))).toHaveLength(1);
      expect(calls).toBe(1); expect(store.task(task.id).state).toBe('completed');
      expect(store.task(task.id).output).toContain('no live model inference');
      expect(business.verifyAudit()).toBe(true);
    } finally {
      business.close(); await new Promise<void>(resolve => server.close(() => resolve())); rmSync(directory, { recursive: true, force: true });
    }
  }, 20_000);
});
