import { getProject, types, val, type IProject } from '@theatre/core';
import projectState from './choreography.json';

export type AttackName = 'attack1' | 'attack2' | 'attack3';
const PROJECT_ID = 'Preserve Choreography';
const DEFAULT_TIMING: Record<AttackName, { windup: number; recovery: number; shakeScale: number }> = {
  attack1: { windup: 0.2, recovery: 0.28, shakeScale: 0.055 },
  attack2: { windup: 0.2, recovery: 0.28, shakeScale: 0.07 },
  attack3: { windup: 0.4, recovery: 0.32, shakeScale: 0.12 },
};
const SHEETS: Record<AttackName, string> = { attack1: 'Attack One', attack2: 'Attack Two', attack3: 'Attack Three' };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function createAttack(project: IProject, attack: AttackName) {
  const sheet = project.sheet(SHEETS[attack]);
  const defaults = DEFAULT_TIMING[attack];
  const timing = sheet.object('Timing', {
    windup: types.number(defaults.windup, { range: [0.05, 2] }),
    recovery: types.number(defaults.recovery, { range: [0.05, 2] }),
    shakeScale: types.number(defaults.shakeScale, { range: [0, 0.5] }),
  }, { reconfigure: true });
  const motion = sheet.object('Motion', { windup: 0, strike: 0, effect: 0, shake: 0 }, { reconfigure: true });
  return { sheet, timing, motion };
}

function createCinematic(project: IProject) {
  const sheet = project.sheet('Cinematic');
  const camera = sheet.object('Camera', { x: 14, y: 16, z: 18, targetY: 2, weight: 0, shake: 0 }, { reconfigure: true });
  return { sheet, camera };
}

function createRecoil(project: IProject) {
  const sheet = project.sheet('Recoil');
  const motion = sheet.object('Motion', { recoil: 0 }, { reconfigure: true });
  return { sheet, motion };
}

let runtime: { attacks: Record<AttackName, ReturnType<typeof createAttack>>; cinematic: ReturnType<typeof createCinematic>;
  recoil: ReturnType<typeof createRecoil> } | undefined;
let pending: Promise<boolean> | undefined;
export let choreographyStatus: 'idle' | 'loading' | 'ready' | 'fallback' = 'idle';

export function initializeChoreography() {
  if (pending) return pending;
  choreographyStatus = 'loading';
  pending = (async () => {
    if (import.meta.env?.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('theatre')) {
      const studio = (await import('@theatre/studio')).default;
      studio.initialize();
    }
    const project = getProject(PROJECT_ID, { state: projectState });
    const attacks = { attack1: createAttack(project, 'attack1'), attack2: createAttack(project, 'attack2'), attack3: createAttack(project, 'attack3') };
    const cinematic = createCinematic(project);
    const recoil = createRecoil(project);
    await project.ready;
    runtime = { attacks, cinematic, recoil };
    choreographyStatus = 'ready';
    return true;
  })().catch((error: unknown) => {
    if (import.meta.env?.DEV) console.warn('Theatre choreography unavailable:', error);
    choreographyStatus = 'fallback';
    return false;
  });
  return pending;
}

export function attackTiming(attack: AttackName) {
  const values = runtime?.attacks[attack].timing.value ?? DEFAULT_TIMING[attack];
  const windup = clamp(values.windup, 0.05, 2), recovery = clamp(values.recovery, 0.05, 2);
  return { windup, recovery, duration: windup + recovery, shakeScale: clamp(values.shakeScale, 0, 0.5) };
}

export function sampleAttack(attack: AttackName, elapsed: number) {
  const timeline = runtime?.attacks[attack];
  if (!timeline) {
    const timing = attackTiming(attack), phase = clamp(elapsed / timing.duration, 0, 1);
    return { windup: Math.min(1, phase / 0.4), strike: clamp((phase - 0.4) / 0.3, 0, 1), effect: 0, shake: 0 };
  }
  const length = val(timeline.sheet.sequence.pointer.length);
  timeline.sheet.sequence.position = clamp(elapsed / attackTiming(attack).duration, 0, 1) * length;
  return timeline.motion.value;
}

export function sampleCinematic(progress: number) {
  if (!runtime) return { x: 14, y: 16, z: 18, targetY: 2, weight: Math.sin(clamp(progress, 0, 1) * Math.PI), shake: 0 };
  const { sheet, camera } = runtime.cinematic;
  sheet.sequence.position = clamp(progress, 0, 1) * val(sheet.sequence.pointer.length);
  return camera.value;
}

export function sampleRecoil(elapsed: number) {
  if (!runtime) return Math.sin(clamp(elapsed / 0.3, 0, 1) * Math.PI);
  const { sheet, motion } = runtime.recoil;
  sheet.sequence.position = clamp(elapsed, 0, val(sheet.sequence.pointer.length));
  return clamp(motion.value.recoil, 0, 1);
}

export async function exportChoreographyState() {
  if (!import.meta.env?.DEV || typeof window === 'undefined' || !new URLSearchParams(window.location.search).has('theatre')) {
    throw new Error('Open the Theatre editor before exporting.');
  }
  await initializeChoreography();
  const studio = (await import('@theatre/studio')).default;
  return studio.createContentOfSaveFile(PROJECT_ID);
}