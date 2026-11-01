/** Four scene presets. AR View shows the user's camera only after they click "Start camera"; nothing is recorded. */
export type EnvId = 'studio' | 'cloud-sky' | 'cozy-desk' | 'ar';
export type EnvPreset = { id: EnvId; label: string; backdrop: string; key: string; rim: string; ambientSky: string; ambientGround: string; ambient: number; usesCamera: boolean };
export const ENVIRONMENTS: EnvPreset[] = [
  { id: 'studio', label: 'Studio', backdrop: 'radial-gradient(circle at 50% 40%, #1c1c1c 0%, #0A0A0A 70%)', key: '#ffffff', rim: '#FF2A2A', ambientSky: '#3a3a3a', ambientGround: '#0a0a0a', ambient: 0.5, usesCamera: false },
  { id: 'cloud-sky', label: 'Cloud Sky', backdrop: 'linear-gradient(180deg, #2b2b2b 0%, #4a4a4a 55%, #6a6a6a 100%)', key: '#fff4e6', rim: '#ffffff', ambientSky: '#cfcfcf', ambientGround: '#3a3a3a', ambient: 0.8, usesCamera: false },
  { id: 'cozy-desk', label: 'Cozy Desk', backdrop: 'linear-gradient(180deg, #161616 0%, #161616 62%, #3a2412 62%, #24160b 100%)', key: '#ffd2a0', rim: '#ff8a4a', ambientSky: '#4a3424', ambientGround: '#120a04', ambient: 0.55, usesCamera: false },
  { id: 'ar', label: 'AR View', backdrop: '#0A0A0A', key: '#ffffff', rim: '#ffffff', ambientSky: '#bdbdbd', ambientGround: '#333333', ambient: 0.9, usesCamera: true },
];
export const envById = (id: string | null | undefined): EnvPreset => ENVIRONMENTS.find((e) => e.id === id) ?? ENVIRONMENTS[0];
export const isEnvId = (id: unknown): id is EnvId => typeof id === 'string' && ENVIRONMENTS.some((e) => e.id === id);
