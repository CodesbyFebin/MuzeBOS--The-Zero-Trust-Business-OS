/**
 * AC-01-34 one definition per type (D13): no name declared in lib/lab/view/** is also declared in a
 * domain folder, and no lib/lab/view file declares a domain builder. Uses the TypeScript compiler's
 * parser, so only real declarations count (re-exports such as the barrel's are not declarations).
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const files = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(d, e.name)) : e.name.endsWith('.ts') ? [path.join(d, e.name)] : []));

function declared(file: string): string[] {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const out: string[] = [];
  for (const st of sf.statements) {
    const exported = ts.canHaveModifiers(st) && (ts.getModifiers(st) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) continue;
    if ((ts.isTypeAliasDeclaration(st) || ts.isInterfaceDeclaration(st) || ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isEnumDeclaration(st)) && st.name) out.push(st.name.text);
    if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) out.push(d.name.text);
  }
  return out;
}

describe('AC-01-34 one definition per type', () => {
  const view = files(path.join(ROOT, 'lib/lab/view'));
  const domain = ['measure', 'radar', 'ledger', 'gen', 'setup'].flatMap((d) => files(path.join(ROOT, 'lib/lab', d)));
  const domainNames = new Map<string, string>();
  for (const f of domain) for (const n of declared(f)) domainNames.set(n, path.relative(ROOT, f));

  it('no 01 declaration shares a name with a domain declaration', () => {
    const clashes: string[] = [];
    for (const f of view) for (const n of declared(f)) if (domainNames.has(n)) clashes.push(`${n}: ${path.relative(ROOT, f)} and ${domainNames.get(n)}`);
    expect(clashes).toEqual([]);
  });
  it('no lib/lab/view file declares a domain builder', () => {
    const BUILDERS = ['radarView', 'eventSheetView', 'windowCardView', 'radarTiles', 'ledgerView', 'ledgerLine', 'predictionChip', 'studioView', 'ideaSheetView', 'scriptSheetView', 'askView', 'setupView'];
    for (const f of view) for (const n of declared(f)) expect(BUILDERS, path.relative(ROOT, f)).not.toContain(n);
  });
});
