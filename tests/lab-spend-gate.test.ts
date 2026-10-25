import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

/**
 * AC-08-14: every paid client call under lib/lab/** (Apify `startRun`, the STT client's
 * `transcribe`, an embeddings provider `embed`) is lexically inside the `live` branch of a
 * `gatedCall(` (TypeScript AST walk). Spending has one door.
 */
const ROOT = path.join(process.cwd(), 'lib', 'lab');
const PAID = new Set(['startRun', 'transcribe', 'embedBatch']);

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : /\.ts$/.test(e.name) ? [path.join(dir, e.name)] : []));
}

function insideGatedLive(node: ts.Node): boolean {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if ((ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isMethodDeclaration(n)) && n.parent) {
      const prop = ts.isMethodDeclaration(n) ? n : n.parent;
      const name = ts.isPropertyAssignment(prop) || ts.isMethodDeclaration(prop) ? prop.name.getText() : null;
      if (name === 'live') {
        for (let c: ts.Node | undefined = prop.parent; c; c = c.parent) {
          if (ts.isCallExpression(c)) return /(^|\.)gatedCall(<.*>)?$/.test(c.expression.getText().replace(/<[^>]*>$/, ''));
        }
      }
    }
  }
  return false;
}

describe('AC-08-14: every paid client call is gated', () => {
  test('startRun, transcribe and embedBatch call sites sit inside a gatedCall live branch', () => {
    const offenders: string[] = [];
    let seen = 0;
    for (const f of files(ROOT)) {
      const src = ts.createSourceFile(f, fs.readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && PAID.has(node.expression.name.text)) {
          // definitions of the client methods themselves are not call sites
          const obj = node.expression.expression.getText();
          if (obj !== 'this') {
            seen++;
            if (!insideGatedLive(node)) offenders.push(`${path.relative(process.cwd(), f)}:${src.getLineAndCharacterOfPosition(node.getStart()).line + 1} ${node.getText().slice(0, 60)}`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(src);
    }
    expect(seen).toBeGreaterThanOrEqual(4);
    expect(offenders).toEqual([]);
  });
});
