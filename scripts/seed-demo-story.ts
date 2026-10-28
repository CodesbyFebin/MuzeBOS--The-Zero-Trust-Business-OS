import path from 'node:path';
import { BusinessStore } from '../lib/metabos/store';
import { seedDemoStory } from '../lib/metabos/demo-story';
const file = process.env.MUZEBOS_DB ?? path.join(process.cwd(), 'data', 'metabos-demo.sqlite');
const s = new BusinessStore(file);
try { const r = seedDemoStory(s); console.log(`Seeded DEMO story into ${file}`, r); } finally { s.close(); }
