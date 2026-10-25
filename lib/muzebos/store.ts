import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { dataPath } from '@/lib/paths';

const money = z.number().int().min(0).max(100_000_000);
const text = z.string().trim().min(1).max(160);
const customerSchema = z.object({ name: text, email: z.union([z.string().email(), z.literal('')]).default('') }).strict();
const productSchema = z.object({ name: text, sku: text, price: money, taxBps: z.number().int().min(0).max(10_000), stock: z.number().int().min(0).max(1_000_000) }).strict();
const draftSchema = z.object({ customerId: z.string().uuid(), lines: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1).max(10_000) }).strict()).min(1).max(100) }).strict();
const merchantSchema=z.object({name:text,address:z.string().trim().max(1000),taxId:z.string().trim().max(40),upi:z.union([z.string().regex(/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/),z.literal('')])}).strict();
export type Reminder={id:string;title:string;dueAt:string|null;status:'open'|'done';createdAt:string;completedAt:string|null};
export type Merchant=z.infer<typeof merchantSchema>;
export type Customer = { id: string; name: string; email: string };
export type Product = { id: string; name: string; sku: string; price: number; taxBps: number; stock: number };
export type Line = { productId: string; name: string; sku: string; quantity: number; unitPrice: number; taxBps: number; subtotal: number; tax: number; total: number };
export type InvoicePayload = { merchant: Merchant; customer: Customer; lines: Line[]; currency: 'INR'; subtotal: number; tax: number; total: number };
export type Order = { id: string; status: string; payload: InvoicePayload; hash: string; expiresAt: string; createdAt: string };
export type Invoice = { id: string; number: string; orderId: string; payload: InvoicePayload; createdAt: string; payment: 'pending' | 'manually_reconciled'; reference: string | null };
export type Audit = { seq: number; action: string; target: string; detail: string; createdAt: string; previousHash: string; hash: string };
export class BusinessError extends Error { constructor(message: string, public status = 400) { super(message); } }
export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const now = () => new Date().toISOString();

