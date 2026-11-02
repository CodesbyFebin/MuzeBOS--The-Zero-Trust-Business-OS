import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { BusinessStore, businessStore, payloadHash } from '@/lib/metabos/store';
import { SkillManifest, STARTER_SKILLS } from '@/lib/metabos/arena/skill-contract';
import { saveSkill, skills, skill, exportSkill, proposeSkill } from '@/lib/metabos/arena/skills';
import { InferenceStore } from '@/lib/metabos/inference/store';
import { floorActors } from '@/lib/metabos/arena/snapshot';
import { setupWorkspace, USER_COOKIE, invite, outbox, redeemMagicLink } from '@/lib/metabos/biz/accounts';
import { member, DEPARTMENTS } from '@/lib/metabos/biz/members';
const dir = mkdtempSync(path.join(tmpdir(), 'arena-test-')); const opened: BusinessStore[] = [];
const open = () => { const s = new BusinessStore(path.join(dir, `${randomUUID()}.sqlite`)); opened.push(s); return s; };
afterAll(() => { for (const s of opened) if (s.db.open) s.close(); const s = businessStore(); if (s.db.open) s.close(); rmSync(dir, { recursive: true, force: true }); });
it('starter manifests cannot grant shell/network tools, skip Jev, or use unbounded plans', () => {
 for (const s of STARTER_SKILLS) expect(SkillManifest.parse(s)).toEqual(s);
 expect(() => SkillManifest.parse({ ...STARTER_SKILLS[0], tools: ['shell.exec'] })).toThrow();
 expect(() => SkillManifest.parse({ ...STARTER_SKILLS[0], approval: 'automatic' })).toThrow();
 expect(() => SkillManifest.parse({ ...STARTER_SKILLS[0], steps: Array(6).fill(STARTER_SKILLS[0].steps[0]) })).toThrow();
});
it('skill versions persist, compare expected head and retain previous content; export/run rejects tampering', () => {
 const s = open(); expect(skills(s)).toHaveLength(0); const v1 = saveSkill(s, 'owner', STARTER_SKILLS[0], 0);
 expect(v1.hash).toBe(payloadHash(v1.manifest)); expect(() => saveSkill(s, 'owner', STARTER_SKILLS[0], 0)).toThrow(/changed/);
 const v2 = saveSkill(s, 'owner', { ...STARTER_SKILLS[0], description: 'Revised instructions' }, 1);
 expect(v2.version).toBe(2); expect(skill(s, v1.id, 1).manifest.description).toBe(STARTER_SKILLS[0].description);
 const file = s.db.name; s.close(); const reopened = new BusinessStore(file); opened.push(reopened); expect(skills(reopened)).toHaveLength(2);
 expect(JSON.parse(exportSkill(v1, 'json')).hash).toBe(v1.hash); expect(exportSkill(v1, 'yaml')).toContain('approval: "jev-exact-hash"'); expect(exportSkill(v1, 'markdown')).toContain('does not preserve');
 reopened.db.prepare('UPDATE mb_arena_skills SET hash=? WHERE id=? AND version=1').run('a'.repeat(64), v1.id); expect(() => skill(reopened, v1.id, 1)).toThrow(/does not verify/);
});
it('proposals remain unapproved and retry with the same command creates no duplicate work', () => {
 const s = open(), v = saveSkill(s, 'owner', STARTER_SKILLS[0], 0), inference = new InferenceStore(s);
 const c = { id: v.id, version: v.version, hash: v.hash, context: 'Fictional customer asks about delivery' }, key = randomUUID();
 const a = s.command(key, c, () => proposeSkill(s, 'owner', c, inference));
 expect(s.command(key, c, () => proposeSkill(s, 'owner', c, inference))).toEqual(a);
 expect(inference.snapshot().tasks).toHaveLength(1); expect(inference.snapshot().tasks[0]).toMatchObject({ state: 'awaiting_approval', approvedHash: null, payload: { paidConsent: false } });
 expect(() => proposeSkill(s, 'owner', { ...c, hash: 'f'.repeat(64) }, inference)).toThrow(/changed/);
 expect(s.verifyAudit()).toBe(true);
});
it('multi-step proposal rolls back if any draft fails its budget check', () => {
 const s = open(), inf = new InferenceStore(s); for(let i=0;i<19;i++) inf.create({title:`T${i}`,prompt:'Draft',kind:'draft',lane:'browser'});
 const manifest = { ...STARTER_SKILLS[0], steps: [STARTER_SKILLS[0].steps[0], STARTER_SKILLS[0].steps[0]] }, v=saveSkill(s,'owner',manifest,0);
 expect(() => proposeSkill(s,'owner',{id:v.id,version:1,hash:v.hash,context:'Check'},inf)).toThrow(/Daily limit/);
 expect(inf.snapshot().tasks).toHaveLength(19); expect(s.verifyAudit()).toBe(true);
});
it('floor never treats an expired lease, queued draft, or completed row as an active worker', () => {
 const s=open(),inf=new InferenceStore(s); const t=inf.create({title:'T',prompt:'Draft',kind:'draft',lane:'browser'}); const now=Date.now();
 expect(floorActors([t],now)[0]).toMatchObject({station:'jev',leased:false});
 expect(floorActors([{...t,state:'running',leaseUntil:new Date(now-1000).toISOString()}],now)[0]).toMatchObject({station:'healing',leased:false});
 expect(floorActors([{...t,state:'running',leaseUntil:new Date(now+1000).toISOString()}],now)[0]).toMatchObject({station:'forge',leased:true});
 expect(floorActors([{...t,state:'completed'}],now)).toEqual([]);
});
describe('Arena API boundaries',()=>{
 it('rejects signed-out reads/writes and member-role export; owner saves and exports with bounded idempotent writes', async()=>{
  process.env.MUZEBOS_DB=path.join(dir,'api.sqlite'); const s=businessStore();
  const owner=setupWorkspace(s,{workspace:'Arena',name:'Owner',email:'owner@example.test',password:'long fake passphrase'}).token;
  invite(s,member(s,'owner'),{name:'Member',email:'member@example.test',role:'member',department:DEPARTMENTS[0]},'http://localhost');
  const token=redeemMagicLink(s,/link=([^\s]+)/.exec(outbox(s)[0].body)![1]).token;
  const {GET,POST}=await import('@/app/api/metabos/arena/route');
  const request=(token?:string,body?:string)=>new Request('http://localhost/api/metabos/arena',{method:body?'POST':'GET',headers:{origin:'http://localhost','content-type':'application/json','idempotency-key':randomUUID(),...(token?{cookie:`${USER_COOKIE}=${token}`}:{})},...(body?{body}:{})});
  expect(GET(request()).status).toBe(401); expect((await POST(request(undefined,'{}'))).status).toBe(401); expect(GET(request(token)).status).toBe(403);
  const body=JSON.stringify({action:'save',manifest:STARTER_SKILLS[1],expectedVersion:0});expect((await POST(request(token,body))).status).toBe(403);expect((await POST(request(owner,body))).status).toBe(200);
  expect((await GET(request(owner)).json()).skills).toHaveLength(1);
  const url='http://localhost/api/metabos/arena?export=yaml&id=customer-reply&version=1';expect(GET(new Request(url)).status).toBe(401);const exported=GET(new Request(url,{headers:{cookie:`${USER_COOKIE}=${owner}`}}));expect(exported.status).toBe(200);expect(exported.headers.get('content-type')).toContain('text/plain');
  expect((await POST(request(owner,' '.repeat(33000)))).status).toBe(413);
 });
});
