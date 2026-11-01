import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { COAT_PRESETS, DEFAULT_COAT, nextCoat, FUR_SLIDERS, clampParams, FUR_DEFAULTS } from '@/lib/metabos/fur-sim/presets';
import { ENVIRONMENTS } from '@/lib/metabos/fur-sim/environments';
import { chooseTier, TIER_BUDGET, type Caps } from '@/lib/metabos/fur-sim/capability';
import { parseMuseCommand } from '@/lib/metabos/fur-sim/voiceCommands';
import { createPatches, stepPatches, type PhysInputs } from '@/lib/metabos/fur-sim/physics';

const caps = (o: Partial<Caps> = {}): Caps => ({ webgl2: true, webgl1: false, floatRT: true, cores: 8, memoryGB: 8, saveData: false, reducedMotion: false, maxTex: 8192, ...o });
const base: PhysInputs = { dt: 1 / 60, time: 0, stiffness: 60, damping: 0.12, gravity: 2, wind: 0, inertia: [0, 0, 0], pet: null, boop: null, maxLen: 0.12 };

describe('MUSE fur presets', () => {
  it('Ember is default; violet and the four named presets exist; flip cycles all', () => {
    expect(DEFAULT_COAT).toBe('ember');
    expect(COAT_PRESETS.map((c) => c.label)).toEqual(expect.arrayContaining(['Sakura Mochi', 'Golden Fluff', 'Midnight Velvet', 'Matcha Puff', 'Violet (original mascot)']));
    let id = DEFAULT_COAT; const seen = new Set<string>(); for (let i = 0; i < COAT_PRESETS.length; i++) { seen.add(id); id = nextCoat(id); }
    expect(seen.size).toBe(COAT_PRESETS.length); expect(id).toBe('ember');
  });
  it('has 9 sliders and clamps values', () => {
    expect(FUR_SLIDERS).toHaveLength(9);
    expect(clampParams({ length: 99, wind: -5, density: NaN })).toMatchObject({ length: 0.3, wind: 0, density: FUR_DEFAULTS.density });
  });
  it('has the 4 environments and only AR uses the camera', () => {
    expect(ENVIRONMENTS.map((e) => e.label)).toEqual(['Studio', 'Cloud Sky', 'Cozy Desk', 'AR View']);
    expect(ENVIRONMENTS.filter((e) => e.usesCamera).map((e) => e.id)).toEqual(['ar']);
  });
});

describe('tier choice', () => {
  it('GPGPU on capable devices, WebGL fallback without float RTs or under reduced motion, 2D on low-end', () => {
    expect(chooseTier(caps())).toBe('gpu');
    expect(chooseTier(caps({ floatRT: false }))).toBe('webgl');
    expect(chooseTier(caps({ reducedMotion: true }))).toBe('webgl');
    expect(chooseTier(caps(), false)).toBe('webgl');
    expect(chooseTier(caps({ cores: 2 }))).toBe('2d');
    expect(chooseTier(caps({ memoryGB: 1 }))).toBe('2d');
    expect(chooseTier(caps({ webgl2: false, webgl1: false }))).toBe('2d');
    expect(chooseTier(caps({ saveData: true }))).toBe('2d');
    expect(TIER_BUDGET.gpu).toMatchObject({ shells: 64, strands: 60000, physics: 128 });
  });
});

describe('voice commands', () => {
  it('maps boop, flip my coat, named coats and scenes; never AR', () => {
    expect(parseMuseCommand('Boop')).toEqual({ kind: 'boop' });
    expect(parseMuseCommand('flip my coat')).toEqual({ kind: 'coat', preset: 'next' });
    expect(parseMuseCommand('flip my coat to matcha puff')).toEqual({ kind: 'coat', preset: 'matcha-puff' });
    expect(parseMuseCommand('show cloud sky')).toEqual({ kind: 'env', env: 'cloud-sky' });
    expect(parseMuseCommand('show AR view')).toBeNull();
    expect(parseMuseCommand('list tasks')).toBeNull();
  });
});

