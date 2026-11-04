/** Model-written frames. Runs only when a server model is configured; otherwise the caller shows an empty state. */
import type { BusinessStore } from '../store';
import { BusinessError } from '../store';
import { serverProviders, META_DEFAULT_MODEL, type Provider } from '../ai/providers';
import { patchFrame } from './store';
type Env = Record<string, string | undefined>;
export function canvasModel(env: Env, f: typeof fetch = fetch): { provider: Provider; model: string } | null {
  const p = serverProviders(env, f);
  if (p.meta.status().state === 'ready') return { provider: p.meta, model: META_DEFAULT_MODEL };
  if (p.openrouter.status().state === 'ready' && env.OPENROUTER_MODEL?.trim()) return { provider: p.openrouter, model: env.OPENROUTER_MODEL.trim() };
  return null;
}
const SYS = 'You write one self-contained HTML fragment with inline CSS for a design frame. Use only #0A0A0A and #FF2A2A plus white text. No scripts, no external URLs. Reply with HTML only.';
/** Calls the model once, then writes the reply into the frame in chunks so SSE viewers see it arrive. */
export async function generateIntoFrame(s: BusinessStore, actor: string, frameId: string, brief: string, env: Env = process.env, f: typeof fetch = fetch) {
  const m = canvasModel(env, f); if (!m) throw new BusinessError('No model configured', 409);
  const r = await m.provider.chat(m.model, [{ role: 'system', content: SYS }, { role: 'user', content: brief.slice(0, 2000) }]);
  const html = r.text.replace(/^```(?:html)?\s*|```\s*$/g, '').replace(/<script[\s\S]*?<\/script>/gi, '');
  patchFrame(s, actor, { id: frameId, html: '' });
  for (let i = 0; i < html.length; i += 2000) { patchFrame(s, actor, { id: frameId, appendHtml: html.slice(i, i + 2000) }); await new Promise((res) => setTimeout(res, 120)); }
  s.appendEvidence('canvas.frame.generate', frameId, JSON.stringify({ by: actor, provider: r.provider, model: r.model, bytes: html.length }));
  return { provider: r.provider, model: r.model, bytes: html.length };
}
