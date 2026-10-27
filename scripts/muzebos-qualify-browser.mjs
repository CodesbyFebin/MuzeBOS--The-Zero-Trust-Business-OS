/** Run production browser flows against fresh disposable local data. Build first. */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = mkdtempSync(path.join(tmpdir(), 'muzebos-browser-'));
const socket = createServer();
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
const base = `http://127.0.0.1:${port}`;
const env = { ...process.env, GLADOS_DB: path.join(directory, 'workspace.sqlite'), MUZEBOS_DB: path.join(directory, 'business.sqlite'), GLADOS_ENV_LOCAL: path.join(directory, 'unused-env'), GLADOS_MODE_FILE: path.join(directory, 'mode'), GLADOS_DEFAULT_MODE: 'real', GLADOS_WARM: '0', GLADOS_CRON: '0', CREATIVE_ENGINE_MIGRATE: '0' };
const server = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', String(port)], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '', completed = false;
server.stdout.on('data', chunk => { log = (log + chunk.toString()).slice(-12000); });
server.stderr.on('data', chunk => { log = (log + chunk.toString()).slice(-12000); });
server.on('error', error => { log += error.message; });
try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null) throw new Error('Production server exited before becoming ready');
    try { const response = await fetch(base + '/api/bookings', { signal: AbortSignal.timeout(1000) }); if (response.ok) { ready = true; break; } } catch { /* wait for startup */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error('Production server startup timed out');
  process.env.TEST_BASE_URL = base;
  process.env.TEST_JEV_DB = env.MUZEBOS_DB;
  await import('./muzebos-browser.mjs');
  await import('./muzebos-mission-browser.mjs');
  await import('./muzebos-integrations-browser.mjs');
  await import('./muzebos-inference-browser.mjs');
  completed = true;
} catch (error) { console.error(log); throw error; }
finally {
  server.kill('SIGTERM');
  await Promise.race([new Promise(resolve => server.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 3000))]);
  if (server.exitCode === null) server.kill('SIGKILL');
  if (completed) rmSync(directory, { recursive: true, force: true });
  else console.error('Disposable browser evidence:', directory);
}
