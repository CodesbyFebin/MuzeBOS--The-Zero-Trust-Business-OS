import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { BusinessStore, digest } from '@/lib/muzebos/store';
import { businessAccess } from '@/lib/muzebos/http';

const stores:BusinessStore[]=[];
const dirs:string[]=[];
function fresh(filename=':memory:') { const s=new BusinessStore(filename);stores.push(s);return s; }
function fixture(s:BusinessStore,stock=5) {
 const c=s.customer({name:'Kochi Studio',email:'owner@example.com'});
 const p=s.product({name:'Coffee',sku:'COF-01',price:19999,taxBps:1800,stock});
 return {c,p,draft:()=>s.draft({customerId:c.id,lines:[{productId:p.id,quantity:2}]})};
}
afterEach(()=>{for(const s of stores.splice(0)){if(s.db.open)s.close();}for(const d of dirs.splice(0))rmSync(d,{recursive:true,force:true});vi.useRealTimers();vi.unstubAllEnvs();});
describe('MuzeBOS real business workflow',()=>{
 it('starts blank and applies its migration idempotently',()=>{const s=fresh();expect(s.snapshot()).toMatchObject({customers:[],products:[],orders:[],invoices:[],evidence:[],auditValid:true});expect(s.db.prepare('SELECT version FROM mb_migrations ORDER BY version').all()).toEqual([{version:1},{version:2},{version:3},{version:4},{version:5},{version:6},{version:7},{version:8}]);});
 it('calculates exact line tax, binds approval and atomically issues with pending payment',()=>{
  const s=fresh(),f=fixture(s),o=f.draft();expect(o.payload).toMatchObject({subtotal:39998,tax:7200,total:47198});expect(s.products()[0].stock).toBe(5);
  const invoice=s.issue(o.id,o.hash);expect(invoice.payload).toEqual(o.payload);expect(invoice.payment).toBe('pending');expect(s.products()[0].stock).toBe(3);expect(s.verifyAudit()).toBe(true);expect(s.orders()[0].status).toBe('issued');
 });
 it('rejects changed hashes, replay, and expired approval',()=>{
  const s=fresh(),f=fixture(s),o=f.draft();expect(()=>s.issue(o.id,'0'.repeat(64))).toThrow('changed');s.issue(o.id,o.hash);expect(()=>s.issue(o.id,o.hash)).toThrow('consumed');
  const second=f.draft();vi.useFakeTimers();vi.setSystemTime(Date.now()+31*60_000);expect(()=>s.issue(second.id,second.hash)).toThrow('expired');expect(s.invoices()).toHaveLength(1);
 });
 it('rejects tampering with the persisted approved payload',()=>{
  const s=fresh(),f=fixture(s),o=f.draft();o.payload.total=1;s.db.prepare('UPDATE mb_orders SET payload=? WHERE id=?').run(JSON.stringify(o.payload),o.id);expect(()=>s.issue(o.id,o.hash)).toThrow('changed');expect(s.products()[0].stock).toBe(5);
 });
 it('prevents overselling between separately opened connections',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'mb-stock-'));dirs.push(dir);const file=path.join(dir,'db.sqlite');const s=fresh(file),f=fixture(s,2),o1=f.draft(),o2=f.draft();const second=fresh(file);
  s.issue(o1.id,o1.hash);expect(()=>second.issue(o2.id,o2.hash)).toThrow('Stock changed');expect(second.products()[0].stock).toBe(0);expect(second.invoices()).toHaveLength(1);expect(second.orders().find(o=>o.id===o2.id)?.status).toBe('awaiting_review');
 });
 it('rolls back earlier stock changes when a later line fails',()=>{
  const s=fresh(),f=fixture(s,2);const p=s.product({name:'Tea',sku:'TEA',price:100,taxBps:0,stock:1});
  const o=s.draft({customerId:f.c.id,lines:[{productId:f.p.id,quantity:1},{productId:p.id,quantity:1}]});
  s.db.prepare('UPDATE mb_products SET stock=0 WHERE id=?').run(p.id);
  expect(()=>s.issue(o.id,o.hash)).toThrow('Stock changed');expect(s.products().find(x=>x.id===f.p.id)?.stock).toBe(2);expect(s.invoices()).toHaveLength(0);expect(s.db.prepare('SELECT * FROM mb_movements').all()).toHaveLength(0);
 });
 it('aggregates duplicate lines before stock checks',()=>{const s=fresh(),f=fixture(s,2);expect(()=>s.draft({customerId:f.c.id,lines:[{productId:f.p.id,quantity:2},{productId:f.p.id,quantity:1}]})).toThrow('Insufficient stock');});
 it('keeps issued snapshots stable after catalog changes and requires explicit manual reconciliation',()=>{
  const s=fresh(),f=fixture(s),o=f.draft(),invoice=s.issue(o.id,o.hash);s.db.prepare('UPDATE mb_products SET price=1,name=? WHERE id=?').run('Changed',f.p.id);expect(s.invoices()[0].payload.total).toBe(47198);
  s.reconcile(invoice.id,'UTR-operator-entered');expect(s.invoices()[0].payment).toBe('manually_reconciled');expect(s.evidence().at(-1)?.detail).toContain('Not provider-verified');expect(()=>s.reconcile(invoice.id,'again')).toThrow();
 });
 it('makes retry idempotent but rejects changed requests',()=>{const s=fresh(),key=randomUUID(),input={name:'One'};const run=()=>s.customer(input);const first=s.command(key,input,run);expect(s.command(key,input,run)).toEqual(first);expect(s.customers()).toHaveLength(1);expect(()=>s.command(key,{name:'Two'},run)).toThrow('different command');});
 it('rejects invalid money, stock, SKU duplicates and malformed payloads',()=>{const s=fresh();expect(()=>s.product({name:'x',sku:'x',price:.1,taxBps:0,stock:1})).toThrow();expect(()=>s.product({name:'x',sku:'x',price:100,taxBps:0,stock:-1})).toThrow();const f=fixture(s);expect(()=>s.product({...f.p,id:undefined})).toThrow();expect(()=>s.product({name:'other',sku:f.p.sku,price:1,taxBps:0,stock:0})).toThrow('SKU already');});
 it('detects edited audit records',()=>{const s=fresh();s.customer({name:'Customer'});s.db.prepare("UPDATE mb_audit SET detail='edited' WHERE seq=1").run();expect(s.verifyAudit()).toBe(false);});
 it('rejects a draft without changing stock',()=>{const s=fresh(),f=fixture(s),o=f.draft();s.reject(o.id);expect(s.products()[0].stock).toBe(5);expect(()=>s.issue(o.id,o.hash)).toThrow();});
 it('persists across restart and restores an online SQLite backup',async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'mb-backup-'));dirs.push(dir);const file=path.join(dir,'db.sqlite');const s=fresh(file),f=fixture(s),o=f.draft();s.issue(o.id,o.hash);const expected=s.snapshot();await s.db.backup(path.join(dir,'backup.sqlite'));s.close();const reopened=fresh(file);expect(reopened.snapshot()).toEqual(expected);const restored=fresh(path.join(dir,'backup.sqlite'));expect(restored.snapshot()).toEqual(expected);
 });
 it('snapshots merchant details into drafts and preserves them after profile updates',()=>{const s=fresh();s.configure({name:'Kochi Coffee',address:'Kochi',taxId:'merchant-supplied',upi:'coffee@bank'});const f=fixture(s),o=f.draft();s.configure({name:'Changed',address:'',taxId:'',upi:''});const inv=s.issue(o.id,o.hash);expect(inv.payload.merchant.name).toBe('Kochi Coffee');expect(inv.payload.merchant.upi).toBe('coffee@bank');});
 it('uses an order-sensitive digest for exact snapshot binding',()=>{expect(digest({a:1})).not.toBe(digest({a:2}));});
});
describe('commerce route boundary',()=>{
 it('rejects missing origin and cross-site mutations, accepts local same-origin',()=>{
  const url='http://localhost:4100/api/business';
  expect(()=>businessAccess(new Request(url,{method:'POST',headers:{host:'localhost:4100'}}))).toThrow('Same-origin');
  expect(()=>businessAccess(new Request(url,{method:'POST',headers:{host:'localhost:4100',origin:'https://evil.example'}}))).toThrow('Same-origin');
  expect(()=>businessAccess(new Request(url,{method:'POST',headers:{host:'localhost:4100',origin:'http://localhost:4100'}}))).not.toThrow();
 });
 it('accepts the browser Host when Next rewrites its internal URL',()=>{expect(()=>businessAccess(new Request('http://localhost:4100/api/business',{method:'POST',headers:{host:'127.0.0.1:4100',origin:'http://127.0.0.1:4100'}}))).not.toThrow();});
 it('rejects remote access without configuration even with spoofed forwarded loopback',()=>{
  expect(()=>businessAccess(new Request('http://remote.example/api/business',{headers:{host:'remote.example','x-forwarded-host':'localhost'}}))).toThrow('Configure an operator');
 });
});

