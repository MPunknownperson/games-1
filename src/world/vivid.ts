// VIVID AI — personality, attributes, skills and utility-driven decision making.
// Every villager is generated with a temperament, a routine and a set of hidden capabilities, then
// left to weigh its own needs against the world each time it decides what to do next.
import type { Actor, Point, SandboxWorld } from './simulation';

export interface Persona {
  courage: number;   // stands ground, helps in a fight, investigates
  honesty: number;   // resists theft and lockpicking
  greed: number;     // values coin and food, haggles, hoards
  kindness: number;  // helps, heals, shares, forgives
  temper: number;    // patience; low temper means curt and easily offended
  sociable: number;  // seeks company
  ambition: number;  // works longer, builds, strives
}
export interface Attrs { might: number; agility: number; will: number }
export type SkillKind = 'blade' | 'guard' | 'stealth' | 'lockpick' | 'speech' | 'magic';
export type Skills = Record<SkillKind, number>;
export type SpellId = 'mending' | 'bolt';
export interface Routine { wake: number; workStart: number; workEnd: number; bedtime: number; haunt: Point }

export type GoalKind =
  | 'sleep' | 'eatHome' | 'eatFood' | 'buyFood' | 'steal' | 'scavenge' | 'sit' | 'chat' | 'work' | 'stroll'
  | 'heal' | 'fight' | 'flee' | 'investigate' | 'idle';
export interface Goal { kind: GoalKind; targetId?: string; point?: Point; until: number }

export const SPELLS: Record<SpellId, { name: string; cost: number; power: number; range: number }> = {
  mending: { name: 'Mending', cost: 30, power: 38, range: 8 },
  bolt: { name: 'Spark bolt', cost: 20, power: 26, range: 15 },
};
export const SKILL_NAMES: Record<SkillKind, string> = {
  blade: 'Blade', guard: 'Guard', stealth: 'Stealth', lockpick: 'Lockpicking', speech: 'Speech', magic: 'Magic',
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);

export function makePersona(rng: () => number, profession: string): Persona {
  const p: Persona = {
    courage: rng(), honesty: rng(), greed: rng(), kindness: rng(), temper: rng(), sociable: rng(), ambition: rng(),
  };
  if (profession === 'Warden') { p.courage = clamp01(p.courage + 0.35); p.honesty = clamp01(p.honesty + 0.3); }
  if (profession === 'Merchant') { p.greed = clamp01(p.greed + 0.35); p.sociable = clamp01(p.sociable + 0.2); }
  if (profession === 'Keeper') { p.kindness = clamp01(p.kindness + 0.25); p.ambition = clamp01(p.ambition + 0.2); }
  if (profession === 'Herbalist') { p.kindness = clamp01(p.kindness + 0.3); }
  if (profession === 'Forager') { p.honesty = clamp01(p.honesty - 0.35); p.courage = clamp01(p.courage - 0.1); }
  if (profession === 'Scout') { p.courage = clamp01(p.courage + 0.2); }
  if (profession === 'Baker') { p.kindness = clamp01(p.kindness + 0.2); p.sociable = clamp01(p.sociable + 0.15); }
  return p;
}

export function makeAttrs(rng: () => number, profession: string): Attrs {
  const a: Attrs = { might: 3 + Math.floor(rng() * 6), agility: 3 + Math.floor(rng() * 6), will: 3 + Math.floor(rng() * 6) };
  if (profession === 'Mason' || profession === 'Smith' || profession === 'Woodcutter') a.might += 2;
  if (profession === 'Scout' || profession === 'Forager') a.agility += 2;
  if (profession === 'Keeper' || profession === 'Apprentice' || profession === 'Herbalist') a.will += 2;
  return a;
}

export function makeSkills(rng: () => number, profession: string): Skills {
  const s: Skills = { blade: 2 + rng() * 10, guard: 2 + rng() * 10, stealth: 2 + rng() * 12, lockpick: rng() * 8, speech: 5 + rng() * 20, magic: 0 };
  if (profession === 'Warden') { s.blade = 35 + rng() * 25; s.guard = 30 + rng() * 20; }
  if (profession === 'Smith') { s.blade = 22 + rng() * 15; }
  if (profession === 'Scout') { s.blade = 25 + rng() * 20; s.stealth = 30 + rng() * 20; }
  if (profession === 'Forager') { s.stealth = 35 + rng() * 25; s.lockpick = 28 + rng() * 25; }
  if (profession === 'Merchant') { s.speech = 45 + rng() * 30; s.lockpick = 10 + rng() * 15; }
  if (profession === 'Mason') { s.guard = 20 + rng() * 15; }
  if (profession === 'Apprentice') { s.magic = 35 + rng() * 25; }
  if (profession === 'Herbalist') { s.magic = 22 + rng() * 18; }
  if (profession === 'Keeper') { s.magic = 18 + rng() * 15; s.speech = 35 + rng() * 20; }
  return s;
}

