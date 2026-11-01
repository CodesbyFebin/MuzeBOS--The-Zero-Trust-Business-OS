'use client';
/**
 * MUSE fur simulator (clean-room on three.js, MIT). three.js loads only through dynamic import() after mount.
 * Guards: pauses when off-screen or the tab is hidden; reduced motion renders on demand with no wind or bounce;
 * low-end devices or no WebGL fall back to the Canvas 2D MuseAvatar. AR View asks for the camera only after
 * the user clicks "Start camera", shows the feed locally, and never records or uploads it.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { MuseAvatar, type MuseState } from './MuseAvatar';
import { COAT_PRESETS, FUR_DEFAULTS, FUR_SLIDERS, coatById, nextCoat, type CoatPresetId, type FurParams } from '@/lib/metabos/fur-sim/presets';
import { ENVIRONMENTS, envById, type EnvId } from '@/lib/metabos/fur-sim/environments';
import { chooseTier, downgrade, probeCaps, type Tier } from '@/lib/metabos/fur-sim/capability';
import type { MuseController, MuseStats } from '@/lib/metabos/fur-sim/controller';

export type MuseFurHandle = Omit<MuseController, 'dispose' | 'setParams' | 'setGpu' | 'stats'> & { flipCoat(): CoatPresetId; coat(): CoatPresetId };
type Props = { state: MuseState; coat: CoatPresetId; onCoatChange(id: CoatPresetId): void; size?: number };

export const MuseFurSimulator = forwardRef<MuseFurHandle, Props>(function MuseFurSimulator({ state, coat, onCoatChange, size = 320 }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null); const video = useRef<HTMLVideoElement>(null);
  const eng = useRef<MuseController | null>(null);
  const [tier, setTier] = useState<Tier | null>(null); const [reason, setReason] = useState('');
  const [env, setEnv] = useState<EnvId>('studio'); const [lab, setLab] = useState(false); const [params, setParams] = useState<FurParams>(FUR_DEFAULTS);
  const [gpuOn, setGpuOn] = useState(true); const [stats, setStats] = useState<MuseStats | null>(null); const [boops2d, setBoops2d] = useState(0);
  const [cam, setCam] = useState<'off' | 'asking' | 'on' | 'denied'>('off'); const stream = useRef<MediaStream | null>(null);
  const coatRef = useRef(coat); coatRef.current = coat;

  const slow = useRef(0); const forcedRef = useRef(false); const [measured, setMeasured] = useState('');
  const onStats = useCallback((st: MuseStats) => {
    setStats(st); if (st.fps == null || st.paused || forcedRef.current) return;
    const slowNow = (st.tier === 'gpu' && st.fps < 24) || (st.tier === 'webgl' && st.fps < 12); slow.current = slowNow ? slow.current + 1 : 0;
    const d = downgrade(st.tier, st.fps, slow.current); if (!d) return; slow.current = 0;
    setMeasured((m) => `${m}${m ? '; ' : ''}${st.tier} ran ${st.fps} fps`);
    if (d === 'webgl') { eng.current?.setGpu(false); setGpuOn(false); setReason(`slow GPU (${st.fps} fps)`); }
    else { eng.current?.dispose(); eng.current = null; setStats(null); setTier('2d'); setReason(`too slow for WebGL (${st.fps} fps)`); }
  }, []);
  useEffect(() => { // choose tier, then lazy-load the engine
    const caps = probeCaps(); const forced = new URLSearchParams(location.search).get('muse'); forcedRef.current = forced === 'webgl' || forced === 'gpu'; // ?muse=2d|webgl|gpu for testing
    const t: Tier = forced === '2d' ? '2d' : forced === 'webgl' ? (chooseTier(caps, false) === '2d' ? '2d' : 'webgl') : forced === 'gpu' && caps.webgl2 && caps.floatRT ? 'gpu' : chooseTier(caps, true);
    setReason(t === '2d' ? (forced === '2d' ? 'forced 2D' : !caps.webgl1 && !caps.webgl2 ? 'no WebGL' : 'low-end device') : t === 'webgl' ? (forced === 'webgl' ? 'forced WebGL' : caps.software ? 'software GPU' : caps.reducedMotion ? 'reduced motion' : !caps.floatRT ? 'no float render targets' : 'GPU fur off') : 'GPGPU');
    setTier(t); setGpuOn(t === 'gpu');
    if (t === '2d') return;
    let alive = true;
    import('@/lib/metabos/fur-sim/engine').then(({ createFurEngine }) => {
      if (!alive || !canvas.current) return;
      try { eng.current = createFurEngine(canvas.current, { tier: t, coat: coatRef.current, env: 'studio', reducedMotion: caps.reducedMotion, onStats }); setStats(eng.current.stats()); }
      catch { setTier('2d'); setReason('WebGL init failed'); }
    }).catch(() => { setTier('2d'); setReason('engine failed to load'); });
    return () => { alive = false; eng.current?.dispose(); eng.current = null; };
  }, []);
  useEffect(() => { eng.current?.setCoatPreset(coat); }, [coat, stats === null]);
  useEffect(() => { eng.current?.setSpeaking(state === 'speaking'); }, [state]);
  const stopCam = useCallback(() => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; if (video.current) video.current.srcObject = null; setCam('off'); }, []);
  useEffect(() => () => stopCam(), [stopCam]);
  const pickEnv = useCallback((id: EnvId) => { setEnv(id); eng.current?.setEnvironment(id); if (id !== 'ar') stopCam(); }, [stopCam]);
  async function startCam() { // only ever called from a click
    setCam('asking');
    try { const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); stream.current = s; if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => undefined); } setCam('on'); }
    catch { setCam('denied'); }
  }
  const boop = useCallback(() => { if (eng.current) eng.current.triggerBoop(); else setBoops2d((b) => b + 1); }, []);
  const flipCoat = useCallback(() => { const n = nextCoat(coatRef.current); onCoatChange(n); return n; }, [onCoatChange]);
  useImperativeHandle(ref, () => ({ triggerBoop: boop, setSpeaking: (on) => eng.current?.setSpeaking(on), setCoatPreset: (id) => onCoatChange(id), setEnvironment: (id) => pickEnv(id === 'ar' ? 'studio' : id), flipCoat, coat: () => coatRef.current }), [boop, onCoatChange, pickEnv, flipCoat]);
  const setParam = (k: keyof FurParams, v: number) => { const p = { ...params, [k]: v }; setParams(p); eng.current?.setParams(p); };
  const E = envById(env); const c = coatById(coat);
  const boopCount = stats?.boops ?? boops2d;

  return <div className="mb-fur" data-testid="muse-fur" data-tier={tier ?? 'loading'} data-env={env} data-coat={coat} data-fps={stats?.fps ?? ''} data-boops={boopCount} data-paused={stats?.paused ? 'true' : 'false'} data-downgrades={measured}>
    <nav className="mb-fur-envs" aria-label="MUSE scene">
      {ENVIRONMENTS.map((e) => <button key={e.id} type="button" aria-pressed={env === e.id} onClick={() => pickEnv(e.id)} data-testid={`fur-env-${e.id}`}>{e.label}</button>)}
    </nav>
    <div className="mb-fur-stage" style={{ background: E.backdrop, height: size }}>
      {E.usesCamera && <video ref={video} className="mb-fur-video" muted playsInline aria-hidden="true" hidden={cam !== 'on'} />}
      {tier === '2d' ? <button type="button" className="mb-fur-2d" onClick={boop} aria-label={`Boop MUSE (${c.label} coat)`}><MuseAvatar state={state} coat={c.legacy2d} size={Math.min(size, 240)} /></button>
        : <canvas ref={canvas} className="mb-fur-canvas" role="img" aria-label={`MUSE 3D fur creature, ${c.label} coat, ${state}. Drag to orbit, drag across MUSE to pet, click MUSE to boop.`} data-testid="muse-fur-canvas" />}
      {E.usesCamera && cam !== 'on' && <div className="mb-fur-ar" role="region" aria-label="AR camera">
        <p>AR View places MUSE over your camera. The feed stays on this device and is never recorded or uploaded. Your browser will ask for permission.</p>
        {cam === 'denied' && <p className="mb-warn" role="status">Camera unavailable or permission denied.</p>}
        <button type="button" onClick={() => void startCam()} disabled={cam === 'asking'} data-testid="fur-ar-start">{cam === 'asking' ? 'Waiting for permission…' : 'Start camera'}</button>
      </div>}
      {E.usesCamera && cam === 'on' && <button type="button" className="mb-fur-ar-stop" onClick={stopCam} data-testid="fur-ar-stop">Stop camera</button>}
    </div>
    <ul className="mb-fur-stats" aria-label="Fur stats" data-testid="fur-stats">
      <li>{tier === '2d' ? `2D fallback (${reason})` : `${stats?.shells ?? '…'} shells`}</li>
      {tier !== '2d' && <li>{stats ? stats.strands.toLocaleString('en-IN') : '…'} strands</li>}
      {tier !== '2d' && <li>{stats?.gpgpu ? 'GPGPU physics' : `CPU physics (${reason})`}</li>}
      <li>{boopCount} boops</li>
      {tier !== '2d' && <li>{stats?.fps != null ? `${stats.fps} fps` : 'fps measuring'}</li>}
    </ul>
    <div className="mb-fur-row">
      <button type="button" onClick={boop} data-testid="fur-boop">Boop</button>
      <button type="button" onClick={flipCoat} data-testid="fur-coat-next" aria-label={`Coat: ${c.label}. Switch to next coat`}>🐾 {c.label}</button>
      <button type="button" aria-expanded={lab} aria-controls="fur-lab" onClick={() => setLab(!lab)} data-testid="fur-lab-toggle">Fur Lab</button>
    </div>
    {lab && <section id="fur-lab" className="mb-fur-lab" aria-label="Fur Lab" data-testid="fur-lab">
      <fieldset><legend>Coat preset</legend><div className="mb-fur-row">{COAT_PRESETS.map((p) => <button key={p.id} type="button" aria-pressed={coat === p.id} onClick={() => onCoatChange(p.id)} data-testid={`fur-coat-${p.id}`}><span className="mb-fur-swatch" style={{ background: `linear-gradient(135deg, ${p.root}, ${p.tip})` }} aria-hidden="true" />{p.label}</button>)}</div></fieldset>
      {FUR_SLIDERS.map((s) => <label key={s.key} className="mb-fur-slider">{s.label} <span className="mb-muted">{params[s.key]}</span>
        <input type="range" min={s.min} max={s.max} step={s.step} value={params[s.key]} onChange={(e) => setParam(s.key, Number(e.target.value))} disabled={tier === '2d'} data-testid={`fur-slider-${s.key}`} /></label>)}
      <label className="mb-voice-opt"><input type="checkbox" checked={gpuOn} disabled={tier === '2d'} onChange={(e) => { setGpuOn(e.target.checked); setReason(e.target.checked ? 'GPGPU' : 'GPU fur off'); eng.current?.setGpu(e.target.checked); }} data-testid="fur-gpu" /> GPU fur (GPGPU physics, 60k strands)</label>
      {tier === '2d' && <p className="mb-muted">Sliders need WebGL; this device uses the 2D MUSE.</p>}
    </section>}
  </div>;
});
