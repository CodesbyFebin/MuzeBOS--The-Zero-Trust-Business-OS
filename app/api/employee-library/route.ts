import { NextResponse } from 'next/server';
import { businessAccess } from '@/lib/metabos/http';
import { BusinessError } from '@/lib/metabos/store';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import index from '@/lib/metabos/employee-index.json';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  try {
    businessAccess(req);
    const id = new URL(req.url).searchParams.get('document');
    if (!id) return NextResponse.json(index, { headers: { 'Cache-Control': 'no-store' } });
    // Resolve only exact identifiers from the immutable index, never caller paths.
    const template = index.templates.find(t => t.id === id);
    const role = index.roles.find(r => r.routines.some(t => t.id === id));
    const routine = role?.routines.find(t => t.id === id);
    const found = template || routine;
    const document = !found ? null : {
      name: template ? template.name : routine!.id,
      source: template ? template.source : role!.source,
      content: await readFile(path.join(process.cwd(), 'vendor/reference-documents', found.id + '.txt'), 'utf8'),
    };
    if (!document) throw new BusinessError('Reference document not found', 404);
    return NextResponse.json(document, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof BusinessError ? error.message : 'Unable to load reference library' }, { status: error instanceof BusinessError ? error.status : 500 });
  }
}
