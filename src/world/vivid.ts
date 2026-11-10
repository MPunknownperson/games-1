// VIVID AI — personality, attributes, skills and utility-driven decision making.
// Every villager is generated with a temperament, a routine and a set of hidden capabilities, then
// left to weigh its own needs against the world each time it decides what to do next.
import type { Actor, Point, SandboxWorld } from './simulation';
import { activePackage } from './packages';
import { sameSpace } from './cells';
import { roleResponse } from './roles';

export interface Persona {
  courage: number;   // stands ground, helps in a fight, investigates
  honesty: number;   // resists theft and lockpicking
  greed: number;     // values coin and food, haggles, hoards
  kindness: number;  // helps, heals, shares, forgives
  temper: number;    // patience; low temper means curt and easily offended
  sociable: number;  // seeks company
  ambition: number;  // works longer, builds, strives
  curiosity: number; // follows unusual sounds, places and rumors
  patience: number;  // tolerates delay and keeps at a difficult task
  loyalty: number;   // protects the village and people they trust
}
export interface Attrs { might: number; agility: number; will: number }
export interface Desires { responsibility: number; aggression: number; confidence: number }
export type SkillKind = 'blade' | 'guard' | 'stealth' | 'lockpick' | 'speech' | 'magic';
export type Skills = Record<SkillKind, number>;
export type SpellId = 'mending' | 'bolt';
export interface Routine { wake: number; workStart: number; workEnd: number; bedtime: number; haunt: Point }

export type GoalKind =
  | 'sleep' | 'eatHome' | 'eatFood' | 'buyFood' | 'steal' | 'scavenge' | 'sit' | 'chat' | 'work' | 'stroll'
  | 'heal' | 'fight' | 'castBolt' | 'flee' | 'investigate' | 'idle' | 'tavern' | 'earnFood' | 'confront'
  | 'warn' | 'shelter' | 'hide' | 'holdGround';
export interface Goal { kind: GoalKind; targetId?: string; point?: Point; until: number; score?: number }

