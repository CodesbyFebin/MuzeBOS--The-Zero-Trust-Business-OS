import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { BusinessError, BusinessStore, digest } from '@/lib/muzebos/store';
import { chooseRoute, fingerprint, routes } from './routing';
import { BROWSER_CONTEXT } from './types';
import type { InferencePayload, InferenceTask, Lane, Lease, Route } from './types';
const taskInput = z.object({ title: z.string().trim().min(1).max(160), prompt: z.string().trim().min(1).max(12000), kind: z.enum(['draft', 'analysis', 'plan', 'code']), lane: z.enum(['auto', 'browser', 'ollama', 'meta', 'openrouter', 'openclaw', 'muse-code']).default('auto'), maxTokens: z.number().int().min(32).max(2048).default(512), paidConsent: z.boolean().default(false) }).strict();
const usageInput = z.object({ promptTokens: z.number().int().min(0).max(1_000_000).optional(), completionTokens: z.number().int().min(0).max(1_000_000).optional() }).strict();
type Row = Omit<InferenceTask, 'payload' | 'usage'> & { payload: string; usage: string | null; leaseToken: string | null };
const decode = ({ payload, usage, leaseToken: _, ...row }: Row): InferenceTask => ({ ...row, payload: JSON.parse(payload), usage: usage ? JSON.parse(usage) : null });

