/** Regenerates lib/muzebos/api-reference.generated.json from the real app/api route files. Run: npx tsx scripts/gen-api-reference.ts */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { scanApiRoutes } from '../lib/muzebos/api-reference';
const ref = scanApiRoutes(process.cwd());
writeFileSync(join(process.cwd(), 'lib/muzebos/api-reference.generated.json'), `${JSON.stringify(ref, null, 1)}\n`);
console.log(`api reference: ${ref.count} routes`);
