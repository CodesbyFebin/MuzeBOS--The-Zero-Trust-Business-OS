/**
 * MUSE fur engine (clean-room, three.js MIT). Loaded only via dynamic import() from MuseFurSimulator.
 * Shells: instanced copies of the body with a per-instance layer. Strands: instanced camera-facing ribbons.
 * Physics: GPGPU Verlet (GPUComputationRenderer, 128²) on the 'gpu' tier, CPU Verlet (32²) on 'webgl'.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GPUComputationRenderer, type Variable } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
import { SHELL_VERT, SHELL_FRAG, STRAND_VERT, STRAND_FRAG, PHYS_POS_FRAG, PHYS_PREV_FRAG } from './furShaders';
import { bodyGeometry, face, sampleFollicles, clumpOffsets } from './creature';
import { coatById, clampParams, FUR_DEFAULTS, type CoatPresetId, type FurParams } from './presets';
import { envById, type EnvId } from './environments';
import { TIER_BUDGET, type Tier } from './capability';
import { createPatches, stepPatches, type PhysInputs } from './physics';
import type { MuseController, MuseStats } from './controller';

export type EngineOpts = { tier: Exclude<Tier, '2d'>; coat: CoatPresetId; env: EnvId; reducedMotion: boolean; onStats?: (s: MuseStats) => void; onBoop?: () => void };

export function createFurEngine(canvas: HTMLCanvasElement, opts: EngineOpts): MuseController {
  let tier = opts.tier; const reduce = opts.reducedMotion;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50); camera.position.set(0, 0.25, 4.2);
  const controls = new OrbitControls(camera, canvas); controls.enableDamping = true; controls.minDistance = 2.4; controls.maxDistance = 7; controls.enablePan = false; controls.target.set(0, 0, 0);
  const creature = new THREE.Group(); scene.add(creature);
  const geo = bodyGeometry();
  let params: FurParams = { ...FUR_DEFAULTS }; let coat = coatById(opts.coat); let env = envById(opts.env);
  const col = (h: string) => new THREE.Color(h);
  const uniforms = {
    uRoot: { value: col(coat.root) }, uTip: { value: col(coat.tip) }, uSpecCol: { value: col(coat.spec) },
    uKeyDir: { value: new THREE.Vector3(0.6, 0.8, 0.9) }, uKeyCol: { value: col(env.key) }, uKey: { value: params.keyLight },
    uRimDir: { value: new THREE.Vector3(-0.7, 0.3, -1) }, uRimCol: { value: col(env.rim) }, uRim: { value: params.rimLight },
    uAmbSky: { value: col(env.ambientSky) }, uAmbGround: { value: col(env.ambientGround) }, uAmb: { value: env.ambient },
    uRough: { value: params.roughness }, uSpec: { value: params.specular }, uDensity: { value: params.density }, uClump: { value: params.clumping },
    uPhys: { value: null as THREE.Texture | null }, uLen: { value: params.length }, uCurl: { value: params.curl }, uTime: { value: 0 }, uBounce: { value: 0 }, uWidth: { value: 0.0045 },
  };
  const skin = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: coat.root })); creature.add(skin);
  // shells
  const budget = () => TIER_BUDGET[tier];
  let shells: THREE.Mesh | null = null, strands: THREE.Mesh | null = null;
  const shellMat = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms, vertexShader: SHELL_VERT, fragmentShader: SHELL_FRAG, side: THREE.DoubleSide });
  const strandMat = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms, vertexShader: STRAND_VERT, fragmentShader: STRAND_FRAG, side: THREE.DoubleSide });
  function buildFur() {
    if (shells) { creature.remove(shells); shells.geometry.dispose(); } if (strands) { creature.remove(strands); strands.geometry.dispose(); }
    const B = budget();
    const sg = new THREE.InstancedBufferGeometry(); sg.index = geo.index; for (const k of ['position', 'normal', 'uv']) sg.setAttribute(k, geo.attributes[k]);
    const layers = new Float32Array(B.shells); for (let i = 0; i < B.shells; i++) layers[i] = (i + 1) / B.shells;
    sg.setAttribute('aLayer', new THREE.InstancedBufferAttribute(layers, 1)); sg.instanceCount = B.shells;
    shells = new THREE.Mesh(sg, shellMat); shells.frustumCulled = false; creature.add(shells);
    const f = sampleFollicles(geo, B.strands); const cl = clumpOffsets(f.root, B.strands);
    const seg = B.segments; const base = new THREE.InstancedBufferGeometry(); const aSeg: number[] = [], aSide: number[] = [], index: number[] = [], posArr: number[] = [];
    for (let i = 0; i <= seg; i++) { for (const s of [-1, 1]) { aSeg.push(i / seg); aSide.push(s); posArr.push(0, 0, 0); } if (i < seg) { const a = i * 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
    base.setIndex(index); base.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3)); base.setAttribute('aSeg', new THREE.Float32BufferAttribute(aSeg, 1)); base.setAttribute('aSide', new THREE.Float32BufferAttribute(aSide, 1));
    base.setAttribute('aRoot', new THREE.InstancedBufferAttribute(f.root, 3)); base.setAttribute('aNormal', new THREE.InstancedBufferAttribute(f.normal, 3)); base.setAttribute('aUv', new THREE.InstancedBufferAttribute(f.uvs, 2));
    const clumpScaled = cl.offsets.map((v) => v * params.clumping * 0.6); base.setAttribute('aClump', new THREE.InstancedBufferAttribute(clumpScaled, 3)); base.setAttribute('aRand', new THREE.InstancedBufferAttribute(f.rand, 1));
    base.instanceCount = B.strands; strands = new THREE.Mesh(base, strandMat); strands.frustumCulled = false; creature.add(strands);
    built = { shells: B.shells, strands: B.strands };
  }
  let built = { shells: 0, strands: 0 };
  const fc = face(coat.eye, coat.blush); creature.add(fc.grp);
  const hemi = new THREE.HemisphereLight(env.ambientSky, env.ambientGround, 1); scene.add(hemi); // for face meshes (basic materials ignore it, kept for future PBR)
  // physics
  let gpu: GPUComputationRenderer | null = null, vPos: Variable | null = null, vPrev: Variable | null = null; let cpu: ReturnType<typeof createPatches> | null = null; let cpuTex: THREE.DataTexture | null = null;
  function buildPhysics() {
    gpu?.dispose(); gpu = null; cpuTex?.dispose(); cpuTex = null; cpu = null;
    const n = budget().physics;
    if (tier === 'gpu') {
      try {
        gpu = new GPUComputationRenderer(n, n, renderer); const t0 = gpu.createTexture(), t1 = gpu.createTexture();
        vPos = gpu.addVariable('texPos', PHYS_POS_FRAG, t0); vPrev = gpu.addVariable('texPrev', PHYS_PREV_FRAG, t1);
        gpu.setVariableDependencies(vPos, [vPos, vPrev]); gpu.setVariableDependencies(vPrev, [vPos]);
        Object.assign(vPos.material.uniforms, { uDt: { value: 1 / 60 }, uTime: { value: 0 }, uK: { value: 60 }, uDamp: { value: 0.12 }, uGrav: { value: 2 }, uWind: { value: 0 }, uInertia: { value: new THREE.Vector3() }, uPet: { value: new THREE.Vector4(0, 0, 0.12, 0) }, uPetDir: { value: new THREE.Vector3() }, uBoop: { value: new THREE.Vector3(0, 0, -1) }, uMax: { value: params.length } });
        const err = gpu.init(); if (err) throw new Error(err);
        return;
      } catch { gpu?.dispose(); gpu = null; tier = 'webgl'; buildFur(); } // automatic WebGL fallback
    }
    cpu = createPatches(n); cpuTex = new THREE.DataTexture(cpu.cur, n, n, THREE.RGBAFormat, THREE.FloatType); cpuTex.magFilter = THREE.LinearFilter; cpuTex.minFilter = THREE.LinearFilter; cpuTex.wrapS = THREE.RepeatWrapping; cpuTex.needsUpdate = true; uniforms.uPhys.value = cpuTex;
  }
  buildFur(); buildPhysics();
  // interaction: click = boop, drag on creature = pet, drag elsewhere = orbit
  const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
  let pet: PhysInputs['pet'] = null, boop: PhysInputs['boop'] = null, boops = 0, down: { x: number; y: number; hit: boolean } | null = null, lastHit: THREE.Vector3 | null = null;
  const hitAt = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); return ray.intersectObject(skin, false)[0] ?? null; };
  const onDown = (e: PointerEvent) => { const h = hitAt(e); down = { x: e.clientX, y: e.clientY, hit: !!h }; if (h) { controls.enabled = false; lastHit = h.point.clone(); } };
  const onMove = (e: PointerEvent) => { if (!down?.hit) return; const h = hitAt(e); if (!h || !h.uv) { pet = null; return; } const d = h.point.clone().sub(lastHit ?? h.point); lastHit = h.point.clone(); pet = { u: h.uv.x, v: h.uv.y, dx: d.x, dy: d.y, dz: d.z, r: 0.12 }; kick(); };
  const onUp = (e: PointerEvent) => { if (down && down.hit && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6) { const h = hitAt(e); triggerBoop(h?.uv?.x, h?.uv?.y); } down = null; pet = null; controls.enabled = true; };
  canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
  // loop
  let speaking = false, bounceVel = 0, bounce = 0, prevBounceVel = 0, raf = 0, visible = true, last = performance.now(), frames = 0, fpsT = last, fps: number | null = null, time = 0, disposed = false;
  const stats = (): MuseStats => ({ tier, shells: built.shells, strands: built.strands, gpgpu: !!gpu, boops, fps, paused: !visible || document.hidden });
  function resize() { const w = canvas.clientWidth || 300, h = canvas.clientHeight || 300; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  function frame(now: number) {
    const dt = Math.min(1 / 30, (now - last) / 1000); last = now; time += dt;
    // speaking bounce: damped spring on scale; its acceleration feeds hair inertia
    const target = speaking && !reduce ? 0.06 * Math.abs(Math.sin(time * 9)) : 0; bounceVel += ((target - bounce) * 220 - bounceVel * 14) * dt; bounce += bounceVel * dt;
    const accY = (bounceVel - prevBounceVel) / Math.max(dt, 1e-3); prevBounceVel = bounceVel;
    creature.position.y = bounce; creature.scale.set(1 + bounce * 0.4, 1 - bounce * 0.3, 1 + bounce * 0.4); fc.grp.position.z = params.length * 0.55;
    if (boop) { boop.age += dt; if (boop.age > 1.5) boop = null; }
    const inertia: [number, number, number] = [0, accY * 0.4, 0];
    if (gpu && vPos) { const U = vPos.material.uniforms; U.uDt.value = dt; U.uTime.value = time; U.uWind.value = reduce ? 0 : params.wind; U.uInertia.value.set(...inertia); U.uMax.value = params.length;
      U.uPet.value.set(pet?.u ?? 0, pet?.v ?? 0, 0.12, pet ? 1 : 0); U.uPetDir.value.set(pet?.dx ?? 0, pet?.dy ?? 0, pet?.dz ?? 0); U.uBoop.value.set(boop?.u ?? 0, boop?.v ?? 0, boop ? boop.age : -1);
      gpu.compute(); uniforms.uPhys.value = gpu.getCurrentRenderTarget(vPos).texture; }
    else if (cpu && cpuTex) { stepPatches(cpu, { dt, time, stiffness: 60, damping: 0.12, gravity: 2, wind: reduce ? 0 : params.wind, inertia, pet, boop, maxLen: params.length }); cpuTex.needsUpdate = true; }
    uniforms.uTime.value = time; controls.update(); renderer.render(scene, camera);
    frames++; if (now - fpsT >= 1000) { fps = Math.round((frames * 1000) / (now - fpsT)); frames = 0; fpsT = now; opts.onStats?.(stats()); }
  }
  const loop = (now: number) => { raf = 0; if (disposed || !visible || document.hidden) { opts.onStats?.(stats()); return; } frame(now); if (!reduce || boop || pet || down) raf = requestAnimationFrame(loop); };
  function kick() { if (!raf && !disposed && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; kick(); }); io.observe(canvas);
  const onVis = () => kick(); document.addEventListener('visibilitychange', onVis);
  const ro = new ResizeObserver(() => { resize(); kick(); }); ro.observe(canvas);
  controls.addEventListener('change', kick);
  resize(); kick();
  function applyCoat() { uniforms.uRoot.value.set(coat.root); uniforms.uTip.value.set(coat.tip); uniforms.uSpecCol.value.set(coat.spec); (skin.material as THREE.MeshBasicMaterial).color.set(coat.root); fc.materials.eyeMat.color.set(coat.eye); fc.materials.blushMat.color.set(coat.blush); }
  function applyEnv() { uniforms.uKeyCol.value.set(env.key); uniforms.uRimCol.value.set(env.rim); uniforms.uAmbSky.value.set(env.ambientSky); uniforms.uAmbGround.value.set(env.ambientGround); uniforms.uAmb.value = env.ambient; }
  function triggerBoop(u = 0.75, v = 0.5) { boop = { u, v, age: 0 }; boops++; opts.onBoop?.(); opts.onStats?.(stats()); kick(); }
  return {
    triggerBoop: () => triggerBoop(),
    setSpeaking(on) { speaking = on; kick(); },
    setCoatPreset(id) { coat = coatById(id); applyCoat(); kick(); },
    setEnvironment(id) { env = envById(id); applyEnv(); kick(); },
    setParams(p) { const old = params; params = clampParams({ ...params, ...p }); Object.assign(uniforms, {}); uniforms.uLen.value = params.length; uniforms.uDensity.value = params.density; uniforms.uClump.value = params.clumping; uniforms.uCurl.value = params.curl; uniforms.uRough.value = params.roughness; uniforms.uSpec.value = params.specular; uniforms.uKey.value = params.keyLight; uniforms.uRim.value = params.rimLight; if (old.clumping !== params.clumping) buildFur(); kick(); },
    setGpu(on) { const want: Exclude<Tier, '2d'> = on ? 'gpu' : 'webgl'; if (want === tier) return; tier = want; buildFur(); buildPhysics(); opts.onStats?.(stats()); kick(); },
    stats,
    dispose() { disposed = true; cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); document.removeEventListener('visibilitychange', onVis); canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); controls.dispose(); gpu?.dispose(); cpuTex?.dispose(); geo.dispose(); shells?.geometry.dispose(); strands?.geometry.dispose(); shellMat.dispose(); strandMat.dispose(); renderer.dispose(); },
  };
}
