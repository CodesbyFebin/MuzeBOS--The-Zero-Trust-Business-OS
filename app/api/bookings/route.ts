import { NextResponse } from 'next/server';
import { businessAccess } from '@/lib/muzebos/http';
import { businessStore, BusinessError } from '@/lib/muzebos/store';
export const dynamic = 'force-dynamic';
export function GET(req: Request) {
  try {
    businessAccess(req);
    const store = businessStore();
    return NextResponse.json({ bookings: store.bookings(), customers: store.customers() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof BusinessError ? error.message : 'Unable to load bookings' }, { status: error instanceof BusinessError ? error.status : 500 });
  }
}
