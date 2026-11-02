import type { CoatPresetId, FurParams } from './presets';
import type { EnvId } from './environments';
import type { Tier } from './capability';
/** API the voice assistant (or anything else) uses to drive MUSE. Same shape for the 3D engine and the 2D fallback. */
export type MuseController = {
  triggerBoop(): void;
  setSpeaking(on: boolean): void;
  setCoatPreset(id: CoatPresetId): void;
  setEnvironment(id: EnvId): void;
  setParams(p: Partial<FurParams>): void;
  setGpu(on: boolean): void;
  stats(): MuseStats;
  dispose(): void;
};
export type MuseStats = { tier: Tier; shells: number; strands: number; gpgpu: boolean; boops: number; fps: number | null; paused: boolean };