describe('HTTP command handlers',()=>{
 it('validates and persists requests, enforces idempotency, rejects CSRF and oversized input',async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'mb-http-'));dirs.push(dir);vi.stubEnv('MUZEBOS_DB',path.join(dir,'http.sqlite'));
  const {GET,POST}=await import('@/app/api/business/route');
  const url='http://localhost:4100/api/business',key=randomUUID();
  const request=(body:string,origin='http://localhost:4100')=>new Request(url,{method:'POST',headers:{host:'localhost:4100',origin,'content-type':'application/json','idempotency-key':key},body});
  const body=JSON.stringify({action:'customer',data:{name:'HTTP customer',email:''}});
  const result=await POST(request(body));expect(result.status).toBe(200);
  expect((await POST(request(body))).status).toBe(200);
  expect((await POST(request(body,'https://evil.example'))).status).toBe(403);
  expect((await POST(request('x'.repeat(64001)))).status).toBe(413);
  expect((await POST(request('{}'))).status).toBe(400);
  expect((await POST(request(JSON.stringify({action:'customer',data:{name:'different'}})))).status).toBe(409);
  const snapshot=await (await GET(new Request(url,{headers:{host:'localhost:4100'}}))).json();expect(snapshot.customers).toHaveLength(1);expect(snapshot.customers[0].name).toBe('HTTP customer');
 });
 it('requires the operator session after password setup',async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'mb-auth-'));dirs.push(dir);vi.stubEnv('GLADOS_ENV_LOCAL',path.join(dir,'.env.local'));
  const {setPassword}=await import('@/lib/auth');const secret=setPassword('test-password-never-used-remotely');
  const url='http://localhost:4100/api/business';
  expect(()=>businessAccess(new Request(url,{headers:{host:'localhost:4100'}}))).toThrow('authentication');
  expect(()=>businessAccess(new Request(url,{headers:{host:'localhost:4100',cookie:`glados_session=${secret}`}}))).not.toThrow();
 });
});
