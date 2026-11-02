/**
 * Verlet hair-patch physics shared by both tiers. The GPU tier runs the same equations in GLSL
 * (gpuPhysics.ts); this CPU version is the WebGL fallback and the unit-test oracle.
 * Each patch stores a displacement d of its fur tips from rest, in world units, plus the previous value.
 */
export type PhysInputs = { dt: number; time: number; stiffness: number; damping: number; gravity: number; wind: number; inertia: [number, number, number]; pet: { u: number; v: number; dx: number; dy: number; dz: number; r: number } | null; boop: { u: number; v: number; age: number } | null; maxLen: number };
export const restNormal = (u: number, v: number): [number, number, number] => { const th = u * Math.PI * 2, ph = v * Math.PI; return [-Math.cos(th) * Math.sin(ph), Math.cos(ph), Math.sin(th) * Math.sin(ph)]; };
export function createPatches(n: number) { return { n, cur: new Float32Array(n * n * 4), prev: new Float32Array(n * n * 4) }; }
const uvDist = (a: number, b: number, c: number, d: number) => { let du = Math.abs(a - c); du = Math.min(du, 1 - du); return Math.hypot(du * 2, b - d); };
export function stepPatches(p: { n: number; cur: Float32Array; prev: Float32Array }, I: PhysInputs) {
  const { n, cur, prev } = p; const dt2 = I.dt * I.dt;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = (j * n + i) * 4; const u = (i + 0.5) / n, v = (j + 0.5) / n; const N = restNormal(u, v);
    const d = [cur[k], cur[k + 1], cur[k + 2]]; const o = [prev[k], prev[k + 1], prev[k + 2]];
    const a = [-I.stiffness * d[0], -I.stiffness * d[1], -I.stiffness * d[2]];
    const gN = -I.gravity * N[1]; a[0] += -0 - gN * N[0]; a[1] += -I.gravity - gN * N[1]; a[2] += -gN * N[2]; // tangential gravity
    for (let c = 0; c < 3; c++) a[c] -= I.inertia[c];
    if (I.wind > 0) { a[0] += I.wind * (Math.sin(I.time * 1.7 + v * 9 + u * 3) * 0.6 + 0.4) * 3; a[2] += I.wind * Math.sin(I.time * 2.3 + u * 11) * 1.5; }
    if (I.pet) { const w = Math.max(0, 1 - uvDist(u, v, I.pet.u, I.pet.v) / I.pet.r); a[0] += I.pet.dx * w * 400; a[1] += I.pet.dy * w * 400; a[2] += I.pet.dz * w * 400; }
    if (I.boop) { const dist = uvDist(u, v, I.boop.u, I.boop.v); const front = I.boop.age * 2.5; const w = Math.exp(-((dist - front) ** 2) * 60) * Math.exp(-I.boop.age * 3); for (let c = 0; c < 3; c++) a[c] += N[c] * w * 60; }
    for (let c = 0; c < 3; c++) { const nx = d[c] + (d[c] - o[c]) * (1 - I.damping) + a[c] * dt2; prev[k + c] = d[c]; cur[k + c] = nx; }
    // keep hair from stretching: clamp displacement and stop it pointing into the body
    let len = Math.hypot(cur[k], cur[k + 1], cur[k + 2]); const max = I.maxLen * 0.9;
    if (len > max) { const s = max / len; cur[k] *= s; cur[k + 1] *= s; cur[k + 2] *= s; len = max; }
    const inward = cur[k] * N[0] + cur[k + 1] * N[1] + cur[k + 2] * N[2]; if (inward < -I.maxLen * 0.5) { const f = inward + I.maxLen * 0.5; cur[k] -= N[0] * f; cur[k + 1] -= N[1] * f; cur[k + 2] -= N[2] * f; }
    cur[k + 3] = 1;
  }
}