/** Durable single-operator inference drafts. No arbitrary tool or shell execution. */
export class InferenceStore {
  constructor(readonly business: BusinessStore, readonly catalog: () => Route[] = routes, readonly clock: () => number = Date.now) {
    business.db.exec(`
      CREATE TABLE IF NOT EXISTS mb_inference_migrations(version INTEGER PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS mb_inference_tasks(
        id TEXT PRIMARY KEY,payload TEXT NOT NULL,hash TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('awaiting_approval','queued','running','completed','failed','cancelled')),
        approvedHash TEXT,approvalExpires TEXT,attempts INTEGER NOT NULL DEFAULT 0,
        output TEXT,outputHash TEXT,error TEXT,usage TEXT,createdAt TEXT NOT NULL,
        startedAt TEXT,completedAt TEXT,workerId TEXT,leaseToken TEXT,leaseUntil TEXT
      );
      CREATE INDEX IF NOT EXISTS mb_inference_queue ON mb_inference_tasks(state,createdAt);
      CREATE TABLE IF NOT EXISTS mb_inference_workers(id TEXT PRIMARY KEY,transport TEXT NOT NULL,lastSeen TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS mb_inference_attempts(taskId TEXT NOT NULL,attempt INTEGER NOT NULL,maxTokens INTEGER NOT NULL,createdAt TEXT NOT NULL,PRIMARY KEY(taskId,attempt));
      CREATE TABLE IF NOT EXISTS mb_inference_delegations(parentId TEXT PRIMARY KEY REFERENCES mb_inference_tasks(id));
      INSERT OR IGNORE INTO mb_inference_migrations VALUES(1);
    `);
  }
  private now() { return new Date(this.clock()).toISOString(); }
  private atomic<T>(work: () => T): T { return this.business.db.transaction(work).immediate(); }
  private event(action: string, target: string, detail: string) {
    const last = this.business.db.prepare('SELECT hash FROM mb_audit ORDER BY seq DESC LIMIT 1').get() as { hash: string } | undefined;
    const event = { action: `inference.${action}`, target, detail, createdAt: this.now(), previousHash: last?.hash || 'GENESIS' };
    this.business.db.prepare('INSERT INTO mb_audit(action,target,detail,createdAt,previousHash,hash) VALUES(@action,@target,@detail,@createdAt,@previousHash,@hash)').run({ ...event, hash: digest(event) });
  }
  private row(id: string): Row {
    z.string().uuid().parse(id);
    const row = this.business.db.prepare('SELECT * FROM mb_inference_tasks WHERE id=?').get(id) as Row | undefined;
    if (!row) throw new BusinessError('Inference task not found', 404);
    return row;
  }
  task(id: string) { return decode(this.row(id)); }
  private insert(input: unknown, parent?: InferenceTask): InferenceTask {
    const parsed = taskInput.parse(input);
    const id = randomUUID();
    const { tier, route } = chooseRoute(parsed.kind, parsed.prompt, parsed.lane as Lane, this.catalog());
    if (route.provider === 'browser' && Buffer.byteLength(parsed.prompt, 'utf8') + parsed.maxTokens + 256 > BROWSER_CONTEXT) throw new BusinessError('Browser input exceeds its bounded context; shorten it or select a server route');
    const payload: InferencePayload = { title: parsed.title, prompt: parsed.prompt, agent: ({ draft: 'clerk', analysis: 'analyst', plan: 'planner', code: 'code-reviewer' })[parsed.kind], policyVersion: 1, kind: parsed.kind, tier, provider: route.provider, model: route.model, maxTokens: parsed.maxTokens, paidConsent: parsed.paidConsent, configHash: route.configHash, parentId: parent?.id || null, depth: parent ? parent.payload.depth + 1 : 0, rootId: parent?.payload.rootId || id };
    if (payload.depth > 2) throw new BusinessError('Delegation depth limit reached', 409);
    const count = (this.business.db.prepare('SELECT COUNT(*) AS n FROM mb_inference_tasks WHERE json_extract(payload,\'$.rootId\')=?').get(payload.rootId) as { n: number }).n;
    if (count >= 25) throw new BusinessError('Task family limit reached', 409);
    this.business.db.prepare("INSERT INTO mb_inference_tasks(id,payload,hash,state,createdAt) VALUES(?,?,?,'awaiting_approval',?)").run(id, JSON.stringify(payload), fingerprint(payload), this.now());
    this.event('created', id, `Draft assigned to ${tier}/${route.provider}; no tools authorized`);
    return this.task(id);
  }
  create(input: unknown) {
    return this.atomic(() => {
      const today = this.now().slice(0, 10);
      const count = (this.business.db.prepare("SELECT COUNT(*) AS n FROM mb_inference_tasks WHERE createdAt>=? AND json_extract(payload,'$.parentId') IS NULL").get(today) as { n: number }).n;
      if (count >= 20) throw new BusinessError('Daily limit of 20 root tasks reached', 429);
      return this.insert(input);
    });
  }
  approve(id: string, hash: string) {
    return this.atomic(() => {
      const task = this.task(id);
      if (task.state !== 'awaiting_approval' || task.hash !== hash || fingerprint(task.payload) !== hash) throw new BusinessError('Jev approval does not match the current task', 409);
      if (task.attempts >= 2) throw new BusinessError('Attempt budget exhausted', 409);
      const route = this.catalog().find(r => r.provider === task.payload.provider);
      if (!route || route.configHash !== task.payload.configHash) throw new BusinessError('Route changed; create a new task for review', 409);
      if (!route.configured) throw new BusinessError(route.reason, 409);
      if (route.paid && !task.payload.paidConsent) throw new BusinessError('Paid route consent is required', 409);
      this.business.db.prepare("UPDATE mb_inference_tasks SET state='queued',approvedHash=?,approvalExpires=?,error=NULL WHERE id=?").run(hash, new Date(this.clock() + 60 * 60_000).toISOString(), id);
      this.event('approved', id, `Jev operator approval bound to ${hash}`);
      return this.task(id);
    });
  }
  cancel(id: string) {
    return this.atomic(() => {
      const task = this.task(id);
      if (!['awaiting_approval', 'queued', 'running'].includes(task.state)) throw new BusinessError('Task is already terminal', 409);
      this.business.db.prepare("UPDATE mb_inference_tasks SET state='cancelled',leaseToken=NULL,leaseUntil=NULL,approvedHash=NULL WHERE id=?").run(id);
      this.event('cancelled', id, 'Future results fenced out; an in-flight provider may still incur usage');
      return this.task(id);
    });
  }
  heartbeat(workerId: string, transport: 'browser' | 'server') {
    z.string().min(1).max(100).parse(workerId);
    this.business.db.prepare('INSERT INTO mb_inference_workers VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET transport=excluded.transport,lastSeen=excluded.lastSeen').run(workerId, transport, this.now());
  }
  private recover() {
    const expired = this.business.db.prepare("SELECT id FROM mb_inference_tasks WHERE (state='running' AND leaseUntil<=?) OR (state='queued' AND approvalExpires<=?)").all(this.now(), this.now()) as { id: string }[];
    for (const task of expired) {
      this.business.db.prepare("UPDATE mb_inference_tasks SET state=CASE WHEN attempts>=2 THEN 'failed' ELSE 'awaiting_approval' END,approvedHash=NULL,leaseToken=NULL,leaseUntil=NULL,error='Lease or approval expired; review before another attempt' WHERE id=?").run(task.id);
      this.event('expired', task.id, 'Approval invalidated; old worker cannot commit');
    }
  }
  claim(workerId: string, transport: 'browser' | 'server'): Lease | null {
    return this.atomic(() => {
      this.heartbeat(workerId, transport); this.recover();
      const running = (this.business.db.prepare("SELECT COUNT(*) AS n FROM mb_inference_tasks WHERE state='running'").get() as { n: number }).n;
      if (running >= 2) return null;
      const budget = this.business.db.prepare('SELECT COUNT(*) AS n,COALESCE(SUM(maxTokens),0) AS tokens FROM mb_inference_attempts WHERE createdAt>=?').get(this.now().slice(0, 10)) as { n: number; tokens: number };
      if (budget.n >= 50 || budget.tokens >= 65536) return null;
      const candidates = this.business.db.prepare("SELECT * FROM mb_inference_tasks WHERE state='queued' ORDER BY createdAt,id").all() as Row[];
      for (const row of candidates) {
        const task = decode(row);
        if ((task.payload.provider === 'browser') !== (transport === 'browser')) continue;
        if (task.hash !== task.approvedHash || fingerprint(task.payload) !== task.hash) {
          this.business.db.prepare("UPDATE mb_inference_tasks SET state='failed',approvedHash=NULL,error='Payload integrity mismatch' WHERE id=?").run(task.id);
          this.event('rejected', task.id, 'Payload changed after review'); continue;
        }
        const route = this.catalog().find(r => r.provider === task.payload.provider);
        if (!route || !route.configured || route.configHash !== task.payload.configHash || route.paid && !task.payload.paidConsent) {
          this.business.db.prepare("UPDATE mb_inference_tasks SET state='awaiting_approval',approvedHash=NULL,error='Route configuration changed; review required' WHERE id=?").run(task.id);
          this.event('reroute-blocked', task.id, 'No silent provider fallback'); continue;
        }
        if (budget.tokens + task.payload.maxTokens > 65536) continue;
        const token = randomUUID();
        this.business.db.prepare('INSERT INTO mb_inference_attempts VALUES(?,?,?,?)').run(task.id, task.attempts + 1, task.payload.maxTokens, this.now());
        this.business.db.prepare("UPDATE mb_inference_tasks SET state='running',attempts=attempts+1,workerId=?,leaseToken=?,leaseUntil=?,startedAt=? WHERE id=?").run(workerId, token, new Date(this.clock() + 120_000).toISOString(), this.now(), task.id);
        this.event('claimed', task.id, `Lease issued to ${transport} worker`);
        return { task: this.task(task.id), token };
      }
      return null;
    });
  }
  private leased(id: string, token: string): Row {
    z.string().uuid().parse(token);
    const row = this.row(id);
    if (row.state !== 'running' || row.leaseToken !== token || !row.leaseUntil || row.leaseUntil <= this.now() || fingerprint(JSON.parse(row.payload)) !== row.approvedHash) throw new BusinessError('Worker lease is stale or cancelled', 409);
    return row;
  }
  renew(id: string, token: string) {
    return this.atomic(() => {
      const row = this.leased(id, token);
      if (row.workerId) this.heartbeat(row.workerId, JSON.parse(row.payload).provider === 'browser' ? 'browser' : 'server');
      if (this.clock() - new Date(row.startedAt!).getTime() >= 10 * 60_000) throw new BusinessError('Execution time budget exhausted', 409);
      this.business.db.prepare('UPDATE mb_inference_tasks SET leaseUntil=? WHERE id=?').run(new Date(Math.min(this.clock() + 120_000, new Date(row.startedAt!).getTime() + 10 * 60_000)).toISOString(), id);
      return { renewed: true };
    });
  }
  complete(id: string, token: string, output: unknown, usage?: unknown) {
    const text = z.string().trim().min(1).max(100_000).parse(output);
    const parsedUsage = usage === undefined ? null : usageInput.parse(usage);
    return this.atomic(() => {
      this.leased(id, token);
      const outputHash = fingerprint(text);
      this.business.db.prepare("UPDATE mb_inference_tasks SET state='completed',output=?,outputHash=?,usage=?,completedAt=?,leaseToken=NULL,leaseUntil=NULL WHERE id=?").run(text, outputHash, parsedUsage ? JSON.stringify(parsedUsage) : null, this.now(), id);
      this.event('completed', id, `Draft output hash ${outputHash}; not a verified business action or zk proof`);
      return this.task(id);
    });
  }
  fail(id: string, token: string) {
    return this.atomic(() => {
      const row = this.leased(id, token);
      this.business.db.prepare("UPDATE mb_inference_tasks SET state=?,approvedHash=NULL,leaseToken=NULL,leaseUntil=NULL,error='Inference attempt failed; inspect provider before reapproval' WHERE id=?").run(row.attempts >= 2 ? 'failed' : 'awaiting_approval', id);
      this.event('failed', id, 'Attempt failed; no automatic paid retries');
      return this.task(id);
    });
  }
  delegate(id: string, children: unknown) {
    const parsed = z.array(taskInput).min(1).max(5).parse(children);
    return this.atomic(() => {
      const parent = this.task(id);
      if (parent.state !== 'completed') throw new BusinessError('Parent draft must complete before delegation', 409);
      if (this.business.db.prepare('SELECT parentId FROM mb_inference_delegations WHERE parentId=?').get(id)) throw new BusinessError('This parent already delegated a batch', 409);
      this.business.db.prepare('INSERT INTO mb_inference_delegations VALUES(?)').run(id);
      const result = parsed.map(child => this.insert(child, parent));
      this.event('delegated', id, `${result.length} child drafts created; each needs Jev approval`);
      return result;
    });
  }
  snapshot() {
    const tasks = (this.business.db.prepare('SELECT * FROM mb_inference_tasks ORDER BY createdAt DESC,rowid DESC LIMIT 100').all() as Row[]).map(decode);
    const workers = (this.business.db.prepare('SELECT * FROM mb_inference_workers ORDER BY lastSeen DESC LIMIT 50').all() as { id: string; transport: string; lastSeen: string }[]).map(w => ({ ...w, online: this.clock() - new Date(w.lastSeen).getTime() < 90_000 }));
    const counters = this.business.db.prepare("SELECT COUNT(*) AS total,COALESCE(SUM(state='awaiting_approval'),0) AS awaitingApproval,COALESCE(SUM(state='queued'),0) AS queued,COALESCE(SUM(state='running'),0) AS running,COALESCE(SUM(state='completed'),0) AS completed FROM mb_inference_tasks").get();
    const budget = this.business.db.prepare('SELECT COUNT(*) AS attempts,COALESCE(SUM(maxTokens),0) AS reservedOutputTokens FROM mb_inference_attempts WHERE createdAt>=?').get(this.now().slice(0, 10));
    return { tasks, workers, budget, counters, routes: this.catalog(), evidence: this.business.evidence().filter(e => e.action.startsWith('inference.')).slice(-50).reverse(), auditValid: this.business.verifyAudit(), proof: { state: 'not_configured', detail: 'No zkVM prover/verifier configured. Hashes are audit bindings, not zero-knowledge proofs.' } };
  }
}
