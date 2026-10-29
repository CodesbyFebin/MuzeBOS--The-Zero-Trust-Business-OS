import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STATIONS } from '@/lib/metabos/arena/snapshot';
import { layoutActors, type FloorActor } from '@/lib/metabos/arena/floor-layout';
export type ArenaScene = { update: (actors: FloorActor[], selected: string | null) => void; reset: () => void; zoom: (factor: number) => void; dispose: () => void };
/** Original procedural models; this renderer never sends an action to the server. */
export function createArenaScene(host: HTMLElement, onSelect: (id: string) => void, onLost: () => void): ArenaScene {
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
  const scene = new T.Scene(), camera = new T.PerspectiveCamera(42, 1, .1, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  const geometries: T.BufferGeometry[] = [], materials: T.Material[] = [], textures: T.Texture[] = [];
  const boxes = new Map<string, T.BoxGeometry>();
  const ringGeometry = new T.TorusGeometry(.48, .035, 6, 24); geometries.push(ringGeometry);
  const robots = new Map<string, { node: T.Group; limbs: T.Group; ring: T.Mesh; material: T.MeshStandardMaterial; target: T.Vector3; leased: boolean }>();
  let disposed = false, frame = 0, last = 0, visible = true, dirty = true, previous = performance.now();
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const style = getComputedStyle(host), token = (key: string) => style.getPropertyValue(key).trim();
  const colors = { bg: token('--mb-bg'), panel: token('--mb-panel'), raised: token('--mb-raised'), line: token('--mb-line'), text: token('--mb-text'), accent: token('--mb-accent'), warn: token('--mb-amber'), good: token('--mb-success'), blue: token('--mb-blue') };
  const material = (color: string, glow = false) => { const m = new T.MeshStandardMaterial({ color, roughness: .65, metalness: .2, ...(glow ? { emissive: color, emissiveIntensity: .5 } : {}) }); materials.push(m); return m; };
  const dark = material(colors.panel), base = material(colors.raised), line = material(colors.line), screen = material(colors.blue, true);
  function box(parent: T.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, m: T.Material) {
    const key = `${w}:${h}:${d}`; let g = boxes.get(key);
    if (!g) { g = new T.BoxGeometry(w, h, d); geometries.push(g); boxes.set(key, g); } const mesh = new T.Mesh(g, m); mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  }
  function label(text: string, x: number, y: number, z: number, width = 5) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 80;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = colors.text; ctx.font = '28px monospace'; ctx.textAlign = 'center'; ctx.fillText(text, 256, 49, 500);
    const texture = new T.CanvasTexture(canvas); textures.push(texture); const m = new T.SpriteMaterial({ map: texture, depthTest: false }); materials.push(m);
    const sprite = new T.Sprite(m); sprite.scale.set(width, width * 80 / 512, 1); sprite.position.set(x, y, z); scene.add(sprite);
  }
  function dispose() {
    if (disposed) return; disposed = true; cancelAnimationFrame(frame);
    observer.disconnect(); resize.disconnect(); document.removeEventListener('visibilitychange', visibility);
    motion.removeEventListener('change', changed); controls.dispose();
    renderer.domElement.removeEventListener('pointerdown', pointerDown); renderer.domElement.removeEventListener('pointerup', pointerUp); renderer.domElement.removeEventListener('webglcontextlost', lost);
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); scene.clear(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
  }
  const changed = () => { dirty = true; };
  const visibility = () => { dirty = true; previous = performance.now(); };
  const observer = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? true; dirty = true; });
  const resize = new ResizeObserver(() => { const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight); camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h, false); reset(); dirty = true; });
  const ray = new T.Raycaster(), pointer = new T.Vector2(); let down = { x: 0, y: 0 };
  function pointerDown(e: PointerEvent) { down = { x: e.clientX, y: e.clientY }; }
  function pointerUp(e: PointerEvent) {
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    const rect = renderer.domElement.getBoundingClientRect(); pointer.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1);
    ray.setFromCamera(pointer, camera); const hit = ray.intersectObjects([...robots.values()].map(r => r.node), true)[0];
    let node: T.Object3D | null = hit?.object ?? null; while (node && !node.userData.taskId) node = node.parent;
    if (node) onSelect(node.userData.taskId as string);
  }
  function lost(e: Event) { e.preventDefault(); onLost(); }
  function reset() { camera.position.set(10, 12, 14).multiplyScalar(Math.max(1, 1.6 / camera.aspect)); controls.target.set(0, 0, 0); controls.update(); dirty = true; }
  function zoom(factor: number) { const offset = camera.position.clone().sub(controls.target); offset.setLength(T.MathUtils.clamp(offset.length() * factor, 13, 90)); camera.position.copy(controls.target).add(offset); controls.update(); dirty = true; }
  try {
    scene.background = new T.Color(colors.bg); renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    renderer.domElement.setAttribute('aria-hidden', 'true'); host.append(renderer.domElement);
    scene.add(new T.HemisphereLight(colors.text, colors.panel, 2)); const light = new T.DirectionalLight(colors.text, 3); light.position.set(5, 16, 8); scene.add(light);
    controls.enableDamping = false; controls.enablePan = false; controls.minDistance = 13; controls.maxDistance = 90; controls.minPolarAngle = .2; controls.maxPolarAngle = Math.PI / 2.3;
    reset(); box(scene, 21, .2, 12, 0, -.2, 0, base);
    for (const s of STATIONS) {
      const x = (s.x - 465) / 45, z = (s.y - 220) / 45;
      box(scene, 5.7, .12, 4, x, -.04, z, dark); box(scene, 5.7, .04, .04, x, .04, z - 2, line);
      label(s.label, x, 2.5, z - 1.4);
      for (let n = 0; n < 4; n++) { const dx = x - 1.8 + n * 1.2;
        box(scene, 1, .12, .65, dx, .8, z - .55, base); box(scene, .1, .8, .1, dx, .35, z - .55, line);
        box(scene, .64, .38, .08, dx, 1.12, z - .65, line); box(scene, .52, .28, .02, dx, 1.12, z - .595, screen);
      }
    }
    label('RECORDED ASSIGNMENTS / JEV APPROVAL REQUIRED', 0, .2, 5.7, 11);
    controls.addEventListener('change', changed); observer.observe(host); resize.observe(host);
    document.addEventListener('visibilitychange', visibility); motion.addEventListener('change', changed);
    renderer.domElement.addEventListener('pointerdown', pointerDown); renderer.domElement.addEventListener('pointerup', pointerUp); renderer.domElement.addEventListener('webglcontextlost', lost);
    const animate = (now: number) => {
      if (disposed) return; frame = requestAnimationFrame(animate);
      if (!visible || document.hidden || now - last < 33) { previous = now; return; }
      const dt = Math.min(.1, (now - previous) / 1000); previous = now; last = now;
      let active = false;
      for (const robot of robots.values()) {
        const moving = robot.node.position.distanceTo(robot.target) > .01;
        if (moving) { robot.node.position.lerp(robot.target, motion.matches ? 1 : Math.min(1, dt * 5)); active = true; }
        robot.limbs.rotation.z = !motion.matches && moving ? Math.sin(now / 100) * .12 : 0;
        robot.limbs.position.y = !motion.matches && robot.leased ? Math.sin(now / 300) * .035 : 0;
        active ||= !motion.matches && robot.leased;
      }
      if (dirty || active) { renderer.render(scene, camera); dirty = false; }
    }; frame = requestAnimationFrame(animate);
    return { reset, zoom, dispose, update(actors, selected) {
      const layout = layoutActors(actors), ids = new Set(layout.map(a => a.id));
      for (const [id, r] of robots) if (!ids.has(id)) { scene.remove(r.node); r.material.dispose(); materials.splice(materials.indexOf(r.material), 1); robots.delete(id); }
      for (const a of layout) {
        let r = robots.get(a.id);
        if (!r) {
          const node = new T.Group(), limbs = new T.Group(), m = material(colors.accent); node.userData.taskId = a.id; node.add(limbs);
          box(limbs, .47, .46, .3, 0, .72, 0, m); box(limbs, .48, .36, .38, 0, 1.17, 0, m);
          box(limbs, .34, .12, .03, 0, 1.2, .2, screen);
          box(limbs, .1, .4, .13, -.33, .7, 0, m); box(limbs, .1, .4, .13, .33, .7, 0, m);
          box(limbs, .14, .32, .18, -.15, .3, 0, m); box(limbs, .14, .32, .18, .15, .3, 0, m);
          const ring = new T.Mesh(ringGeometry, screen); ring.rotation.x = Math.PI / 2; ring.position.y = .07; node.add(ring);
          node.position.set(a.x, 0, a.z); node.rotation.y = 0; scene.add(node);
          r = { node, limbs, ring, material: m, target: node.position.clone(), leased: false }; robots.set(a.id, r);
        }
        r.target.set(a.x, 0, a.z); r.leased = a.leased; r.ring.visible = a.id === selected;
        r.material.color.set(a.station === 'jev' ? colors.warn : a.leased ? colors.good : colors.accent);
      }
      renderer.domElement.dataset.actorCount = String(layout.length); dirty = true;
    } };
  } catch (error) { dispose(); throw error; }
}
