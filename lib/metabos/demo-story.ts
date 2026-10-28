/**
 * Demo seed for the 5-step story. Fictional records, labelled DEMO in the evidence log.
 *   1 Command Center shows friction   2 Overdue invoice → reminder draft (fixture unless a key is set)
 *   3 Jev approves the exact text     4 A payment claim arrives; a person matches it with a bank reference
 *   5 Evidence/Activity shows every step and the chain verifies
 */
import { BusinessError, type BusinessStore } from './store';
import { setTermsDays } from './overdue-core';
import { addPromise, submitProof } from './command-center';

export function seedDemoStory(store: BusinessStore) {
  if (store.invoices().length || store.products().length || store.customers().length) throw new BusinessError('Refusing to seed: this database already has records', 409);
  store.appendEvidence('demo.seeded', 'demo', 'DEMO data: fictional customers and products for the 5-step story');
  store.configure({ name: 'Demo Kirana Store', address: 'Fictional address, Kochi', taxId: '', upi: 'demo-kirana@okdemo' });
  const kaveri = store.customer({ name: 'Kaveri Traders (demo)', email: 'kaveri@example.com' });
  const anand = store.customer({ name: 'Anand Stores (demo)', email: 'anand@example.com' });
  const rice = store.product({ name: 'Rice 5kg', sku: 'DEMO-RICE5', price: 45000, taxBps: 500, stock: 12 });
  const oil = store.product({ name: 'Coconut oil 1L', sku: 'DEMO-OIL1', price: 22000, taxBps: 500, stock: 4 });
  const issue = (customerId: string, productId: string, quantity: number) => { const o = store.draft({ customerId, lines: [{ productId, quantity }] }); store.approve(o.id, o.hash); return store.issue(o.id, o.hash); };
  const overdue = issue(kaveri.id, rice.id, 2);       // INR 945.00, will be overdue (step 2)
  const claimed = issue(anand.id, oil.id, 1);         // INR 231.00, a claim arrives (step 4)
  store.draft({ customerId: anand.id, lines: [{ productId: rice.id, quantity: 1 }] }); // awaiting review
  setTermsDays(store, 0); // demo terms: due on issue, so step 2 has a finding without backdating records
  addPromise(store, { party: 'Kaveri Traders (demo)', text: `Pay ${overdue.number}`, dueAt: new Date(Date.now() + 2 * 86_400_000).toISOString(), invoiceId: overdue.id });
  const proof = submitProof(store, { reference: 'DEMOUTR0001', amount: claimed.payload.total, payer: 'Anand Stores (demo)', note: 'DEMO claim' });
  return { overdueInvoiceId: overdue.id, claimedInvoiceId: claimed.id, proofId: proof.id };
}
