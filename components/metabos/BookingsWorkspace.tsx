'use client';
import { useEffect, useState } from 'react';
import type { Booking, Customer } from '@/lib/metabos/store';

export function BookingsWorkspace() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [resource, setResource] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  async function load(signal?: AbortSignal) {
    const response = await fetch('/api/bookings', { cache: 'no-store', signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to load bookings');
    setBookings(data.bookings); setCustomers(data.customers); setLoaded(true);
  }
  useEffect(() => { const controller = new AbortController(); load(controller.signal).catch(e => { if (e.name !== 'AbortError') setError(e.message); }); return () => controller.abort(); }, []);
  async function command(payload: unknown) {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/business', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Booking operation failed');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Booking operation failed'); }
    finally { setBusy(false); }
  }
  return <div className="mb-console mb-category"><span className="mb-eyebrow">ORD / LOCAL RESERVATIONS</span><h1>Bookings & appointments</h1><p className="mb-muted">Confirmed reservations prevent overlapping times for the same resource. No public booking portal, payments or automatic notifications are connected.</p>{error && <p className="mb-alert" role="alert">{error}</p>}
    <form className="mb-panel mb-source-form" onSubmit={e => { e.preventDefault(); if (start && end) void command({ action: 'booking', data: { customerId, resource, startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() } }); }}>
      <h2>Reserve a resource</h2><label>Customer<select required value={customerId} onChange={e => setCustomerId(e.target.value)}><option value="">Select customer</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Resource name<input required maxLength={120} value={resource} onChange={e => setResource(e.target.value)} placeholder="Consultation room"/></label>
      <label>Starts at · local time<input required type="datetime-local" value={start} onChange={e => setStart(e.target.value)}/></label><label>Ends at · local time<input required type="datetime-local" value={end} onChange={e => setEnd(e.target.value)}/></label>
      <button className="mb-primary mb-button" disabled={busy || !loaded || !customers.length}>{busy ? 'Saving…' : 'Create booking'}</button><a className="mb-link" href="/business?view=customers">Manage customers</a>
    </form><section className="mb-panel"><h2>Reservation ledger</h2>{!loaded ? <p>Loading reservations…</p> : !bookings.length ? <p className="mb-muted">No reservations yet.</p> : bookings.map(b => <article className="mb-booking-row" key={b.id}><div><strong>{b.resource}</strong><p>{customers.find(c => c.id === b.customerId)?.name} · {b.status}</p><p className="mb-muted">{new Date(b.startsAt).toLocaleString()} – {new Date(b.endsAt).toLocaleString()}</p></div>{b.status === 'confirmed' && <button className="mb-button" disabled={busy} onClick={() => void command({ action: 'cancelBooking', id: b.id })}>Cancel booking</button>}</article>)}</section>
  </div>;
}
