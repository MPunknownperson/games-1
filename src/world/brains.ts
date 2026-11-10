import type { Actor, Point, SandboxWorld } from './simulation';
import type { Goal, GoalKind } from './vivid';
import { sameSpace } from './cells';

export interface ProfessionBrain {
  onThreat: (world: SandboxWorld, npc: Actor, threat: Actor, attacked: boolean) => Goal;
  onRoutine: (world: SandboxWorld, npc: Actor) => Goal | undefined;
  onWork: (world: SandboxWorld, npc: Actor) => void;
  workInterval: number;
  attack?: { speed: number; reach: number; windup: number; cooldown: number; damage: number };
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const goal = (w: SandboxWorld, kind: GoalKind, targetId?: string, point?: Point, score = 2.35, span = 8): Goal =>
  ({ kind, targetId, point, score, until: w.elapsed + span });
const warn = (w: SandboxWorld, n: Actor, threat: Actor) => {
  const warden = w.actors.find((a) => a.kind === 'villager' && a.profession === 'Warden' && a.alive
    && sameSpace(a, n) && dist(a, n) < 22);
  return goal(w, 'warn', threat.id, warden ?? n.social ?? n.home, 2.55, 10);
};
const shelter = (w: SandboxWorld, n: Actor, threat: Actor) => goal(w, 'shelter', threat.id, n.home, 2.65, 11);
const hide = (w: SandboxWorld, n: Actor, threat: Actor) => goal(w, 'hide', threat.id, n.home, 2.7, 9);
const onDuty = (w: SandboxWorld, n: Actor) => !!n.routine && w.hour() >= n.routine.workStart && w.hour() < n.routine.workEnd;
const work = (w: SandboxWorld, score: number) => goal(w, 'work', undefined, undefined, score, 26);
const nearbyPatient = (w: SandboxWorld, n: Actor) => w.actors.find((a) => a.alive && a !== n && sameSpace(a, n)
  && (a.kind === 'villager' || a.kind === 'player') && a.hp < a.maxHp * 0.78 && dist(a, n) < 12);

const keeper: ProfessionBrain = {
  workInterval: 12,
  attack: { speed: 2.5, reach: 0, windup: 0.62, cooldown: 1.75, damage: 0.8 },
  onThreat: (w, n, threat, attacked) => threat.kind === 'player'
    ? attacked && n.hp > n.maxHp * 0.38 ? goal(w, 'fight', threat.id, undefined, 2.85) : warn(w, n, threat)
    : dist(threat, w.citadel) < 16 && n.spells?.includes('bolt') && (n.focus ?? 0) >= 20
      ? goal(w, 'castBolt', threat.id, undefined, 2.7) : goal(w, 'holdGround', threat.id, w.citadel, 2.5),
  onRoutine: (w, n) => onDuty(w, n) && w.citadel.hp < w.citadel.maxHp ? work(w, 0.94) : undefined,
  onWork: (w, n) => {
    if (w.citadel.hp < w.citadel.maxHp && w.stock.essence > 0) {
      w.stock.essence--; w.citadel.hp = Math.min(w.citadel.maxHp, w.citadel.hp + 12);
    } else w.trainSkill(n, 'magic', 0.4);
  },
};
const merchant: ProfessionBrain = {
  workInterval: 23,
  onThreat: (w, n, threat) => threat.kind === 'player' || dist(n, threat) < 8 ? warn(w, n, threat) : shelter(w, n, threat),
  onRoutine: (w, n) => onDuty(w, n) && w.actors.filter((a) => a.kind === 'item' && a.owner === n.name && a.alive).length < 6
    ? work(w, 0.86) : undefined,
  onWork: (w, n) => {
    const stall = w.actors.find((a) => a.kind === 'stall' && a.alive);
    const goods = w.actors.filter((a) => a.kind === 'item' && a.owner === n.name && a.alive).length;
    if (stall && goods < 6 && (n.homeFood ?? 0) > 0) {
      n.homeFood!--;
      w.spawnItem('apple', stall.x + (w.random() - 0.5) * 0.6, stall.z, stall.surface ?? 0.95, n.name);
    }
  },
};
const warden: ProfessionBrain = {
  workInterval: 18,
  attack: { speed: 4.2, reach: 0.35, windup: 0.32, cooldown: 1.15, damage: 1 },
  onThreat: (w, n, threat, attacked) => threat.kind === 'player' && !attacked
    ? warn(w, n, threat) : goal(w, 'fight', threat.id, undefined, 2.95),
  onRoutine: (w, n) => onDuty(w, n) && !!n.patrol ? work(w, 0.79) : undefined,
  onWork: (w, n) => w.trainSkill(n, 'guard', 0.3),
};
const mason: ProfessionBrain = {
  workInterval: 18,
  attack: { speed: 2.8, reach: 0.15, windup: 0.58, cooldown: 1.65, damage: 0.98 },
  onThreat: (w, n, threat, attacked) => threat.kind === 'player'
    ? attacked ? goal(w, 'fight', threat.id, undefined, 2.8) : warn(w, n, threat)
    : goal(w, 'holdGround', threat.id, n.work ?? w.citadel, 2.6),
  onRoutine: (w, n) => onDuty(w, n) && (w.citadel.stockStone ?? 0) < 18 ? work(w, 0.84) : undefined,
  onWork: (w) => { w.citadel.stockStone = Math.min(60, (w.citadel.stockStone ?? 0) + 1); },
};
const woodcutter: ProfessionBrain = {
  workInterval: 23,
  attack: { speed: 3.1, reach: 0.22, windup: 0.68, cooldown: 1.8, damage: 1.12 },
  onThreat: (w, n, threat, attacked) => threat.kind === 'player'
    ? attacked ? goal(w, 'fight', threat.id, undefined, 2.8) : shelter(w, n, threat)
    : attacked || dist(n, threat) < 5 ? goal(w, 'fight', threat.id, undefined, 2.55) : warn(w, n, threat),
  onRoutine: (w, n) => onDuty(w, n) && (w.citadel.stockWood ?? 0) < 18 ? work(w, 0.82) : undefined,
  onWork: (w) => { w.citadel.stockWood = Math.min(60, (w.citadel.stockWood ?? 0) + 1); },
};
const herbalist: ProfessionBrain = {
  workInterval: 23,
  onThreat: (w, n, threat) => {
    const patient = nearbyPatient(w, n);
    return threat.kind === 'foe' && patient && (n.focus ?? 0) >= 30 && dist(n, threat) > 5
      ? goal(w, 'heal', patient.id, undefined, 2.75) : shelter(w, n, threat);
  },
  onRoutine: (w, n) => {
    const patient = nearbyPatient(w, n);
    if (patient && (n.focus ?? 0) >= 30) return goal(w, 'heal', patient.id, undefined, 1.45);
    return onDuty(w, n) ? work(w, 0.69) : undefined;
  },
  onWork: (w, n) => {
    if (w.actors.filter((a) => a.itemType === 'herb' && a.alive && dist(a, n.work!) < 5).length < 2)
      w.spawnItem('herb', n.work!.x + 1.1, n.work!.z + 0.4, 0, n.name);
  },
};
const farmer: ProfessionBrain = {
  workInterval: 23,
  onThreat: (w, n, threat) => shelter(w, n, threat),
  onRoutine: (w, n) => onDuty(w, n) && (n.homeFood ?? 0) < 5 ? work(w, 0.72) : undefined,
  onWork: (_w, n) => { n.homeFood = Math.min(6, (n.homeFood ?? 0) + 1); },
};
const forager: ProfessionBrain = {
  workInterval: 23,
  onThreat: (w, n, threat) => hide(w, n, threat),
  onRoutine: (w, n) => onDuty(w, n) && (n.homeFood ?? 0) < 3 ? work(w, 0.63) : undefined,
  onWork: (w, n) => {
    const herb = w.actors.find((a) => a.itemType === 'herb' && a.alive && !a.owner && dist(a, n.work!) < 6);
    if (herb) { w.give(n, 'herb'); w.removeActor(herb); }
  },
};
const apprentice: ProfessionBrain = {
  workInterval: 12,
  onThreat: (w, n, threat) => threat.kind === 'foe' && n.spells?.includes('bolt') && (n.focus ?? 0) >= 20 && dist(n, threat) > 4
    ? goal(w, 'castBolt', threat.id, undefined, 2.55) : shelter(w, n, threat),
  onRoutine: (w, n) => {
    const patient = nearbyPatient(w, n);
    if (patient && (n.focus ?? 0) >= 30) return goal(w, 'heal', patient.id, undefined, 1.1);
    return onDuty(w, n) ? work(w, 0.66) : undefined;
  },
  onWork: (w, n) => w.trainSkill(n, 'magic', 0.6),
};
const smith: ProfessionBrain = {
  workInterval: 18,
  attack: { speed: 2.9, reach: 0.12, windup: 0.72, cooldown: 1.95, damage: 1.28 },
  onThreat: (w, n, threat, attacked) => threat.kind === 'player'
    ? attacked ? goal(w, 'fight', threat.id, undefined, 2.85) : warn(w, n, threat)
    : dist(n, threat) < 10 ? goal(w, 'fight', threat.id, undefined, 2.65)
      : goal(w, 'holdGround', threat.id, n.work, 2.35),
  onRoutine: (w, n) => onDuty(w, n) && (w.citadel.stockStone ?? 0) > 0 ? work(w, 0.8) : undefined,
  onWork: (w, n) => {
    if ((w.citadel.stockStone ?? 0) < 1) return;
    w.citadel.stockStone!--;
    const guard = w.actors.find((a) => a.kind === 'villager' && a.profession === 'Warden' && a.alive && dist(a, n) < 40);
    if (guard) w.trainSkill(guard, 'blade', 1.2);
  },
};
const gardener: ProfessionBrain = {
  workInterval: 23,
  onThreat: (w, n, threat) => shelter(w, n, threat),
  onRoutine: (w, n) => onDuty(w, n) && w.actors.filter((a) => a.itemType === 'herb' && a.alive && dist(a, n.work!) < 5).length < 2
    ? work(w, 0.7) : undefined,
  onWork: (w, n) => {
    if (w.actors.filter((a) => a.itemType === 'herb' && a.alive && dist(a, n.work!) < 5).length < 2)
      w.spawnItem('herb', n.work!.x + 1.1, n.work!.z + 0.4);
  },
};
const baker: ProfessionBrain = {
  workInterval: 23,
  onThreat: (w, n, threat) => warn(w, n, threat),
  onRoutine: (w, n) => onDuty(w, n) && w.actors.filter((a) => a.itemType === 'bread' && a.owner === n.name && a.alive).length < 4
    ? work(w, 0.86) : undefined,
  onWork: (w, n) => {
    const loaves = w.actors.filter((a) => a.itemType === 'bread' && a.owner === n.name && a.alive).length;
    if (loaves < 4 && (n.homeFood ?? 0) > 0) {
      n.homeFood!--;
      w.spawnItem('bread', n.work!.x + 1.3, n.work!.z, 0.9, n.name);
    }
  },
};
const scout: ProfessionBrain = {
  workInterval: 18,
  attack: { speed: 4.5, reach: 0.1, windup: 0.36, cooldown: 1.08, damage: 0.86 },
  onThreat: (w, n, threat, attacked) => threat.kind === 'player'
    ? attacked && n.hp > n.maxHp * 0.4 ? goal(w, 'fight', threat.id, undefined, 2.8) : hide(w, n, threat)
    : n.hp > n.maxHp * 0.36 ? goal(w, 'fight', threat.id, undefined, 2.65, 6) : hide(w, n, threat),
  onRoutine: (w, n) => onDuty(w, n) ? work(w, 0.78) : undefined,
  onWork: (w, n) => {
    if (dist(n, w.camp) < 25) w.addRumor(n, 'wild-activity');
  },
};

export const PROFESSION_BRAINS: Record<string, ProfessionBrain> = {
  Keeper: keeper, Merchant: merchant, Warden: warden, Mason: mason, Woodcutter: woodcutter,
  Herbalist: herbalist, Farmer: farmer, Forager: forager, Apprentice: apprentice, Smith: smith,
  Gardener: gardener, Baker: baker, Scout: scout,
};
export function brainFor(npc: Actor): ProfessionBrain | undefined { return PROFESSION_BRAINS[npc.profession ?? '']; }