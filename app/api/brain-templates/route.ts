import { memberRead } from '@/lib/metabos/member-read';
import { NextResponse } from 'next/server';
import { businessAccess } from '@/lib/metabos/http';
import { businessStore, BusinessError } from '@/lib/metabos/store';
import { FOUNDER_TEMPLATES, BRAIN_ROLES } from '@/lib/metabos/brain-templates';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/** Read model for the Brain templates screen. Writes go through POST /api/business (idempotent commands). */
export async function GET(req: Request) {
  try {
    memberRead(req);
    const store = businessStore();
    return NextResponse.json({ templates: FOUNDER_TEMPLATES, roles: BRAIN_ROLES, role: store.rolePreference(), favorites: store.templateFavorites(), drafts: store.brainDrafts() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof BusinessError ? e.message : 'Templates unavailable' }, { status: e instanceof BusinessError ? e.status : 503 });
  }
}
