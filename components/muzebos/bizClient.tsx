export const inr = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
import { useEffect, useState } from 'react';
export const toPaise = (rupees: string) => Math.round(Number(rupees) * 100);
export const postTo = (url: string) => async (body: object) => { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok) throw new Error(j.error ?? 'Request failed'); return j; };
export const InferenceNote = () => <p className="mb-muted">Model drafts are filed as inference tasks. Approve one in <a href="/workspace/brain/inference">the inference queue</a> (Jev), then load it here. Nothing is applied automatically.</p>;
export type Me = { id: string; name: string; role: 'owner' | 'manager' | 'member'; department: string } | null;
/** The signed-in member for this browser (server-checked cookie), or null. */
export function useMe() {
  const [me, setMe] = useState<Me | undefined>(undefined);
  useEffect(() => { fetch('/api/muzebos/auth').then((r) => r.json()).then((j) => setMe(j.me ?? null)).catch(() => setMe(null)); }, []);
  return me;
}
export const SignedInAs = ({ me }: { me: Me | undefined }) => me === undefined ? null : me ? <p className="mb-muted" data-testid="signed-in-as">Signed in as {me.name} ({me.role}, {me.department}). <a href="/workspace/account/sign-in">Account</a></p> : <p className="mb-alert" role="status">You are not signed in. <a href="/workspace/account/sign-in">Sign in</a> to submit, approve or change records; you can still read this page.</p>;
