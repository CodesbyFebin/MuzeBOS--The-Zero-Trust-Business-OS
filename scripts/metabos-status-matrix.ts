/** Writes docs/FEATURE-STATUS-MATRIX.md from the registry (run: npx tsx scripts/metabos-status-matrix.ts). */
import { writeFileSync } from 'node:fs';
import { MENUS, statusCounts } from '../lib/metabos/registry';
const c = statusCounts();
let out = `# Feature status matrix\n\nGenerated from lib/metabos/registry.ts. Do not edit by hand. "Available" means a MeTaBos operation works locally and has the listed tests; it is not a production-readiness claim. "Needs credentials" means local records work but the provider action is not wired.\n\nTotals: ${Object.entries(c).map(([k, v]) => `${k} ${v}`).join(', ')} (${Object.values(c).reduce((a, b) => a + b, 0)} pages).\n`;
for (const m of MENUS) {
  out += `\n## ${String(m.number).padStart(2, '0')} ${m.label} (${m.route})\n\n| Page | Route | Status | Permission | Evidence / dependencies |\n|---|---|---|---|---|\n`;
  for (const cl of m.clusters) for (const p of cl.pages) out += `| ${p.label} | ${p.route} | ${p.status} | ${(p.requiredPermissions ?? []).join(', ')} | ${(p.status === 'available' ? p.verificationEvidence ?? [] : p.dependencies).join('; ').replace(/\|/g, '/')} |\n`;
}
writeFileSync('docs/FEATURE-STATUS-MATRIX.md', out);
console.log(JSON.stringify(c));
