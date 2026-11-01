import * as THREE from 'three';
/** Sculpted blob: a 96×72 sphere pushed into a pear body with cheeks, two ears and stubby arms. */
export function sculpt(x: number, y: number, z: number): [number, number, number] {
  let sx = 1, sy = 1;
  const pear = 1 + 0.18 * Math.max(0, -y); sx *= pear; // wider bottom
  const cheek = Math.exp(-((y + 0.15) ** 2) * 18) * Math.exp(-((Math.abs(x) - 0.6) ** 2) * 10) * Math.max(0, z) * 0.12;
  const ear = (sgn: number) => Math.exp(-(((x - sgn * 0.45) ** 2) + (z * 0.9) ** 2) * 18) * Math.max(0, y - 0.5) * 1.4;
  const arm = (sgn: number) => Math.exp(-((y + 0.25) ** 2) * 30) * Math.exp(-((x - sgn * 0.98) ** 2) * 30) * 0.18;
  const r = 1 + cheek + ear(1) + ear(-1) + arm(1) + arm(-1);
  return [x * sx * r, y * sy * r * 0.92, z * r * (1 + cheek)];
}
export function bodyGeometry(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(0.7, 96, 72); const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const [x, y, z] = sculpt(p.getX(i) / 0.7, p.getY(i) / 0.7, p.getZ(i) / 0.7); p.setXYZ(i, x * 0.7, y * 0.7, z * 0.7); }
  g.computeVertexNormals(); return g;
}
/** Anime eyes (iris + two catchlights), blush, nose bean and a W smile. Returned group sits on the front (+z). */
export function face(eyeColor: string, blushColor: string) {
  const grp = new THREE.Group(); const eyeMat = new THREE.MeshBasicMaterial({ color: eyeColor }); const white = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const blushMat = new THREE.MeshBasicMaterial({ color: blushColor, transparent: true, opacity: 0.45, depthWrite: false });
  const eyes: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.085, 24, 16), eyeMat); eye.scale.set(0.85, 1.15, 0.4); eye.position.set(s * 0.2, 0.08, 0.8); grp.add(eye); eyes.push(eye);
    const c1 = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 8), white); c1.position.set(s * 0.2 + 0.025, 0.13, 0.84); grp.add(c1);
    const c2 = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), white); c2.position.set(s * 0.2 - 0.025, 0.04, 0.84); grp.add(c2);
    const blush = new THREE.Mesh(new THREE.CircleGeometry(0.07, 20), blushMat); blush.position.set(s * 0.36, -0.06, 0.8); blush.rotation.y = s * 0.4; grp.add(blush);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), eyeMat); nose.scale.set(1.4, 0.8, 0.6); nose.position.set(0, -0.02, 0.86); grp.add(nose);
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 6, 16, Math.PI), eyeMat); const smile2 = smile.clone();
  smile.rotation.z = Math.PI; smile.position.set(-0.04, -0.07, 0.85); smile2.rotation.z = Math.PI; smile2.position.set(0.04, -0.07, 0.85); grp.add(smile, smile2);
  return { grp, eyes, materials: { eyeMat, blushMat } };
}
/** Area-weighted CDF follicle sampling over triangles; returns root, normal and uv per strand. */
export function sampleFollicles(g: THREE.BufferGeometry, count: number, seed = 11) {
  const pos = g.attributes.position as THREE.BufferAttribute, nor = g.attributes.normal as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute; const idx = g.index!;
  const tris = idx.count / 3; const cdf = new Float64Array(tris); let acc = 0; const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < tris; t++) { a.fromBufferAttribute(pos, idx.getX(t * 3)); b.fromBufferAttribute(pos, idx.getX(t * 3 + 1)); c.fromBufferAttribute(pos, idx.getX(t * 3 + 2)); acc += b.sub(a).cross(c.sub(a)).length() / 2; cdf[t] = acc; }
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const root = new Float32Array(count * 3), normal = new Float32Array(count * 3), uvs = new Float32Array(count * 2), rand = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const r = rnd() * acc; let lo = 0, hi = tris - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m] < r) lo = m + 1; else hi = m; }
    let u = rnd(), v = rnd(); if (u + v > 1) { u = 1 - u; v = 1 - v; } const w = 1 - u - v; const ids = [idx.getX(lo * 3), idx.getX(lo * 3 + 1), idx.getX(lo * 3 + 2)]; const wt = [w, u, v];
    for (let k = 0; k < 3; k++) { root[i * 3 + k] = 0; normal[i * 3 + k] = 0; } uvs[i * 2] = 0; uvs[i * 2 + 1] = 0;
    for (let q = 0; q < 3; q++) { root[i * 3] += pos.getX(ids[q]) * wt[q]; root[i * 3 + 1] += pos.getY(ids[q]) * wt[q]; root[i * 3 + 2] += pos.getZ(ids[q]) * wt[q]; normal[i * 3] += nor.getX(ids[q]) * wt[q]; normal[i * 3 + 1] += nor.getY(ids[q]) * wt[q]; normal[i * 3 + 2] += nor.getZ(ids[q]) * wt[q]; uvs[i * 2] += uv.getX(ids[q]) * wt[q]; uvs[i * 2 + 1] += uv.getY(ids[q]) * wt[q]; }
    const l = Math.hypot(normal[i * 3], normal[i * 3 + 1], normal[i * 3 + 2]) || 1; for (let k = 0; k < 3; k++) normal[i * 3 + k] /= l; rand[i] = rnd();
  }
  return { root, normal, uvs, rand, area: acc };
}
/** 420 clump centroids; each strand gets a tip offset toward its nearest centroid (scaled by clumping in the shader uniforms). */
export function clumpOffsets(root: Float32Array, count: number, clumps = 420, seed = 5) {
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647); const cen = new Float32Array(clumps * 3);
  for (let c = 0; c < clumps; c++) { const i = Math.floor(rnd() * count); cen.set(root.subarray(i * 3, i * 3 + 3), c * 3); }
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { let best = 0, bd = Infinity; const x = root[i * 3], y = root[i * 3 + 1], z = root[i * 3 + 2];
    for (let c = 0; c < clumps; c++) { const d = (cen[c * 3] - x) ** 2 + (cen[c * 3 + 1] - y) ** 2 + (cen[c * 3 + 2] - z) ** 2; if (d < bd) { bd = d; best = c; } }
    out[i * 3] = cen[best * 3] - x; out[i * 3 + 1] = cen[best * 3 + 1] - y; out[i * 3 + 2] = cen[best * 3 + 2] - z; }
  return { centroids: cen, offsets: out };
}
