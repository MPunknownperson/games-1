// AI Packages: time-bounded behavioral modules layered over the utility planner.
// A package does not issue a fixed path. It gives a desire a temporary weight, target and
// preferred activity; needs, danger and personality still compete for what happens next.
import type { Point } from './simulation';

export type PackageKind = 'work' | 'meal' | 'social' | 'home' | 'patrol' | 'errand';
export type PackageTarget = 'work' | 'home' | 'social' | 'tavern' | 'patrol';

export interface AiPackage {
  id: string;
  label: string;
  kind: PackageKind;
  start: number;
  end: number;
  priority: number;
  target: PackageTarget;
  activity: string;
}

export interface RoutineWindow {
  wake: number;
  workStart: number;
  workEnd: number;
  bedtime: number;
}

const WORK_LABEL: Record<string, string> = {
  Keeper: 'Keeping watch', Merchant: 'Minding the stall', Warden: 'Patrolling', Mason: 'Masonry', Woodcutter: 'Chopping',
  Herbalist: 'Gathering herbs', Farmer: 'Tending fields', Forager: 'Foraging', Apprentice: 'Studying', Smith: 'Forging',
  Gardener: 'Gardening', Baker: 'Baking', Scout: 'Scouting',
};

export const PACKAGE_LABELS: Record<PackageKind, string> = {
  work: 'Work', meal: 'Visit tavern for a meal', social: 'Visit the village', home: 'Return home to sleep', patrol: 'Patrol', errand: 'Errand',
};

/** Inclusive-start, exclusive-end test with support for schedules that cross midnight. */
export function inPackageWindow(start: number, end: number, hour: number) {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/** The highest-priority package currently in force. */
export function activePackage(packages: AiPackage[] | undefined, hour: number): AiPackage | undefined {
  if (!packages?.length) return undefined;
  let best: AiPackage | undefined;
  for (const pkg of packages) {
    if (!inPackageWindow(pkg.start, pkg.end, hour)) continue;
    if (!best || pkg.priority > best.priority) best = pkg;
  }
  return best;
}

/**
 * Build a personal package set from the routine. The blacksmith's day is the clearest example:
 * forge in the morning, a real midday meal at the tavern, forge again, then lock the house at night.
 */
export function makePackages(routine: RoutineWindow, profession: string, personal?: Partial<Record<PackageKind, number>>, workLabel = WORK_LABEL[profession] ?? 'Working'): AiPackage[] {
  const lunchStart = Math.max(routine.workStart + 1.5, Math.min(11.75, routine.workEnd - 0.75));
  const lunchEnd = Math.min(routine.workEnd - 0.25, lunchStart + 1.25);
  const dinnerGap = Math.max(0, routine.bedtime - routine.workEnd);
  const p = (kind: PackageKind, fallback: number) => personal?.[kind] ?? fallback;
  const workStart = routine.workStart;
  const workEnd = routine.workEnd;
  const packages: AiPackage[] = [
    { id: 'morning-work', label: workLabel, kind: 'work', start: workStart, end: lunchStart, priority: p('work', 0.58), target: 'work', activity: workLabel },
    { id: 'midday-meal', label: PACKAGE_LABELS.meal, kind: 'meal', start: lunchStart, end: lunchEnd, priority: p('meal', 0.78), target: 'tavern', activity: 'At the tavern' },
    { id: 'afternoon-work', label: workLabel, kind: 'work', start: lunchEnd, end: workEnd, priority: p('work', 0.56), target: 'work', activity: workLabel },
  ];
  if (dinnerGap > 1.2) {
    packages.push({
      id: 'evening-company', label: PACKAGE_LABELS.social, kind: 'social',
      start: Math.min(workEnd + 0.35, routine.bedtime - 1.2), end: routine.bedtime - 0.25,
      priority: p('social', 0.48), target: 'social', activity: 'At the tavern',
    });
  }
  packages.push({
    id: 'home-to-sleep', label: PACKAGE_LABELS.home, kind: 'home',
    start: routine.bedtime - 0.25, end: routine.wake + 0.25,
    priority: p('home', 1), target: 'home', activity: 'Sleeping',
  });
  if (profession === 'Warden') {
    packages.push({
      id: 'watch-patrol', label: PACKAGE_LABELS.patrol, kind: 'patrol',
      start: routine.workStart, end: routine.workEnd, priority: p('patrol', 0.7), target: 'patrol', activity: 'Patrolling',
    });
  }
  return packages.sort((a, b) => a.start - b.start || a.priority - b.priority);
}

/** A package can point at a place, but only the simulation resolves the world object. */
export function packagePoint(pkg: AiPackage | undefined, points: Partial<Record<PackageTarget, Point>>): Point | undefined {
  return pkg ? points[pkg.target] : undefined;
}
