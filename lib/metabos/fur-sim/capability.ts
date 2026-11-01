/** Renderer tier choice. 'gpu' = GPGPU Verlet + 60k strands; 'webgl' = CPU Verlet fallback + fewer strands; '2d' = existing Canvas 2D MUSE. */
export type Tier = 'gpu' | 'webgl' | '2d';
export type Caps = { webgl2: boolean; webgl1: boolean; floatRT: boolean; cores: number | null; memoryGB: number | null; saveData: boolean; reducedMotion: boolean; maxTex: number; software?: boolean };
export function chooseTier(c: Caps, wantGpu = true): Tier {
  if (!c.webgl1 && !c.webgl2) return '2d';
  if (c.saveData) return '2d';
  if ((c.cores !== null && c.cores <= 2) || (c.memoryGB !== null && c.memoryGB <= 2)) return '2d';
  if (c.maxTex < 2048) return '2d';
  if (c.software) return 'webgl'; // SwiftShader / llvmpipe: CPU-rendered GL, keep the light tier
  if (wantGpu && c.webgl2 && c.floatRT && !c.reducedMotion) return 'gpu';
  return 'webgl';
}
export const TIER_BUDGET: Record<Exclude<Tier, '2d'>, { shells: number; strands: number; physics: number; segments: number }> = {
  gpu: { shells: 64, strands: 60000, physics: 128, segments: 20 },
  webgl: { shells: 32, strands: 12000, physics: 32, segments: 10 },
};
export function probeCaps(): Caps {
  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } }) : undefined;
  const cv = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  let webgl2 = false, webgl1 = false, floatRT = false, maxTex = 0, software = false;
  try {
    const g2 = cv?.getContext('webgl2') as WebGL2RenderingContext | null | undefined;
    if (g2) { webgl2 = true; software = isSoftware(g2); floatRT = !!g2.getExtension('EXT_color_buffer_float'); maxTex = g2.getParameter(g2.MAX_TEXTURE_SIZE); g2.getExtension('WEBGL_lose_context')?.loseContext(); }
    else { const g1 = (cv?.getContext('webgl') ?? null) as WebGLRenderingContext | null; if (g1) { webgl1 = true; software = isSoftware(g1); maxTex = g1.getParameter(g1.MAX_TEXTURE_SIZE); g1.getExtension('WEBGL_lose_context')?.loseContext(); } }
  } catch { /* no GL */ }
  return { webgl2, webgl1, floatRT, maxTex, software, cores: nav?.hardwareConcurrency ?? null, memoryGB: nav?.deviceMemory ?? null, saveData: !!nav?.connection?.saveData, reducedMotion: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches };
}
function isSoftware(g: WebGLRenderingContext | WebGL2RenderingContext) {
  const ext = g.getExtension('WEBGL_debug_renderer_info'); const r = String(ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER));
  return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(r);
}
/** Adaptive downgrade from measured fps: gpu->webgl under 24 fps, webgl->2d under 12 fps, after two slow seconds. */
export function downgrade(tier: Tier, fps: number, slowSeconds: number): Tier | null {
  if (slowSeconds < 2) return null;
  if (tier === 'gpu' && fps < 24) return 'webgl';
  if (tier === 'webgl' && fps < 12) return '2d';
  return null;
}