describe('Verlet physics (CPU fallback / oracle)', () => {
  it('is stable at rest, responds to a boop and settles back', () => {
    const p = createPatches(16);
    for (let i = 0; i < 120; i++) stepPatches(p, { ...base, time: i / 60 });
    const rest = Math.max(...Array.from(p.cur).filter((_, i) => i % 4 !== 3).map(Math.abs)); expect(Number.isFinite(rest)).toBe(true); expect(rest).toBeLessThanOrEqual(0.12);
    const before = p.cur.slice();
    for (let i = 0; i < 10; i++) stepPatches(p, { ...base, boop: { u: 0.75, v: 0.5, age: i / 60 } });
    const moved = p.cur.reduce((m, v, i) => Math.max(m, Math.abs(v - before[i])), 0); expect(moved).toBeGreaterThan(1e-4);
    for (let i = 0; i < 600; i++) stepPatches(p, base);
    for (const v of p.cur) expect(Number.isFinite(v)).toBe(true);
  });
  it('clamps displacement to fur length under wind and petting', () => {
    const p = createPatches(8);
    for (let i = 0; i < 300; i++) stepPatches(p, { ...base, wind: 1, time: i / 60, pet: { u: 0.5, v: 0.5, dx: 1, dy: 0, dz: 0, r: 0.5 } });
    for (let k = 0; k < p.cur.length; k += 4) expect(Math.hypot(p.cur[k], p.cur[k + 1], p.cur[k + 2])).toBeLessThanOrEqual(0.12 * 0.9 + 1e-6);
  });
});

describe('guards in source', () => {
  const comp = readFileSync('components/metabos/muse/MuseFurSimulator.tsx', 'utf8');
  const eng = readFileSync('lib/metabos/fur-sim/engine.ts', 'utf8');
  it('three.js is lazy-loaded only', () => {
    expect(comp).not.toMatch(/from 'three'/); expect(comp).toMatch(/import\('@\/lib\/metabos\/fur-sim\/engine'\)/);
    expect(readFileSync('components/metabos/VoiceAssistant.tsx', 'utf8')).not.toMatch(/from 'three'/);
  });
  it('camera only from a click, video only, never recorded', () => {
    expect(comp.match(/getUserMedia/g)).toHaveLength(1); expect(comp).toMatch(/onClick=\{\(\) => void startCam\(\)\}/);
    expect(comp).toMatch(/audio: false/); expect(comp + eng).not.toMatch(/MediaRecorder|captureStream|toDataURL/);
    expect(comp).toMatch(/getTracks\(\)\.forEach\(\(t\) => t\.stop\(\)\)/);
  });
  it('pauses off-screen / hidden and honours reduced motion', () => {
    expect(eng).toMatch(/IntersectionObserver/); expect(eng).toMatch(/document\.hidden/); expect(eng).toMatch(/reduce \? 0 : params\.wind/);
  });
  it('no CDN fonts or off-palette accents in the new UI', () => {
    expect(comp).not.toMatch(/fonts\.googleapis|cdn/i); expect(comp).not.toMatch(/#0ff|cyan|neon/i);
  });
});
import { downgrade } from '@/lib/metabos/fur-sim/capability';
describe('adaptive downgrade', () => {
  it('drops gpu→webgl→2d only after two slow seconds; software GL starts on webgl', () => {
    expect(downgrade('gpu', 10, 1)).toBeNull(); expect(downgrade('gpu', 10, 2)).toBe('webgl'); expect(downgrade('gpu', 50, 5)).toBeNull();
    expect(downgrade('webgl', 8, 2)).toBe('2d'); expect(downgrade('webgl', 20, 9)).toBeNull();
    expect(chooseTier(caps({ software: true }))).toBe('webgl');
  });
});