/** Single-operator, single workspace extension. No claimed multi-tenant boundary. */
export class BusinessStore {
  readonly db: Database.Database;
  constructor(filename: string) {
    if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new Database(filename);
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS mb_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS mb_customers(id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS mb_products(id TEXT PRIMARY KEY, name TEXT NOT NULL, sku TEXT NOT NULL UNIQUE, price INTEGER NOT NULL CHECK(price>=0), taxBps INTEGER NOT NULL CHECK(taxBps BETWEEN 0 AND 10000), stock INTEGER NOT NULL CHECK(stock>=0));
      CREATE TABLE IF NOT EXISTS mb_orders(id TEXT PRIMARY KEY, customerId TEXT NOT NULL REFERENCES mb_customers(id), status TEXT NOT NULL CHECK(status IN ('awaiting_review','issued','rejected')), payload TEXT NOT NULL, hash TEXT NOT NULL, expiresAt TEXT NOT NULL, createdAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS mb_invoices(id TEXT PRIMARY KEY, number TEXT NOT NULL UNIQUE, orderId TEXT NOT NULL UNIQUE REFERENCES mb_orders(id), payload TEXT NOT NULL, createdAt TEXT NOT NULL, payment TEXT NOT NULL DEFAULT 'pending' CHECK(payment IN ('pending','manually_reconciled')), reference TEXT);
      CREATE TABLE IF NOT EXISTS mb_movements(id TEXT PRIMARY KEY, productId TEXT NOT NULL REFERENCES mb_products(id), orderId TEXT NOT NULL REFERENCES mb_orders(id), quantity INTEGER NOT NULL, createdAt TEXT NOT NULL, UNIQUE(productId,orderId));
      CREATE TABLE IF NOT EXISTS mb_audit(seq INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, target TEXT NOT NULL, detail TEXT NOT NULL, createdAt TEXT NOT NULL, previousHash TEXT NOT NULL, hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS mb_commands(key TEXT PRIMARY KEY, requestHash TEXT NOT NULL, result TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS mb_reminders(id TEXT PRIMARY KEY,title TEXT NOT NULL,dueAt TEXT,status TEXT NOT NULL CHECK(status IN ('open','done')),createdAt TEXT NOT NULL,completedAt TEXT);
      INSERT OR IGNORE INTO mb_migrations VALUES(2, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
      CREATE TABLE IF NOT EXISTS mb_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT OR IGNORE INTO mb_migrations VALUES(1, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
    `);
  }
  close() { this.db.close(); }
  private audit(action: string, target: string, detail: string) {
    const last = this.db.prepare('SELECT hash FROM mb_audit ORDER BY seq DESC LIMIT 1').get() as { hash: string } | undefined;
    const event = { action, target, detail, createdAt: now(), previousHash: last?.hash ?? 'GENESIS' };
    this.db.prepare('INSERT INTO mb_audit(action,target,detail,createdAt,previousHash,hash) VALUES(@action,@target,@detail,@createdAt,@previousHash,@hash)').run({ ...event, hash: digest(event) });
  }
  private atomic<T>(work: () => T): T { return this.db.transaction(work).immediate(); }
  customers(): Customer[] { return this.db.prepare('SELECT * FROM mb_customers ORDER BY rowid DESC').all() as Customer[]; }
  products(): Product[] { return this.db.prepare('SELECT * FROM mb_products ORDER BY rowid DESC').all() as Product[]; }
  orders(): Order[] { return (this.db.prepare('SELECT id,status,payload,hash,expiresAt,createdAt FROM mb_orders ORDER BY rowid DESC').all() as (Omit<Order,'payload'> & {payload:string})[]).map(r => ({ ...r, payload: JSON.parse(r.payload) })); }
  invoices(): Invoice[] { return (this.db.prepare('SELECT * FROM mb_invoices ORDER BY rowid DESC').all() as (Omit<Invoice,'payload'> & {payload:string})[]).map(r => ({ ...r, payload: JSON.parse(r.payload) })); }
  evidence(): Audit[] { return this.db.prepare('SELECT * FROM mb_audit ORDER BY seq').all() as Audit[]; }
  verifyAudit() {
    let previous = 'GENESIS';
    for (const event of this.evidence()) {
      const { seq: _seq, hash, ...body } = event;
      if (body.previousHash !== previous || digest(body) !== hash) return false;
      previous = hash;
    }
    return true;
  }
  reminders(): Reminder[] { return this.db.prepare('SELECT * FROM mb_reminders ORDER BY createdAt DESC,rowid DESC').all() as Reminder[]; }
  reminder(input:unknown) {
    const parsed=z.object({title:z.string().trim().min(1).max(200),dueAt:z.string().datetime({offset:true}).nullable().default(null)}).strict().parse(input);
    const record:Reminder={id:randomUUID(),...parsed,status:'open',createdAt:now(),completedAt:null};
    return this.atomic(()=>{this.db.prepare('INSERT INTO mb_reminders VALUES(@id,@title,@dueAt,@status,@createdAt,@completedAt)').run(record);this.audit('reminder.created',record.id,record.title);return record;});
  }
  completeReminder(id:string) {
    z.string().uuid().parse(id);
    return this.atomic(()=>{const result=this.db.prepare("UPDATE mb_reminders SET status='done',completedAt=? WHERE id=? AND status='open'").run(now(),id);if(result.changes!==1)throw new BusinessError('Open reminder not found',409);this.audit('reminder.completed',id,'Operator marked reminder done');return {id};});
  }
  merchant(): Merchant {
    const row=this.db.prepare("SELECT value FROM mb_settings WHERE key='merchant'").get() as {value:string}|undefined;
    return row?JSON.parse(row.value):{name:'Your business',address:'',taxId:'',upi:''};
  }
  configure(input:unknown) {
    const merchant=merchantSchema.parse(input);
    return this.atomic(()=>{this.db.prepare("INSERT INTO mb_settings VALUES('merchant',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(merchant));this.audit('merchant.configured','merchant','Merchant invoice profile updated');return merchant;});
  }
  snapshot() {
    return { merchant:this.merchant(), customers: this.customers(), products: this.products(), orders: this.orders(), invoices: this.invoices(), evidence: this.evidence().reverse(), auditValid: this.verifyAudit(), mode: 'real' as const, currency: 'INR' as const };
  }
  customer(input: unknown) {
    const c = { id: randomUUID(), ...customerSchema.parse(input) };
    return this.atomic(() => { this.db.prepare('INSERT INTO mb_customers VALUES(@id,@name,@email)').run(c); this.audit('customer.created', c.id, c.name); return c; });
  }
  product(input: unknown) {
    const p = { id: randomUUID(), ...productSchema.parse(input) };
    return this.atomic(() => {
      if (this.db.prepare('SELECT id FROM mb_products WHERE sku=?').get(p.sku)) throw new BusinessError('SKU already exists',409);
      this.db.prepare('INSERT INTO mb_products VALUES(@id,@name,@sku,@price,@taxBps,@stock)').run(p);
      this.audit('product.created',p.id,`${p.sku}: opening stock ${p.stock}`); return p;
    });
  }
  draft(input: unknown) {
    const parsed = draftSchema.parse(input);
    return this.atomic(() => {
      const customer = this.db.prepare('SELECT * FROM mb_customers WHERE id=?').get(parsed.customerId) as Customer | undefined;
      if (!customer) throw new BusinessError('Customer not found',404);
      const counts = new Map<string,number>();
      for (const l of parsed.lines) counts.set(l.productId,(counts.get(l.productId) ?? 0)+l.quantity);
      const lines: Line[] = [...counts].map(([id,quantity]) => {
        const p = this.db.prepare('SELECT * FROM mb_products WHERE id=?').get(id) as Product | undefined;
        if (!p) throw new BusinessError('Product not found',404);
        if (p.stock < quantity) throw new BusinessError(`Insufficient stock: ${p.name}`,409);
        const subtotal = p.price*quantity;
        // Integer half-up rounding per line. Bounds keep every operation exact.
        const tax = Number((BigInt(subtotal)*BigInt(p.taxBps)+5000n)/10000n);
        return { productId:p.id,name:p.name,sku:p.sku,quantity,unitPrice:p.price,taxBps:p.taxBps,subtotal,tax,total:subtotal+tax };
      });
      const payload: InvoicePayload = { merchant:this.merchant(), customer, lines, currency:'INR', subtotal:lines.reduce((s,l)=>s+l.subtotal,0), tax:lines.reduce((s,l)=>s+l.tax,0), total:lines.reduce((s,l)=>s+l.total,0) };
      if (!Number.isSafeInteger(payload.total) || payload.total > 100_000_000_000) throw new BusinessError('Order amount exceeds supported limit');
      const order: Order = { id:randomUUID(), status:'awaiting_review',payload,hash:digest(payload),expiresAt:new Date(Date.now()+30*60_000).toISOString(),createdAt:now() };
      this.db.prepare('INSERT INTO mb_orders VALUES(@id,@customerId,@status,@payload,@hash,@expiresAt,@createdAt)').run({...order,customerId:customer.id,payload:JSON.stringify(payload)});
      this.audit('approval.requested',order.id,`Invoice draft ${order.hash}; expires ${order.expiresAt}`);
      return order;
    });
  }
  issue(id: string, expectedHash: string) {
    return this.atomic(() => {
      const order = this.orders().find(o=>o.id===id);
      if (!order) throw new BusinessError('Order not found',404);
      if (order.status !== 'awaiting_review') throw new BusinessError('Approval already consumed',409);
      if (order.expiresAt <= now()) throw new BusinessError('Approval expired; create a fresh draft',409);
      if (order.hash !== expectedHash || digest(order.payload) !== expectedHash) throw new BusinessError('Reviewed invoice payload changed',409);
      for (const line of order.payload.lines) {
        const result = this.db.prepare('UPDATE mb_products SET stock=stock-? WHERE id=? AND stock>=?').run(line.quantity,line.productId,line.quantity);
        if (result.changes !== 1) throw new BusinessError(`Stock changed: ${line.name}. No invoice issued.`,409);
        this.db.prepare('INSERT INTO mb_movements VALUES(?,?,?,?,?)').run(randomUUID(),line.productId,id,-line.quantity,now());
      }
      const count = (this.db.prepare('SELECT COUNT(*) AS n FROM mb_invoices').get() as {n:number}).n;
      const invoice: Invoice = {id:randomUUID(),number:`MB-${String(count+1).padStart(6,'0')}`,orderId:id,payload:order.payload,createdAt:now(),payment:'pending',reference:null};
      this.db.prepare('INSERT INTO mb_invoices VALUES(@id,@number,@orderId,@payload,@createdAt,@payment,@reference)').run({...invoice,payload:JSON.stringify(invoice.payload)});
      this.db.prepare("UPDATE mb_orders SET status='issued' WHERE id=?").run(id);
      this.audit('invoice.issued',invoice.id,`Operator approved ${expectedHash}; ${invoice.number}; INR minor units ${invoice.payload.total}; stock deducted atomically`);
      return invoice;
    });
  }
  reject(id: string) {
    return this.atomic(() => {
      const result=this.db.prepare("UPDATE mb_orders SET status='rejected' WHERE id=? AND status='awaiting_review'").run(id);
      if(result.changes!==1) throw new BusinessError('Pending approval not found',409);
      this.audit('approval.rejected',id,'Operator rejected draft; no stock movement'); return {id};
    });
  }
  reconcile(id: string, reference: string) {
    text.parse(reference);
    return this.atomic(() => {
      const result=this.db.prepare("UPDATE mb_invoices SET payment='manually_reconciled',reference=? WHERE id=? AND payment='pending'").run(reference,id);
      if(result.changes!==1) throw new BusinessError('Pending invoice not found',409);
      this.audit('payment.manually_reconciled',id,`Operator-entered reference: ${reference}. Not provider-verified.`); return {id};
    });
  }
  /** Replay the same command safely, reject reuse with changed input. */
  command(key: string, input: unknown, execute: () => unknown) {
    z.string().uuid().parse(key);
    return this.atomic(() => {
      const requestHash=digest(input);
      const prior=this.db.prepare('SELECT * FROM mb_commands WHERE key=?').get(key) as {requestHash:string;result:string}|undefined;
      if(prior) {
        if(prior.requestHash!==requestHash) throw new BusinessError('Idempotency key reused for a different command',409);
        return JSON.parse(prior.result);
      }
      const result=execute();
      this.db.prepare('INSERT INTO mb_commands VALUES(?,?,?)').run(key,requestHash,JSON.stringify(result));return result;
    });
  }
}
let singleton: BusinessStore | undefined;
export function businessStore() {
  // Stable real store; upstream filming switches must never replace business records.
  const filename=process.env.MUZEBOS_DB || dataPath('muzebos-business.db').replace(/demo-data(?=[/\\])/,'data');
  singleton ??= new BusinessStore(filename);
  return singleton;
}
