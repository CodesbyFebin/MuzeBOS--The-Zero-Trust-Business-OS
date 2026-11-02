import { memberRead } from '@/lib/metabos/member-read';
import { NextResponse } from 'next/server';
import { businessAccess } from '@/lib/metabos/http';
import { businessStore, BusinessError } from '@/lib/metabos/store';
export const dynamic = 'force-dynamic';
export function GET(req: Request) {
  try {
    memberRead(req, 'deals.write');
    const store = businessStore();
    return NextResponse.json({ bookings: store.bookings(), customers: store.customers() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof BusinessError ? error.message : 'Unable to load bookings' }, { status: error instanceof BusinessError ? error.status : 500 });
  }
}
