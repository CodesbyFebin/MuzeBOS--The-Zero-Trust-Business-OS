/** Child process for the concurrent-issuance test: waits for a shared start time, then issues. */
import { BusinessStore, BusinessError } from '@/lib/muzebos/store';
const [file, startAt, ...pairs] = process.argv.slice(2);
const store = new BusinessStore(file);
while (Date.now() < Number(startAt)) { /* spin to a common start */ }
const out: string[] = [];
for (const pair of pairs) {
  const [id, hash] = pair.split(':');
  try { out.push(`ok:${store.issue(id, hash).number}`); } catch (e) { out.push(e instanceof BusinessError ? `refused:${e.status}` : `error:${String(e)}`); }
}
store.close();
process.stdout.write(JSON.stringify(out));
