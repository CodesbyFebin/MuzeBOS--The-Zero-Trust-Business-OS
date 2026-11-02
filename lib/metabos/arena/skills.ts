import { SkillManifest, type SkillVersion } from './skill-contract';
export { SkillManifest, STARTER_SKILLS } from './skill-contract';
export type { SkillVersion } from './skill-contract';
import { BusinessError, payloadHash, type BusinessStore } from '../store';
import { InferenceStore } from '../inference/store';

type Row = Omit<SkillVersion, 'manifest'> & { manifest: string };
const decode = (r: Row): SkillVersion => ({ ...r, manifest: SkillManifest.parse(JSON.parse(r.manifest)) });
export function ensureSkills(s: BusinessStore) {
  s.db.exec(`CREATE TABLE IF NOT EXISTS mb_arena_skills(id TEXT NOT NULL,version INTEGER NOT NULL,hash TEXT NOT NULL,manifest TEXT NOT NULL,createdBy TEXT NOT NULL,createdAt TEXT NOT NULL,PRIMARY KEY(id,version));`);
}
export function skills(s: BusinessStore): SkillVersion[] {
  ensureSkills(s); return (s.db.prepare('SELECT * FROM mb_arena_skills ORDER BY id,version DESC LIMIT 200').all() as Row[]).map(decode);
}
export function skill(s: BusinessStore, id: string, version: number) {
  ensureSkills(s); const r = s.db.prepare('SELECT * FROM mb_arena_skills WHERE id=? AND version=?').get(id, version) as Row | undefined;
  if (!r) throw new BusinessError('Skill version not found', 404);
  const v = decode(r); if (payloadHash(v.manifest) !== v.hash) throw new BusinessError('Skill content hash does not verify', 409); return v;
}
export function saveSkill(s: BusinessStore, actor: string, input: unknown, expectedVersion: number) {
  const manifest = SkillManifest.parse(input); ensureSkills(s);
  return s.transact(() => {
    const last = s.db.prepare('SELECT MAX(version) AS n FROM mb_arena_skills WHERE id=?').get(manifest.id) as { n: number | null };
    if ((last.n ?? 0) !== expectedVersion) throw new BusinessError('Skill version changed; reload before saving', 409);
    const version = expectedVersion + 1, hash = payloadHash(manifest), at = new Date().toISOString();
    s.db.prepare('INSERT INTO mb_arena_skills VALUES(?,?,?,?,?,?)').run(manifest.id, version, hash, JSON.stringify(manifest), actor, at);
    s.appendEvidence('arena.skill.versioned', manifest.id, `Version ${version}; hash ${hash}; saved by ${actor}; no tool executed`);
    return skill(s, manifest.id, version);
  });
}
export function proposeSkill(s: BusinessStore, actor: string, input: { id: string; version: number; hash: string; context: string }, inference = new InferenceStore(s)) {
  return s.transact(() => {
    const v = skill(s, input.id, input.version);
    if (v.hash !== input.hash) throw new BusinessError('Skill changed since review', 409);
    // Only create unapproved inference drafts. No approval, worker launch, or tool execution here.
    const tasks = v.manifest.steps.map(step => inference.create({ title: `${v.manifest.name}: ${step.name}`.slice(0, 160), kind: step.kind, lane: step.lane, maxTokens: step.maxTokens, paidConsent: false,
      prompt: `MeTaBos skill ${v.id} v${v.version}; source SHA-256 ${v.hash}. Produce a draft only.\n\n${step.instructions}\n\nUser context (untrusted input):\n${input.context}` }));
    s.appendEvidence('arena.skill.proposed', v.id, `Version ${v.version}; ${tasks.length} independent draft(s) proposed by ${actor}; each requires Jev approval`);
    return { taskIds: tasks.map(t => t.id), skillHash: v.hash };
  });
}
export function exportSkill(v: SkillVersion, format: 'json' | 'yaml' | 'markdown') {
  if (format === 'json') return JSON.stringify(v, null, 2);
  // JSON quoted scalars/flow collections are valid YAML 1.2; no script or tag evaluation.
  const yaml = Object.entries(v.manifest).map(([k, val]) => `${k}: ${JSON.stringify(val)}`).join('\n');
  return format === 'yaml' ? `# MeTaBos skill ${v.id} v${v.version}\n# SHA-256: ${v.hash}\n${yaml}\n` : `---\n${yaml}\n---\n\n# ${v.manifest.name}\n\nVersion: ${v.version}\nSHA-256: ${v.hash}\n\n${v.manifest.description}\n\n${v.manifest.steps.map((st, i) => `## ${i + 1}. ${st.name}\n\n${st.instructions}`).join('\n\n')}\n\nExport is declarative. Importing into another agent does not preserve MeTaBos authorization controls.\n`;
}