export const SPELLS: Record<SpellId, { name: string; cost: number; power: number; range: number }> = {
  mending: { name: 'Mending', cost: 30, power: 38, range: 8 },
  bolt: { name: 'Spark bolt', cost: 20, power: 26, range: 15 },
};
export const SKILL_NAMES: Record<SkillKind, string> = {
  blade: 'Blade', guard: 'Guard', stealth: 'Stealth', lockpick: 'Lockpicking', speech: 'Speech', magic: 'Magic',
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const angleDelta = (from: number, to: number) => {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};
const trait = (value: number | undefined, fallback = 0.5) => Number.isFinite(value) ? clamp01(value!) : fallback;

/** Shared sight model for witnesses, guards and foes. Sneak skill and darkness shrink detection range. */
export function canSee(observer: Actor, target: Point, range: number, hour: number, stealth = 0, sneaking = false): boolean {
  const dx = target.x - observer.x, dz = target.z - observer.z;
  const d = Math.hypot(dx, dz);
  const dark = hour >= 21 || hour < 5.5;
  const concealment = 1 - trait(stealth / 100) * 0.38;
  const posture = sneaking ? 0.62 : 1;
  const light = dark ? 0.82 : 1;
  const reach = range * concealment * posture * light;
  if (d > reach) return false;
  if (d < (sneaking ? 2 : 4)) return true;
  return Math.abs(angleDelta(observer.facing, Math.atan2(dx, dz))) < 1.9;
}

export function makePersona(rng: () => number, profession: string): Persona {
  const p: Persona = {
    courage: rng(), honesty: rng(), greed: rng(), kindness: rng(), temper: rng(), sociable: rng(), ambition: rng(),
    curiosity: rng(), patience: rng(), loyalty: rng(),
  };
  if (profession === 'Warden') { p.courage = clamp01(p.courage + 0.35); p.honesty = clamp01(p.honesty + 0.3); p.loyalty = clamp01(p.loyalty + 0.35); }
  if (profession === 'Merchant') { p.greed = clamp01(p.greed + 0.35); p.sociable = clamp01(p.sociable + 0.2); }
  if (profession === 'Keeper') { p.kindness = clamp01(p.kindness + 0.25); p.ambition = clamp01(p.ambition + 0.2); p.loyalty = clamp01(p.loyalty + 0.3); }
  if (profession === 'Herbalist') { p.kindness = clamp01(p.kindness + 0.3); }
  if (profession === 'Forager') { p.honesty = clamp01(p.honesty - 0.35); p.courage = clamp01(p.courage - 0.1); p.curiosity = clamp01(p.curiosity + 0.3); }
  if (profession === 'Scout') { p.courage = clamp01(p.courage + 0.2); p.curiosity = clamp01(p.curiosity + 0.35); }
  if (profession === 'Baker') { p.kindness = clamp01(p.kindness + 0.2); p.sociable = clamp01(p.sociable + 0.15); }
  if (profession === 'Apprentice') { p.curiosity = clamp01(p.curiosity + 0.35); }
  return p;
}

export function makeAttrs(rng: () => number, profession: string): Attrs {
  const a: Attrs = { might: 3 + Math.floor(rng() * 6), agility: 3 + Math.floor(rng() * 6), will: 3 + Math.floor(rng() * 6) };
  if (profession === 'Mason' || profession === 'Smith' || profession === 'Woodcutter') a.might += 2;
  if (profession === 'Scout' || profession === 'Forager') a.agility += 2;
  if (profession === 'Keeper' || profession === 'Apprentice' || profession === 'Herbalist') a.will += 2;
  return a;
}

/** Hidden drives behind a person's visible temperament. Wealth lives in the shared crown purse. */
export function makeDesires(rng: () => number, profession: string, persona?: Persona): Desires {
  const d: Desires = {
    responsibility: clamp01(0.18 + rng() * 0.78),
    aggression: clamp01(0.08 + rng() * 0.84),
    confidence: clamp01(0.12 + rng() * 0.8),
  };
  d.responsibility = clamp01(d.responsibility * 0.78 + trait(persona?.honesty) * 0.22);
  d.aggression = clamp01(d.aggression * 0.7 + trait(persona?.courage) * 0.3);
  d.confidence = clamp01(d.confidence * 0.72 + trait(persona?.courage) * 0.18 + trait(persona?.sociable) * 0.1);
  if (profession === 'Warden') d.responsibility = clamp01(d.responsibility + 0.22);
  if (profession === 'Keeper') d.responsibility = clamp01(d.responsibility + 0.14);
  if (profession === 'Forager') d.responsibility = clamp01(d.responsibility - 0.18);
  if (profession === 'Smith') d.aggression = clamp01(d.aggression + 0.12);
  if (profession === 'Apprentice') d.confidence = clamp01(d.confidence + 0.12);
  return d;
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
  if (trait(p.curiosity) > 0.78) bits.push('follows every rumor');
  if (trait(p.patience) < 0.22) bits.push('restless');
  if (trait(p.loyalty) > 0.82) bits.push('steadfast');
  if (!bits.length) bits.push('hard to read');
  return bits.slice(0, 2).join(', ');
}

// ------------------------------------------------------------------ world queries used by goals
export function freeSeat(w: SandboxWorld, n: Actor): Actor | undefined {
  let best: Actor | undefined, bd = Infinity;
  for (const a of w.actors) {
    if (a.kind !== 'item' || a.itemType !== 'stool' || !a.alive || !sameSpace(a, n) || a.carriedBy || a.seatTakenBy) continue;
    const claimed = w.actors.some((other) => other !== n && other.alive && other.utility?.kind === 'sit'
      && other.utility.targetId === a.id && other.utility.until > w.elapsed);
    if (claimed) continue;
    const d = dist(a, n.social ?? n);
    if (d < bd) { bd = d; best = a; }
  }
  return bd < 42 ? best : undefined;
}

export function stealTarget(w: SandboxWorld, n: Actor): Actor | undefined {
  let best: Actor | undefined, bd = Infinity;
  for (const a of w.actors) {
    if (a.kind !== 'item' || !a.alive || !sameSpace(a, n) || a.carriedBy) continue;
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
    if (a.kind !== 'item' || !a.alive || !sameSpace(a, n) || a.carriedBy || a.owner || a.sleeping === false) continue;
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
    if (!a.alive || !sameSpace(a, n) || a.hp <= 0 || (a.kind !== 'villager' && a.kind !== 'player')) continue;
    if (n.memory?.threatId === a.id && n.memory.alarmUntil > w.elapsed) continue;
    if (dist(a, n) > 18) continue;
    const frac = a.hp / a.maxHp;
    if (frac < worst) { worst = frac; best = a; }
  }
  return best;
}

export function nearestFoe(w: SandboxWorld, n: Actor, range: number): Actor | undefined {
  let best: Actor | undefined, bd = range;
  for (const a of w.actors) {
    if (a.kind !== 'foe' || !a.alive || !sameSpace(a, n)) continue;
    const d = dist(a, n);
    if (d < bd && (d < 4 || canSee(n, a, range, w.hour(), a.skills?.stealth ?? 0, !!a.sneaking))) { bd = d; best = a; }
  }
  return best;
}

/** The heart of Vivid AI: score every desire against the moment and pick the strongest. */
export function chooseGoal(w: SandboxWorld, n: Actor): Goal {
  const per = n.persona!, needs = n.needs!, routine = n.routine!;
  const courage = trait(per.courage), honesty = trait(per.honesty), greed = trait(per.greed);
  const kindness = trait(per.kindness), sociable = trait(per.sociable), ambition = trait(per.ambition);
  const curiosity = trait(per.curiosity), patience = trait(per.patience), loyalty = trait(per.loyalty);
  const responsibility = trait(n.desires?.responsibility, honesty) * 0.68 + honesty * 0.32;
  const aggression = trait(n.desires?.aggression, courage * 0.65);
  const confidence = trait(n.desires?.confidence, courage * 0.6);
  const h = w.hour();
  const now = w.elapsed;
  const night = h >= routine.bedtime || h < routine.wake;
  const pkg = activePackage(n.packages, h);
  n.activePackage = pkg?.id;
  const hasTavern = w.actors.some((a) => a.kind === 'tavern' && a.alive);
  let best: Goal | undefined, bestScore = -Infinity;
  const push = (kind: Goal['kind'], score: number, extra: Partial<Goal> = {}, span = 20) => {
    if (score > 0.02 && score > bestScore) { best = { kind, until: now + span, score, ...extra }; bestScore = score; }
  };

  // Immediate danger and support can interrupt routine needs.
  const foe = nearestFoe(w, n, 16);
  if (foe && n.hp > 0) {
    const response = roleResponse(w, n, foe);
    push(response.kind, response.score ?? 2, { targetId: response.targetId, point: response.point }, response.until - now);
  }
  if ((n.spells ?? []).includes('mending') && (n.focus ?? 0) >= SPELLS.mending.cost) {
    const patient = hurtAlly(w, n);
    if (patient) {
      const urgency = 1 - patient.hp / Math.max(1, patient.maxHp);
      push('heal', 0.68 + kindness * 0.52 + loyalty * 0.15 + urgency * 0.25, { targetId: patient.id }, 8);
    }
  }

  // A routine is a preference, not a script; urgent needs and danger can outrank it.
  const packageSleep = pkg?.kind === 'home' ? pkg.priority * 1.15 : 0;
  push('sleep', (needs.energy < 0.42 ? (0.42 - needs.energy) * 2.8 : 0) + (night ? 0.9 : 0) + packageSleep, {}, 45);
  const nightCalm = night ? 0.3 : 1;
  const noFood = !w.firstFood(n) && (n.homeFood ?? 0) <= 0;
  const hungryWithoutMoney = needs.hunger > 0.38 && noFood && (n.crowns ?? 0) < 5;
  if (needs.hunger > 0.38) {
    const hunger = needs.hunger * (0.78 + greed * 0.22);
    if (w.firstFood(n)) push('eatFood', hunger + 0.08, {}, 25);
    if ((n.homeFood ?? 0) > 0) push('eatHome', hunger * 0.97, {}, 25);
    if ((n.crowns ?? 0) >= 5) push('buyFood', hunger * 0.86, {}, 40);
    if (hasTavern && ((n.crowns ?? 0) >= 4 || (noFood && responsibility >= 0.45))) {
      push('tavern', hunger * 0.82 + (pkg?.kind === 'meal' ? pkg.priority * 0.55 : 0), {}, 35);
    }
    if (honesty < 0.58 || responsibility < 0.5) {
      const target = stealTarget(w, n);
      if (target) {
        const watched = w.actors.some((o) => o !== n && o.alive && sameSpace(o, n) && (o.kind === 'villager' || o.kind === 'player')
          && !(o.kind === 'villager' && o.activity === 'Sleeping')
          && canSee(o, target, 12, h, n.skills?.stealth ?? 0, true));
        const stealth = clamp01((n.skills?.stealth ?? 0) / 100);
        const risk = watched ? 0.16 * (1 - stealth) : 0;
        const desperation = 1.25 - responsibility * 0.55 + aggression * 0.18;
        push('steal', hunger * (0.82 + greed * 0.25) * desperation - risk, { targetId: target.id }, 50);
      }
    }
  }
  // A responsible person without coin tries to earn the meal. A cautious one simply endures.
  if (hungryWithoutMoney && responsibility >= 0.45 && n.work && !night) {
    push('earnFood', 0.38 + responsibility * 0.5 + confidence * 0.12 + patience * 0.08, {}, 35);
  }
  if (pkg?.kind === 'meal' && hasTavern && !night && !hungryWithoutMoney) {
    push('tavern', 0.48 + pkg.priority * 0.72 + needs.social * 0.08, {}, 35);
  }
  // Loose goods are an opportunity; a hungry person or a curious scavenger notices sooner.
  const loose = scavengeTarget(w, n);
  if (loose) push('scavenge', 0.12 + greed * 0.3 + needs.hunger * 0.3 + curiosity * 0.08, { targetId: loose.id }, 15);

  // Rest and company respond to both need pressure and individual temperament.
  const seat = freeSeat(w, n);
  const restDrive = needs.energy < 0.7 ? (0.7 - needs.energy) * 0.55 + 0.12 : 0;
  if (seat) push('sit', (restDrive + needs.fun * 0.18) * (night ? 0.6 : 1), { targetId: seat.id }, 30);
  const rumorPull = Math.min(0.22, (n.memory?.rumors.length ?? 0) * curiosity * 0.025);
  push('chat', (needs.social * (0.3 + sociable * 0.7) + rumorPull) * nightCalm, {}, 25);
  push('stroll', needs.fun * (0.25 + (1 - ambition) * 0.2 + curiosity * 0.15) * nightCalm, { point: routine.haunt }, 30);

  const working = h >= routine.workStart && h < routine.workEnd;
  const packageWork = pkg?.kind === 'work' || pkg?.kind === 'patrol' ? pkg.priority * 0.32 : 0;
  if (working && !night) push('work', 0.42 + ambition * 0.28 + patience * 0.12 + packageWork, {}, 25);
  else if (h >= routine.wake && !night) push('stroll', 0.08 + curiosity * 0.04, { point: routine.haunt }, 25);

  if (pkg?.kind === 'social' && !night) {
    push('chat', 0.1 + pkg.priority * 0.14 + sociable * 0.16, {}, 25);
    if (seat) push('sit', 0.04 + pkg.priority * 0.06, { targetId: seat.id }, 30);
  }

  push('idle', 0.05, {}, 12);
  return best!;
}