export function makeRoutine(rng: () => number, profession: string, home: Point, social: Point): Routine {
  const early = profession === 'Baker' || profession === 'Woodcutter' ? -1.2 : profession === 'Merchant' ? 0.4 : 0;
  const wake = 5.6 + rng() * 1.2 + early;
  const workStart = wake + 0.6 + rng() * 0.8;
  const workEnd = Math.min(19.5, workStart + 8.5 + rng() * 1.6);
  const bedtime = Math.max(workEnd + 1.5, 20.8 + rng() * 1.6 + early * 0.4);
  const haunts: Point[] = [social, { x: 6, z: 0 }, { x: -3, z: -4 }, { x: 24, z: -19 }, { x: home.x + 2, z: home.z + 2 }];
  return { wake, workStart, workEnd, bedtime, haunt: haunts[Math.floor(rng() * haunts.length)] };
}

/** A one-line impression of a person, for examining them. Only hints — the numbers stay hidden. */
export function impression(n: Actor): string {
  const p = n.persona;
  if (!p) return '';
  const bits: string[] = [];
  if (p.courage > 0.72) bits.push('steady-eyed');
  else if (p.courage < 0.3) bits.push('nervous');
  if (p.honesty < 0.32) bits.push('shifty');
  if (p.kindness > 0.72) bits.push('warm');
  if (p.temper < 0.3) bits.push('short-tempered');
  if (p.greed > 0.75) bits.push('counts coins twice');
  if (p.sociable > 0.75) bits.push('loves an audience');
  if (p.ambition > 0.75) bits.push('always busy');
  if (!bits.length) bits.push('hard to read');
  return bits.slice(0, 2).join(', ');
}

// ------------------------------------------------------------------ world queries used by goals
export function freeSeat(w: SandboxWorld, n: Actor): Actor | undefined {
  let best: Actor | undefined, bd = Infinity;
  for (const a of w.actors) {
    if (a.kind !== 'item' || a.itemType !== 'stool' || !a.alive || a.carriedBy || a.seatTakenBy) continue;
    const d = dist(a, n.social ?? n);
    if (d < bd) { bd = d; best = a; }
  }
  return bd < 42 ? best : undefined;
}

export function stealTarget(w: SandboxWorld, n: Actor): Actor | undefined {
  let best: Actor | undefined, bd = Infinity;
  for (const a of w.actors) {
    if (a.kind !== 'item' || !a.alive || a.carriedBy) continue;
    const food = a.itemType === 'bread' || a.itemType === 'apple' || a.itemType === 'cheese';
    const box = a.itemType === 'strongbox' && !!a.locked && w.hour() > 20;
    if ((!food || !a.owner) && !box) continue;
    if (box && (n.skills?.lockpick ?? 0) < 25) continue;
    const d = dist(a, n);
    if (d < bd) { bd = d; best = a; }
  }
  return best;
}

/** Something lying about that nobody owns, worth bending down for. */
export function scavengeTarget(w: SandboxWorld, n: Actor): Actor | undefined {
  let best: Actor | undefined, bd = 9;
  for (const a of w.actors) {
    if (a.kind !== 'item' || !a.alive || a.carriedBy || a.owner || a.sleeping === false) continue;
    const food = a.itemType === 'bread' || a.itemType === 'apple' || a.itemType === 'cheese' || a.itemType === 'herb';
    if (!food && a.itemType !== 'pouch') continue;
    const d = dist(a, n);
    if (d < bd) { bd = d; best = a; }
  }
  return best;
}

