export const inr = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
export const toPaise = (rupees: string) => Math.round(Number(rupees) * 100);
export const postTo = (url: string) => async (body: object) => { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok) throw new Error(j.error ?? 'Request failed'); return j; };
export const InferenceNote = () => <p className="mb-muted">Model drafts are filed as inference tasks. Approve one in <a href="/workspace/brain/inference">the inference queue</a> (Jev), then load it here. Nothing is applied automatically.</p>;
