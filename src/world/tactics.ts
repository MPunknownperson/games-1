import type { Actor, Faction, Point } from './simulation';

export type TacticalAction = 'advance' | 'flank' | 'withdraw' | 'support' | 'ranged' | 'hold';
export interface TacticalOrder {
  action: TacticalAction;
  targetId: string;
  allyId?: string;
  point?: Point;
  score: number;
  until: number;
}
export interface ThreatSignal {
  sourceId: string;
  targetId: string;
  faction: Faction;
  point: Point;
  until: number;
}
interface Situation {
  actor: Actor;
  target: Actor;
  allies: Actor[];
  wounded?: Actor;
  distance: number;
  health: number;
  courage: number;
}
interface Operator {
  action: TacticalAction;
  can: (s: Situation) => boolean;
  value: (s: Situation) => number;
  destination?: (s: Situation) => Point | undefined;
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const hasBolt = (a: Actor) => a.kind === 'foe' ? a.foeKind === 'wisp'
  : a.kind === 'villager' && (a.profession === 'Keeper' || a.profession === 'Apprentice') && !!a.spells?.includes('bolt');
const canHeal = (a: Actor) => a.kind === 'foe' ? a.foeKind === 'wisp'
  : a.kind === 'villager' && (a.profession === 'Keeper' || a.profession === 'Herbalist' || a.profession === 'Apprentice') && !!a.spells?.includes('mending');

// Each operator has a precondition and an expected benefit. A squad compares survival,
// support, positioning and pressure rather than marching directly at the target.
const OPERATORS: Operator[] = [
  {
    action: 'withdraw',
    can: (s) => s.health < 0.34 && s.courage < 0.82,
    value: (s) => 3 + (1 - s.health) * 0.8 + (s.allies.length === 0 ? 0.2 : 0),
    destination: (s) => ({ x: s.actor.x + (s.actor.x - s.target.x) * 2.5, z: s.actor.z + (s.actor.z - s.target.z) * 2.5 }),
  },
  {
    action: 'support',
    can: (s) => !!s.wounded && canHeal(s.actor) && (s.actor.focus ?? 0) >= 30,
    value: (s) => 2.35 + (1 - s.wounded!.hp / s.wounded!.maxHp),
    destination: (s) => s.wounded,
  },
  {
    action: 'hold',
    can: (s) => !!s.actor.guardPost && dist(s.target, s.actor.guardPost) > 22 && dist(s.actor, s.actor.guardPost) < 13,
    value: () => 2.1,
    destination: (s) => s.actor.guardPost,
  },
  {
    action: 'ranged',
    can: (s) => hasBolt(s.actor) && (s.actor.focus ?? 0) >= 20 && s.distance > 3,
    value: (s) => 1.75 + (s.actor.skills?.magic ?? 0) / 250,
  },
  {
    action: 'flank',
    can: (s) => ((s.actor.kind === 'foe' && s.actor.foeKind === 'stalker')
      || (s.actor.kind === 'villager' && (s.actor.profession === 'Warden' || s.actor.profession === 'Scout')))
      && s.allies.length >= 1 && s.distance > 2.5 && s.distance < 18
      && (s.target.kind === 'player' || s.target.kind === 'foe' || s.target.kind === 'villager'),
    value: (s) => 1.55 + Math.min(0.25, s.allies.length * 0.1),
    destination: (s) => {
      const dx = s.actor.x - s.target.x, dz = s.actor.z - s.target.z;
      const length = Math.hypot(dx, dz) || 1;
      const side = s.actor.id.charCodeAt(s.actor.id.length - 1) % 2 ? 1 : -1;
      return { x: s.target.x + dx / length * 2.3 - dz / length * side * 2.8,
        z: s.target.z + dz / length * 2.3 + dx / length * side * 2.8 };
    },
  },
  { action: 'advance', can: () => true, value: (s) => 1 + (s.actor.desires?.aggression ?? 0.4) * 0.25 },
];

export function planTactic(actor: Actor, target: Actor, allies: Actor[], wounded: Actor | undefined, now: number): TacticalOrder {
  if (actor.kind !== 'foe' && actor.kind !== 'villager') {
    return { action: 'hold', targetId: target.id, point: actor, score: 0, until: now + 1 };
  }
  const situation: Situation = {
    actor, target, allies, wounded, distance: dist(actor, target), health: actor.hp / Math.max(1, actor.maxHp),
    courage: actor.kind === 'foe' ? actor.foeKind === 'brute' || actor.foeKind === 'slime' ? 1 : 0.4 : actor.persona?.courage ?? 0.5,
  };
  let chosen = OPERATORS[OPERATORS.length - 1], score = -Infinity;
  for (const operator of OPERATORS) {
    if (!operator.can(situation)) continue;
    const value = operator.value(situation);
    if (value > score) { chosen = operator; score = value; }
  }
  return {
    action: chosen.action, targetId: target.id, allyId: chosen.action === 'support' ? wounded?.id : undefined,
    point: chosen.destination?.(situation), score,
    until: now + (chosen.action === 'flank' ? 1.4 : chosen.action === 'support' ? 0.8 : 0.95),
  };
}