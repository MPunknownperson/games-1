import type { Actor, FoeKind, Point, SandboxWorld } from './simulation';
import type { Goal } from './vivid';
import { brainFor } from './brains';

export type RoleDuty = 'protect' | 'patrol' | 'trade' | 'craft' | 'gather' | 'heal' | 'scout' | 'grow' | 'feed' | 'study';
export const PROFESSION_DUTIES: Record<string, RoleDuty> = {
  Keeper: 'protect', Merchant: 'trade', Warden: 'patrol', Mason: 'craft', Woodcutter: 'gather',
  Herbalist: 'heal', Farmer: 'grow', Forager: 'scout', Apprentice: 'study', Smith: 'craft',
  Gardener: 'grow', Baker: 'feed', Scout: 'scout',
};

export const FOE_BEHAVIORS: Record<FoeKind, { duty: 'swarm' | 'siege' | 'support' | 'ambush'; patrolRadius: number; gathers: boolean }> = {
  slime: { duty: 'swarm', patrolRadius: 8, gathers: false },
  brute: { duty: 'siege', patrolRadius: 4, gathers: true },
  wisp: { duty: 'support', patrolRadius: 5, gathers: false },
  stalker: { duty: 'ambush', patrolRadius: 16, gathers: false },
};

export function canRetaliate(n: Actor, threat: Actor, now: number) {
  if (threat.kind !== 'player' || (n.retaliationUntil ?? 0) <= now || n.memory?.threatId !== threat.id) return false;
  const brave = (n.persona?.courage ?? 0) > 0.78 && (n.persona?.loyalty ?? 0) > 0.65;
  return n.profession === 'Warden' || n.profession === 'Scout' || n.profession === 'Smith'
    || n.profession === 'Woodcutter' || n.profession === 'Mason' || (n.profession === 'Keeper' && brave);
}

/** A profession's brain owns the choice; shared combat code only executes authorized actions. */
export function roleResponse(w: SandboxWorld, n: Actor, threat: Actor, directlyAttacked = false): Goal {
  const authorized = threat.kind === 'player' ? directlyAttacked && canRetaliate(n, threat, w.elapsed) : directlyAttacked;
  return brainFor(n)?.onThreat(w, n, threat, authorized)
    ?? { kind: 'shelter', targetId: threat.id, point: n.home, score: 2.6, until: w.elapsed + 10 };
}

export function foePatrolPoint(foe: Actor, camp: Point, now: number): Point {
  const profile = FOE_BEHAVIORS[foe.foeKind ?? 'slime'];
  const id = Number(foe.id.replace(/\D/g, '')) || 1;
  const angle = id * 2.399 + now * (profile.duty === 'ambush' ? 0.022 : 0.012);
  return { x: camp.x + Math.cos(angle) * profile.patrolRadius, z: camp.z + Math.sin(angle) * profile.patrolRadius };
}