export function hurtAlly(w: SandboxWorld, n: Actor): Actor | undefined {
  let best: Actor | undefined, worst = 0.78;
  for (const a of w.actors) {
    if (!a.alive || a.hp <= 0 || (a.kind !== 'villager' && a.kind !== 'player')) continue;
    if (dist(a, n) > 18) continue;
    const frac = a.hp / a.maxHp;
    if (frac < worst) { worst = frac; best = a; }
  }
  return best;
}

export function nearestFoe(w: SandboxWorld, n: Actor, range: number): Actor | undefined {
  let best: Actor | undefined, bd = range;
  for (const a of w.actors) {
    if (a.kind !== 'foe' || !a.alive) continue;
    const d = dist(a, n);
    if (d < bd) { bd = d; best = a; }
  }
  return best;
}

/** The heart of Vivid AI: score every desire against the moment and pick the strongest. */
export function chooseGoal(w: SandboxWorld, n: Actor): Goal {
  const per = n.persona!, needs = n.needs!, routine = n.routine!;
  const h = w.hour();
  const now = w.elapsed;
  const night = h >= routine.bedtime || h < routine.wake;
  const options: { goal: Goal; score: number }[] = [];
  const push = (kind: Goal['kind'], score: number, extra: Partial<Goal> = {}, span = 20) => {
    if (score > 0.02) options.push({ goal: { kind, until: now + span, ...extra }, score });
  };

  // Survival and conscience come before everything else.
  const foe = nearestFoe(w, n, 12);
  if (foe && n.hp > 0) {
    if (n.hp < n.maxHp * 0.35 || per.courage < 0.35) push('flee', 1.6, { targetId: foe.id }, 5);
    else if (per.courage > 0.5) push('fight', 0.55 + per.courage * 0.6, { targetId: foe.id }, 8);
  }
  if ((n.spells ?? []).includes('mending') && (n.focus ?? 0) >= SPELLS.mending.cost) {
    const patient = hurtAlly(w, n);
    if (patient) push('heal', 0.9 + per.kindness * 0.5, { targetId: patient.id }, 8);
  }

  // Body. After bedtime the pull of home outweighs company and curiosity.
  push('sleep', (needs.energy < 0.42 ? (0.42 - needs.energy) * 2.8 : 0) + (night ? 0.9 : 0), {}, 45);
  const nightCalm = night ? 0.3 : 1;
  if (needs.hunger > 0.38) {
    // Every way of getting fed competes: what you carry, what's at home, what you can
    // afford, and — for some temperaments — what you can take.
    const hunger = needs.hunger * (0.75 + per.greed * 0.35);
    if (w.firstFood(n)) push('eatFood', hunger, {}, 25);
    if ((n.homeFood ?? 0) > 0) push('eatHome', hunger * 0.97, {}, 25);
    if ((n.crowns ?? 0) >= 5) push('buyFood', hunger * 0.94, {}, 40);
    if (per.honesty < 0.52) {
      const target = stealTarget(w, n);
      if (target) push('steal', hunger * (1.25 - per.honesty), { targetId: target.id }, 50);
    }
    if (!w.firstFood(n) && (n.homeFood ?? 0) === 0 && (n.crowns ?? 0) < 5 && per.honesty >= 0.52) push('eatHome', hunger * 0.55, {}, 25);
  }
  // Opportunity: the greedy and the hungry pick up what others drop.
  const loose = scavengeTarget(w, n);
  if (loose) push('scavenge', 0.12 + per.greed * 0.35 + needs.hunger * 0.3, { targetId: loose.id }, 15);

  // Rest and company: a seat if one is free, conversation if not.
  const seat = freeSeat(w, n);
  push('sit', ((needs.energy < 0.7 ? (0.7 - needs.energy) * 0.55 : 0) + needs.fun * 0.18) * (night ? 0.6 : 1), seat ? { targetId: seat.id } : {}, 30);
  push('chat', needs.social * (0.35 + per.sociable * 0.75) * nightCalm, {}, 25);
  push('stroll', needs.fun * (0.3 + (1 - per.ambition) * 0.25) * nightCalm, { point: routine.haunt }, 30);

  // Duty.
  const working = h >= routine.workStart && h < routine.workEnd;
  if (working && !night) push('work', 0.5 + per.ambition * 0.3, {}, 25);
  else if (h >= routine.wake && !night) push('stroll', 0.16, { point: routine.haunt }, 25);

  push('idle', 0.05, {}, 12);
  options.sort((a, b) => b.score - a.score);
  return options[0].goal;
}
