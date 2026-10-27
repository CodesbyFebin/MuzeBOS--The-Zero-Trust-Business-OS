/** Configure a fresh self-host instance without exposing a network setup endpoint. */
import { Writable } from 'node:stream';
import { createInterface } from 'node:readline/promises';
import { isConfigured, passwordShapeError, setPassword } from '../lib/auth';
async function main() {
  if (!process.stdin.isTTY) throw new Error('Use an interactive terminal for password setup.');
  if (isConfigured()) throw new Error('Operator already configured; use existing account settings.');
  const silentOutput = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  const input = createInterface({ input: process.stdin, output: silentOutput, terminal: true });
  try {
    process.stdout.write('New operator password (input hidden): ');
    const password = await input.question('');
    process.stdout.write('\nConfirm password (input hidden): ');
    const confirmation = await input.question(''); process.stdout.write('\n');
    const error = passwordShapeError(password);
    if (error) throw new Error(error);
    if (confirmation !== password) throw new Error('Passwords do not match.');
    setPassword(password); // Never print the returned session secret.
    console.log('Operator configured. Start the application and sign in.');
  } finally { input.close(); }
}
main().catch(e => { console.error(e instanceof Error ? e.message : 'Operator setup failed'); process.exitCode = 1; });
