// The authoritative, renderer-independent world. Every prop, person and loose object is an actor
// with a position and a body, and everything persists exactly where it was left.
import { repairWorld, verifyWorld, type VerificationIssue } from '../engine/verifier';
import { ITEMS, type ItemType } from './items';
import { QUESTS, barkFor, buildOptions, confrontOptions, greetingFor, type DynamicQuestData, type QuestDef, type StoryOption } from './story';
import { SPELLS, canSee, chooseGoal, makeAttrs, makeDesires, makePersona, makeRoutine, makeSkills, type Attrs, type Desires, type Goal, type Persona, type Routine, type SkillKind, type Skills, type SpellId, impression } from './vivid';
import { DUNGEON_SITES, RADIANT_SITES, WORLD_LOCATIONS } from './narrative';
import { matchLocationAliases, RADIANT_ITEMS, type LocationAlias, type SiteState } from './radiant';
import { activePackage, makePackages, type AiPackage } from './packages';
import { planTactic, type TacticalOrder, type ThreatSignal } from './tactics';
import { CellStream, EXTERIOR_SPACE, cellKey, interiorSpace, sameSpace, spaceOf, uGridsToLoad, uExteriorCellBuffer } from './cells';
import { applyChangeForms, baseIdFor, createChangeForms, referenceFor, type ChangeForm, type ObjectReference } from './content';
import { canRetaliate, foePatrolPoint, FOE_BEHAVIORS, PROFESSION_DUTIES, roleResponse } from './roles';
import { brainFor } from './brains';

export type Faction = 'citadel' | 'wild' | 'neutral';
export type ActorKind =
  | 'player' | 'villager' | 'foe' | 'tree' | 'ore' | 'item' | 'rune' | 'echo' | 'citadel' | 'house' | 'camp'
  | 'tower' | 'barricade' | 'well' | 'table' | 'stall' | 'pillar' | 'roof' | 'ruin' | 'post' | 'note' | 'bell' | 'dungeon' | 'tavern' | 'portal' | 'counter';
export type StructureKind = 'archer' | 'ward' | 'barricade' | 'outpost';
export type FoeKind = 'slime' | 'brute' | 'wisp' | 'stalker';
export type WeaponKind = 'fists' | 'club' | 'sword' | 'blade' | 'staff';
export const WEAPONS: Record<WeaponKind, { name: string; damage: number; reach: number }> = {
  fists: { name: 'Bare hands', damage: 0, reach: 0 }, club: { name: 'Cudgel', damage: 6, reach: 0.1 },
  sword: { name: 'Sword', damage: 10, reach: 0.15 }, blade: { name: 'Iron blade', damage: 18, reach: 0.2 }, staff: { name: 'Warden staff', damage: 12, reach: 0.45 },
};
export type ActionKind =
  | 'attack1' | 'attack2' | 'attack3' | 'roll' | 'gather' | 'throw' | 'hurt' | 'pickup' | 'land' | 'windup' | 'strike' | 'cheer';

export interface Point { x: number; z: number }
export interface Stock { gold: number; wood: number; stone: number; essence: number }
export interface Memory { opinion: number; conversations: number; witnessedCrime: number; alarmUntil: number; lastGreet: number; rumors: string[]; threatId?: string }
export interface Needs { energy: number; hunger: number; social: number; fun: number }
export type DeedKind = 'theft' | 'assault' | 'murder' | 'trespass';
export interface Deed {
  id: string;
  kind: DeedKind;
  at: number;
  locationId: string;
  locationName: string;
  victimId?: string;
  victimName?: string;
  witnessIds: string[];
  reaction?: 'estate' | 'vendetta' | 'alarm';
  inheritedBy?: string;
  inheritedCrowns?: number;
}
export interface Vendetta {
  id: string;
  familyId: string;
  victimId: string;
  victimName: string;
  contractorId?: string;
  createdAt: number;
  ambushAt: number;
  point: Point;
  count: number;
  triggered: boolean;
  resolved: boolean;
}

export interface Actor extends Point {
  id: string; kind: ActorKind; name: string;
  baseId?: string; spaceId?: string; scale?: number; portalTo?: string; neverFade?: boolean;
  y: number; vx: number; vy: number; vz: number;
  radius: number; height: number; solid: boolean; alive: boolean;
  hp: number; maxHp: number; faction: Faction; facing: number; variant: number;
  desc?: string; text?: string;
  itemType?: ItemType; owner?: string; carriedBy?: string; sleeping?: boolean; thrownBy?: string; thrownAt?: number; restTimer?: number;
  surface?: number;
  profession?: string; home?: Point; work?: Point; social?: Point;
  memory?: Memory; needs?: Needs; activity?: string; goal?: Point; talkingTo?: string; socialUntil?: number; lookAt?: string; retaliationUntil?: number;
  decideIn?: number; stuck?: number; detour?: number; detourT?: number; patrol?: Point[]; patrolIndex?: number;
  foeKind?: FoeKind; intent?: 'forage' | 'return' | 'raid' | 'chase' | 'search' | 'flee' | 'guard'; targetId?: string; lastKnown?: Point; lostFor?: number;
  carriedWood?: number; carriedStone?: number; attackCooldown?: number; workCooldown?: number; weaponLevel?: number;
  action?: ActionKind; actionT?: number; actionDur?: number; actionHit?: boolean; gatherTarget?: string; combo?: number;
  // Vivid AI: temperament, capabilities, routine and the goal currently being pursued.
  persona?: Persona; attrs?: Attrs; skills?: Skills; routine?: Routine; utility?: Goal;
  desires?: Desires; packages?: AiPackage[]; activePackage?: string;
  spells?: SpellId[]; focus?: number; maxFocus?: number; armor?: number;
  crowns?: number; homeFood?: number; wanted?: number; wantedUntil?: number;
  /** Shared inventory & equipment: the guardian's pack is the player actor's `items`. */
  items?: Partial<Record<ItemType, number>>; stolen?: Partial<Record<ItemType, number>>;
  weapon?: WeaponKind;
  seatTakenBy?: string; sittingOn?: string; sneaking?: boolean; quarryId?: string;
  familyId?: string; locationId?: string; capturedFor?: string; followingPlayer?: boolean; vendettaFor?: string;
  questFor?: string; guardPost?: Point;
  tactic?: TacticalOrder;
  houseId?: string; residents?: string[]; doorLocked?: boolean; homeDefenseUntil?: number; earnTimer?: number; workProgress?: number;
  locked?: number; loot?: ItemType[]; acc?: number; far?: boolean;
  structure?: StructureKind; currentRune?: number; targetRune?: number; stockWood?: number; stockStone?: number;
  shotAt?: number; shotX?: number; shotZ?: number; struckAt?: number;
}

export const BUILDINGS: Record<StructureKind, { name: string; description: string; wood: number; stone: number; gold: number; radius: number }> = {
  archer: { name: 'Archer tower', description: 'Looses arrows at foes on the road.', wood: 6, stone: 4, gold: 20, radius: 1.35 },
  ward: { name: 'Ward stone', description: 'Slowly mends the Citadel and nearby towers.', wood: 8, stone: 5, gold: 35, radius: 1.3 },
  barricade: { name: 'Barricade', description: 'Stakes that turn a charge.', wood: 4, stone: 2, gold: 10, radius: 1.15 },
  outpost: { name: 'Field camp', description: 'A tent to rest in and wake at.', wood: 10, stone: 8, gold: 45, radius: 2.2 },
};

export const RUNE_NAMES = ['dawn', 'leaf', 'star'];
export const TAVERN_POINT: Point = { x: -5.4, z: -4.6 };
export const WORLD_LIMIT = 90;
export const PLAYER_ID = 'guardian';
const CITADEL_ID = 'citadel';
const SAVE_VERSION = 2;

export interface QuestState { stage: string; status: 'active' | 'done' | 'failed'; log: string[]; title?: string; data?: DynamicQuestData }
export interface WorldSave {
  version: number; seed: number; actors?: Actor[]; changeForms?: Record<string, ChangeForm<Actor>>; spawned?: Actor[];
  stock: Stock; pack: Partial<Record<ItemType, number>>;
  elapsed: number; level: number; xp: number; weaponLevel: number; flags: Record<string, string | number | boolean>;
  quests: Record<string, QuestState>; tracked: string; wave: number; waveCleared: number; bounty: number; standing: number;
  nextId: number; echoProgress: number; echoSolved: boolean; respawn: Point;
  visitedLocations?: string[]; metNpcIds?: string[]; deeds?: Deed[]; vendettas?: Vendetta[];
  siteStates?: Record<string, SiteState>; nextRadiantQuest?: number; threatSignals?: ThreatSignal[];
  outsideReturn?: Point & { facing: number }; uGridsToLoad?: number; uExteriorCellBuffer?: number;
}
export interface Prompt { name: string; primary?: string; secondary?: string; crime: boolean }
export interface DialogueView { npcId: string; speaker: string; line: string; options: { id: string; text: string }[]; shop: boolean }
export interface HudView {
  hp: number; maxHp: number; stamina: number; maxStamina: number; combat: boolean;
  prompt: Prompt | null; subtitle: { speaker?: string; text: string } | null; notice: string;
  target: { name: string; hp: number; maxHp: number } | null; marker: Point | null; citadel: Point; player: Point;
  wave: number; waveActive: boolean; waveEnemies: number; bounty: number; defeated: boolean;
  focus: number; maxFocus: number; spellsKnown: number; sneaking: boolean;
  dialogue: DialogueView | null; time: string; day: number; holding: string | null; placing: StructureKind | null;
}
export interface ShopEntry { id: string; name: string; price: number; detail: string }
export interface SellEntry { id: ItemType | 'timber'; name: string; price: number; count: number }

const FOES: Record<FoeKind, { name: string; hp: number; speed: number; damage: number; bounty: number; radius: number; reach: number; windup: number; courage: number }> = {
  slime: { name: 'Slime', hp: 55, speed: 2.6, damage: 8, bounty: 6, radius: 0.6, reach: 1.0, windup: 0.5, courage: 1 },
  brute: { name: 'Brute', hp: 120, speed: 2.3, damage: 16, bounty: 14, radius: 0.7, reach: 1.5, windup: 0.75, courage: 1 },
  wisp: { name: 'Wisp', hp: 45, speed: 3.0, damage: 6, bounty: 10, radius: 0.5, reach: 1.2, windup: 0.45, courage: 0.3 },
  stalker: { name: 'Stalker', hp: 70, speed: 3.7, damage: 11, bounty: 12, radius: 0.5, reach: 1.3, windup: 0.4, courage: 0.4 },
};

const STATIC_DESC: Partial<Record<ActorKind, string>> = {
  house: 'A timber-framed home. Smoke curls from the chimney.',
  citadel: 'The Citadel. Its light has burned for three hundred years, and the wilds have hated it for as long.',
  table: 'A scarred table.',
  stall: "Tobin's market stall. Everything has a price painted on a scrap of slate.",
  post: 'The watch post. A crate for supplies sits by the ladder.',
  ruin: 'What is left of the old mill. The millstone is cracked clean through.',
  pillar: 'A post holding up the storehouse roof.',
  tower: 'A tower of fitted stone.',
  barricade: 'Sharpened stakes, bound tight.',
  dungeon: 'A stone mouth descends beneath the old earth.',
  tavern: 'The Kettle & Crown. Warm light, thin ale, and every rumour in the valley.',
};

function random(seed: number) {
  let n = seed >>> 0;
  return () => {
    n = (n + 0x6d2b79f5) | 0;
    let t = Math.imul(n ^ (n >>> 15), 1 | n);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const angleTo = (a: Point, b: Point) => Math.atan2(b.x - a.x, b.z - a.z);
function angleDelta(from: number, to: number) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Uniform spatial hash. Rebuilt for loose items each tick, and for static solids only when they change. */
class Grid {
  private cells = new Map<number, Actor[]>();
  constructor(private size = 4) {}
  clear() { this.cells.clear(); }
  insert(a: Actor) {
    const k = (Math.floor(a.x / this.size) + 512) * 4096 + Math.floor(a.z / this.size) + 512;
    const cell = this.cells.get(k);
    if (cell) cell.push(a); else this.cells.set(k, [a]);
  }
  query(x: number, z: number, r: number, out: Actor[]) {
    out.length = 0;
    const s = this.size;
    for (let cx = Math.floor((x - r) / s); cx <= Math.floor((x + r) / s); cx++) {
      for (let cz = Math.floor((z - r) / s); cz <= Math.floor((z + r) / s); cz++) {
        const cell = this.cells.get((cx + 512) * 4096 + cz + 512);
        if (cell) for (const a of cell) out.push(a);
      }
    }
    return out;
  }
}

const INTERACTIVE = new Set<ActorKind>(['item', 'villager', 'tree', 'ore', 'rune', 'echo', 'note', 'camp', 'well', 'house', 'table', 'stall', 'post', 'citadel', 'bell', 'ruin', 'tower', 'barricade', 'dungeon', 'tavern', 'portal', 'counter']);
const STATIC_KINDS = new Set<ActorKind>(['tree', 'ore', 'rune', 'echo', 'citadel', 'house', 'camp', 'tower', 'barricade', 'well', 'table', 'stall', 'pillar', 'ruin', 'post', 'note', 'bell', 'dungeon', 'tavern', 'portal', 'counter']);
const WORK_ACTIVITY: Record<string, string> = {
  Keeper: 'Keeping watch', Merchant: 'Minding the stall', Warden: 'Patrolling', Mason: 'Masonry', Woodcutter: 'Chopping',
  Herbalist: 'Gathering herbs', Farmer: 'Tending fields', Forager: 'Foraging', Apprentice: 'Studying', Smith: 'Forging',
  Gardener: 'Gardening', Baker: 'Baking', Scout: 'Scouting',
};

export class SandboxWorld {
  seed: number;
  actors: Actor[] = [];
  readonly streamer = new CellStream<Actor>();
  readonly baseReferences = new Map<string, ObjectReference>();
  private initialActors = new Map<string, Actor>();
  renderRevision = 0;
  uGridsToLoad = uGridsToLoad;
  uExteriorCellBuffer = uExteriorCellBuffer;
  outsideReturn?: Point & { facing: number };
  stock: Stock = { gold: 40, wood: 0, stone: 0, essence: 0 };
  pack: Partial<Record<ItemType, number>> = { draught: 1, apple: 2 };
  elapsed = 0;
  level = 1;
  xp = 0;
  weaponLevel = 1;
  flags: Record<string, string | number | boolean> = {};
  quests: Record<string, QuestState> = {};
  visitedLocations: string[] = [];
  siteStates: Record<string, SiteState> = {};
  nextRadiantQuest = 1;
  threatSignals: ThreatSignal[] = [];
  metNpcIds: string[] = [];
  deeds: Deed[] = [];
  vendettas: Vendetta[] = [];
  tracked = 'light';
  wave = 0;
  waveActive = false;
  waveCleared = 0;
  spawnQueue = 0;
  bounty = 0;
  hostileUntil = 0;
  standing = 0;
  nextId = 1;
  echoProgress = 0;
  echoSolved = false;
  respawn: Point = { x: 0, z: 11 };
  input = { x: 0, z: 0, sprint: false };
  stamina = 100;
  maxStamina = 100;
  placing: StructureKind | null = null;
  dialogue: { npcId: string; line: string; options: StoryOption[]; shop: boolean } | null = null;
  cameraEvents: { target: Point; duration: number }[] = [];
  private subtitle: { speaker?: string; text: string; until: number } | null = null;
  private notice = { text: '', until: 0 };
  private staminaDelay = 0;
  private invulnUntil = 0;
  private combatUntil = 0;
  private queuedAttack = false;
  private targetId: string | undefined;
  private targetUntil = 0;
  private spawnTimer = 0;
  private campTimer = 0;
  private questTimer = 0;
  private tacticTimer = 0;
  private confrontCooldown = 0;
  private staticDirty = true;
  private solidGrid = new Grid(4);
  private itemGrid = new Grid(2);
  private chars: Actor[] = [];
  private qa: Actor[] = [];
  private qb: Actor[] = [];
  private qc: Actor[] = [];
  private byIdCache = new Map<string, Actor>();
  private rng: () => number;

  constructor(seed = 4217, saved?: WorldSave) {
    this.seed = seed;
    this.rng = random(seed);
    this.createWorld();
    this.createInteriors();
    for (const actor of this.actors) {
      this.baseReferences.set(actor.id, referenceFor(actor));
      this.initialActors.set(actor.id, structuredClone(actor));
    }
    this.visitedLocations.push('village');
    this.quests.light = { stage: 'meet', status: 'active', log: [QUESTS.light.stages.meet.journal(this, 'light')] };
    if (saved && saved.version === SAVE_VERSION && (Array.isArray(saved.actors) || !!saved.changeForms)) this.restore(saved);
    this.reindex();
  }

  get currentSpace() { return spaceOf(this.player); }
  isActorLoaded(actor: Actor) { return this.streamer.isLoaded(actor); }
  reference(id: string) {
    const actor = this.byId(id);
    return actor ? referenceFor(actor) : this.baseReferences.get(id);
  }
  interiorName() {
    if (this.currentSpace === EXTERIOR_SPACE) return '';
    return this.byId(this.currentSpace.slice('interior:'.length))?.name ?? 'Interior';
  }
  get player() { return this.byId(PLAYER_ID)!; }
  get citadel() { return this.byId(CITADEL_ID)!; }
  get tavern() { return this.actors.find((a) => a.kind === 'tavern' && a.alive); }
  get camp() {
    return this.actors.find((a) => a.kind === 'camp' && a.faction === 'wild' && a.alive) ?? this.actors.find((a) => a.kind === 'camp' && a.faction === 'wild')!;
  }
  byId(id: string) {
    const cached = this.byIdCache.get(id);
    if (cached) return cached;
    const found = this.actors.find((a) => a.id === id);
    if (found) this.byIdCache.set(id, found);
    return found;
  }
  npc(name: string) { return this.actors.find((a) => a.kind === 'villager' && a.name === name && a.alive); }
  nearest(kind: ActorKind) {
    let best: Actor | undefined, bd = Infinity;
    for (const a of this.actors) if (a.alive && a.kind === kind) { const d = distance(a, this.player); if (d < bd) { bd = d; best = a; } }
    return best;
  }
  hour() { return (8 + this.elapsed / 30) % 24; }
  wildCampCount() { return this.actors.filter((a) => a.alive && a.kind === 'camp' && a.faction === 'wild').length; }
  runesSolved() { return this.actors.filter((a) => a.kind === 'rune' && a.currentRune === a.targetRune).length; }
  questStage(id: string) { const q = this.quests[id]; return q && q.status === 'active' ? q.stage : undefined; }

  private reindex() {
    this.byIdCache.clear();
    for (const a of this.actors) this.byIdCache.set(a.id, a);
    this.streamer.reconcile(this.actors);
    this.streamer.update(this.player, this.uGridsToLoad, this.uExteriorCellBuffer);
    this.staticDirty = true;
    this.renderRevision++;
  }

  // ---------------------------------------------------------------- world creation
  private add(kind: ActorKind, name: string, x: number, z: number, o: Partial<Actor> = {}): Actor {
    const a: Actor = {
      id: `a${this.nextId++}`, kind, name, x, z, y: 0, vx: 0, vy: 0, vz: 0, radius: 0.8, height: 3, solid: true, alive: true,
      hp: 100, maxHp: 100, faction: 'neutral', facing: 0, variant: 0, ...o,
    };
    a.baseId = baseIdFor(a);
    this.actors.push(a);
    this.byIdCache.set(a.id, a);
    if (STATIC_KINDS.has(kind)) { this.staticDirty = true; this.renderRevision++; }
    return a;
  }

  spawnItem(type: ItemType, x: number, z: number, y = 0, owner?: string) {
    const d = ITEMS[type];
    return this.add('item', d.name, x, z, {
      itemType: type, y, radius: d.radius, height: d.height, solid: false, hp: 1, maxHp: 1, owner,
      facing: this.rng() * Math.PI * 2, sleeping: true,
    });
  }
  random() { return this.rng(); }
  removeActor(actor: Actor) {
    if (!this.actors.includes(actor)) return false;
    actor.alive = false;
    this.actors = this.actors.filter((a) => a !== actor);
    this.byIdCache.delete(actor.id);
    if (STATIC_KINDS.has(actor.kind)) { this.staticDirty = true; this.renderRevision++; }
    return true;
  }

  private createInteriors() {
    const entrances = this.actors.filter((a) => a.kind === 'tavern' || a.kind === 'dungeon' || a.kind === 'house');
    for (const entrance of entrances) {
      const spaceId = interiorSpace(entrance.id);
      entrance.portalTo = spaceId;
      if (this.actors.some((a) => a.kind === 'portal' && a.spaceId === spaceId)) continue;
      this.add('portal', 'Back outside', 0, 5.35, { spaceId, portalTo: EXTERIOR_SPACE, radius: 0.65, height: 3, solid: false });
      if (entrance.kind === 'tavern') {
        this.add('counter', 'Tavern counter', 0, -4.6, { spaceId, radius: 1.3, height: 1.15, surface: 1.1, solid: true });
        this.add('table', 'Taproom table', -2.7, -0.6, { spaceId, radius: 0.8, height: 0.9, surface: 0.9 });
        const jug = this.spawnItem('jug', -2.6, -0.5, 0.9); jug.spaceId = spaceId;
        const stool = this.spawnItem('stool', -3, 0.9); stool.spaceId = spaceId;
      } else if (entrance.kind === 'dungeon') {
        this.add('table', 'Ancient shelf', -2.4, -1.4, { spaceId, radius: 0.8, height: 0.9, surface: 0.9 });
        const book = this.spawnItem('book', -2.4, -1.4, 0.9); book.spaceId = spaceId;
        const box = this.spawnItem('strongbox', 2.5, -2.4); box.spaceId = spaceId;
        box.locked = 24; box.loot = ['pouch', 'herb'];
      } else {
        this.add('table', 'Household table', -2.2, -1, { spaceId, radius: 0.75, height: 0.9, surface: 0.9 });
        const candle = this.spawnItem('candle', -2.2, -1, 0.9); candle.spaceId = spaceId;
      }
    }
  }

  enterInterior(entrance: Actor) {
    if (this.currentSpace !== EXTERIOR_SPACE || !entrance.portalTo || spaceOf(entrance) !== EXTERIOR_SPACE) return false;
    const p = this.player;
    const before = { x: p.x, z: p.z, facing: p.facing };
    const followers = this.actors.filter((a) => a.followingPlayer && sameSpace(a, p) && distance(a, p) < 6);
    this.outsideReturn = before;
    p.spaceId = entrance.portalTo;
    p.x = 0; p.z = 2.1; p.y = 0; p.vx = p.vy = p.vz = 0; p.facing = Math.PI; p.action = undefined;
    for (const follower of followers) { follower.spaceId = p.spaceId; follower.x = 1.3; follower.z = 2.8; }
    const held = this.held(); if (held) held.spaceId = p.spaceId;
    this.dialogue = null; this.placing = null; this.cameraEvents.length = 0;
    if (!this.visitedLocations.includes(p.spaceId)) this.visitedLocations.push(p.spaceId);
    this.streamer.reconcile(this.actors);
    this.streamer.update(p, this.uGridsToLoad, this.uExteriorCellBuffer);
    this.staticDirty = true;
    this.say(`Inside ${entrance.name}.`, undefined, 3);
    return true;
  }

  leaveInterior() {
    if (this.currentSpace === EXTERIOR_SPACE) return false;
    const p = this.player, room = this.currentSpace;
    const entrance = this.byId(room.slice('interior:'.length));
    const point = this.outsideReturn ?? { x: entrance?.x ?? 0, z: (entrance?.z ?? 0) + (entrance?.radius ?? 1) + 1.5, facing: Math.PI };
    const followers = this.actors.filter((a) => a.followingPlayer && spaceOf(a) === room);
    p.spaceId = EXTERIOR_SPACE;
    p.x = point.x; p.z = point.z; p.y = 0; p.vx = p.vy = p.vz = 0; p.facing = point.facing; p.action = undefined;
    for (const follower of followers) { follower.spaceId = EXTERIOR_SPACE; follower.x = p.x + 1.2; follower.z = p.z + 0.5; }
    const held = this.held(); if (held) held.spaceId = EXTERIOR_SPACE;
    this.outsideReturn = undefined;
    this.streamer.reconcile(this.actors);
    this.streamer.update(p, this.uGridsToLoad, this.uExteriorCellBuffer);
    this.staticDirty = true;
    this.say('Back in the open air.', undefined, 2.5);
    return true;
  }

  private createWorld() {
    this.add('player', 'The Guardian', 0, 11, {
      id: PLAYER_ID, radius: 0.42, height: 1.8, hp: 100, maxHp: 100, faction: 'citadel', facing: Math.PI, solid: false,
      attrs: { might: 6, agility: 6, will: 6 }, skills: { blade: 0, guard: 0, stealth: 0, lockpick: 0, speech: 5, magic: 0 },
      spells: [], focus: 66, maxFocus: 66, armor: 0, weapon: 'sword',
    });
    this.add('citadel', 'The Citadel', 0, -8, { id: CITADEL_ID, radius: 3.6, height: 12, hp: 500, maxHp: 500, faction: 'citadel', stockWood: 8, stockStone: 8, neverFade: true, desc: STATIC_DESC.citadel });
    this.add('camp', 'Wild camp', 5, 57, { radius: 2.6, height: 4, hp: 320, maxHp: 320, faction: 'wild', locationId: 'southern-camp', stockWood: 0, stockStone: 0, desc: 'Hide tents and a crude totem. It smells of smoke and wet fur.' });
    this.add('bell', 'Warning bell', 4.6, -3.4, { radius: 0.55, height: 3, desc: 'A bronze bell on a timber frame. Rung only when the village is ready to fight.' });
    this.add('well', 'Village well', 6, 0, { radius: 1.2, height: 1, desc: 'Cold, clean water.' });
    this.add('tavern', 'The Kettle & Crown', TAVERN_POINT.x, TAVERN_POINT.z, {
      radius: 2.15, height: 4.8, solid: true, faction: 'citadel',
      desc: 'A low-beamed tavern. The sign shows a crown above a steaming kettle.',
    });
    this.add('table', 'Tavern table', TAVERN_POINT.x, TAVERN_POINT.z + 2.7, { radius: 0.8, height: 0.9, surface: 0.9, desc: 'A scarred table, ringed with old cup marks.' });
    this.spawnItem('stool', TAVERN_POINT.x - 0.85, TAVERN_POINT.z + 2.7, 0, 'tavern');
    this.spawnItem('stool', TAVERN_POINT.x + 0.85, TAVERN_POINT.z + 2.7, 0, 'tavern');

    const houseActors: Actor[] = [];
    const houses: [number, number, number][] = [[-13, -5, 0], [13, -6, 1], [-17, 5, 1], [16, 7, 0], [-11, -18, 0], [12, -18, 1], [22, -3, 1], [-23, -12, 0]];
    houses.forEach(([x, z, variant]) => houseActors.push(this.add('house', 'Village home', x, z, { radius: 2.7, height: 6, variant, faction: 'citadel', residents: [], desc: STATIC_DESC.house })));

    const people: [string, string, Point, Point, Point, number][] = [
      ['Mara', 'Keeper', { x: -10, z: -2 }, { x: -2.5, z: 5 }, { x: 3, z: 4 }, 0],
      ['Tobin', 'Merchant', { x: 13, z: -2.4 }, { x: 7.6, z: 6.2 }, { x: 4, z: 3 }, 1],
      ['Alden', 'Warden', { x: -13, z: -1.6 }, { x: -7, z: 6 }, { x: -4, z: 3 }, 2],
      ['Iona', 'Mason', { x: 16, z: 10.4 }, { x: 11, z: 1 }, { x: 7, z: 2.5 }, 3],
      ['Perrin', 'Woodcutter', { x: -17, z: 8.4 }, { x: -12, z: 17 }, { x: -5, z: 1 }, 4],
      ['Lark', 'Herbalist', { x: 12, z: -14.6 }, { x: 21, z: -14 }, { x: 2, z: 5 }, 5],
      ['Oren', 'Farmer', { x: -11, z: -14.6 }, { x: -22, z: -2 }, { x: -2, z: 2 }, 6],
      ['Nell', 'Warden', { x: 22, z: 0.4 }, { x: 4.5, z: 25 }, { x: 6, z: 4 }, 7],
      ['Ellis', 'Forager', { x: -23, z: -8.6 }, { x: -30, z: 14 }, { x: -7, z: 0 }, 8],
      ['Rhea', 'Apprentice', { x: 13.6, z: -2.2 }, { x: 3, z: -3.2 }, { x: 8, z: 3 }, 9],
      ['Sera', 'Smith', { x: 22.6, z: 0.6 }, { x: 19, z: -9 }, { x: 6, z: 1.5 }, 10],
      ['Tamsin', 'Gardener', { x: -22.4, z: -8.4 }, { x: -19, z: -17 }, { x: -6, z: 2 }, 11],
      ['Bran', 'Baker', { x: 16.6, z: 10.6 }, { x: 21.4, z: 7.2 }, { x: 3, z: 3 }, 12],
      ['Vela', 'Scout', { x: 12.6, z: -14.4 }, { x: 10, z: 23 }, { x: 5, z: 5 }, 13],
    ];
    for (const [name, profession, home, work, social, variant] of people) {
      const house = houseActors.reduce((best, candidate) => distance(candidate, home) < distance(best, home) ? candidate : best, houseActors[0]);
      const npc = this.add('villager', name, work.x, work.z, {
        radius: 0.42, height: 1.8, solid: false, hp: 80, maxHp: 80, faction: 'citadel', profession, home, work, social, variant,
        familyId: name === 'Tobin' || name === 'Bran' ? 'marlowe' : undefined,
        activity: WORK_ACTIVITY[profession], decideIn: this.rng(),
        memory: { opinion: 0, conversations: 0, witnessedCrime: 0, alarmUntil: 0, lastGreet: -99, rumors: [] },
        needs: { energy: 0.8 + this.rng() * 0.2, hunger: this.rng() * 0.4, social: this.rng() * 0.5, fun: this.rng() * 0.4 },
        persona: makePersona(this.rng, profession), attrs: makeAttrs(this.rng, profession), skills: makeSkills(this.rng, profession),
        routine: makeRoutine(this.rng, profession, home, social),
        crowns: profession === 'Merchant' ? 60 : 4 + Math.floor(this.rng() * 20), homeFood: 2,
        items: this.rng() < 0.5 ? { apple: 1 } : {},
        weapon: profession === 'Warden' ? 'staff' : profession === 'Scout' ? 'blade'
          : profession === 'Smith' || profession === 'Woodcutter' || profession === 'Mason' ? 'club' : 'fists',
        spells: (['Apprentice', 'Herbalist', 'Keeper'] as string[]).includes(profession) ? (['mending', 'bolt'] as SpellId[]) : undefined,
        focus: 60, maxFocus: 60, armor: profession === 'Warden' ? 0.2 : 0,
      });
      // Generated after the established actor values so worlds remain seed-compatible.
      npc.houseId = house.id;
      npc.desires = makeDesires(this.rng, profession, npc.persona);
      npc.packages = makePackages(npc.routine!, profession);
      house.residents!.push(npc.id);
    }
    for (const name of ['Tobin', 'Bran']) {
      const owner = this.npc(name)!;
      this.spawnItem('candle', owner.home!.x + 1, owner.home!.z + 0.8, 0, name);
    }
    this.npc('Alden')!.patrol = [{ x: -6, z: 8 }, { x: -14, z: -1 }, { x: -5, z: -14 }, { x: 8, z: -12 }, { x: 9, z: 9 }];
    this.npc('Nell')!.patrol = [{ x: 4.5, z: 25 }, { x: 7, z: 31 }, { x: -1, z: 30 }];
    this.npc('Vela')!.patrol = [{ x: 10, z: 23 }, { x: 4, z: 29 }, { x: 13, z: 34 }];

    // Market stall and bakery: owned goods.
    const stall = this.add('stall', 'Market stall', 9.4, 6.2, { radius: 0.95, height: 0.95, surface: 0.95, desc: STATIC_DESC.stall });
    [[-0.45, -0.3, 'apple'], [-0.2, -0.35, 'apple'], [0.1, -0.3, 'apple'], [0.4, 0.2, 'jug'], [-0.3, 0.3, 'bread'], [0.05, 0.25, 'cheese'], [0.45, -0.2, 'draught']].forEach(([dx, dz, t]) =>
      this.spawnItem(t as ItemType, stall.x + (dx as number), stall.z + (dz as number), 0.95, 'Tobin'));
    const bakery = this.add('table', 'Bakery table', 23, 7.2, { radius: 0.8, height: 0.9, surface: 0.9, desc: 'Flour dusts every board.' });
    this.spawnItem('bread', bakery.x - 0.3, bakery.z + 0.25, 0.9, 'Bran');
    this.spawnItem('bread', bakery.x + 0.25, bakery.z + 0.3, 0.9, 'Bran');
    this.spawnItem('basket', bakery.x + 1.3, bakery.z + 0.6, 0, 'Bran');

    // The storehouse: an open pavilion of shelves and floor clutter.
    const sx = -31, sz = 8;
    for (const [dx, dz] of [[-2.6, -2.2], [2.6, -2.2], [-2.6, 2.2], [2.6, 2.2]]) this.add('pillar', 'Roof post', sx + dx, sz + dz, { radius: 0.2, height: 3.3, desc: STATIC_DESC.pillar });
    this.add('roof', 'Storehouse roof', sx, sz, { solid: false, radius: 3 });
    const t1 = this.add('table', 'Storehouse shelf', sx - 1.2, sz - 0.8, { radius: 0.8, height: 0.9, surface: 0.9, desc: 'Shelves of village stores.' });
    const t2 = this.add('table', 'Storehouse shelf', sx + 1.2, sz + 0.9, { radius: 0.8, height: 0.9, surface: 0.9, desc: 'Shelves of village stores.' });
    ([[t1, -0.35, -0.3, 'pot'], [t1, 0.3, -0.25, 'jug'], [t1, 0.0, 0.3, 'candle'], [t1, -0.4, 0.25, 'book'], [t1, 0.35, 0.3, 'herb'],
      [t2, -0.3, -0.3, 'pouch'], [t2, 0.3, -0.2, 'hammer'], [t2, -0.2, 0.3, 'candle'], [t2, 0.3, 0.3, 'herb'], [t2, 0.0, 0.0, 'lantern']] as [Actor, number, number, ItemType][])
      .forEach(([t, dx, dz, type]) => this.spawnItem(type, t.x + dx, t.z + dz, 0.9, 'village'));
    ([[-2.0, 1.6, 'barrel'], [-1.1, 1.8, 'barrel'], [-2.1, 0.7, 'barrel'], [1.9, -1.6, 'crate'], [1.9, -0.5, 'crate'], [0.6, -1.7, 'bucket'], [-0.2, 1.9, 'basket'], [0.4, 0.1, 'pot']] as [number, number, ItemType][])
      .forEach(([dx, dz, type]) => this.spawnItem(type, sx + dx, sz + dz, 0, 'village'));
    this.add('note', 'Slate by the door', sx + 2.6, sz + 3.2, { radius: 0.3, height: 1.2, text: 'Village stores. Take what the watch needs; tell Mara what you took.' });
    const box1 = this.spawnItem('strongbox', sx + 0.9, sz - 1.7, 0, 'village');
    box1.locked = 18; box1.loot = ['pouch', 'draught'];
    this.spawnItem('tomeMend', sx - 2.2, sz + 2.6, 0);

    // The old mill ruin, where the ledger lies.
    const mx = -44, mz = 36;
    ([[-2.2, -1.8, 1.2, 0], [2.0, -1.5, 1.0, 1], [-2.4, 2.0, 1.1, 2], [2.4, 2.4, 0.9, 1]] as [number, number, number, number][])
      .forEach(([dx, dz, r, v]) => this.add('ruin', 'Mill wall', mx + dx, mz + dz, { radius: r, height: 2.2, variant: v, desc: STATIC_DESC.ruin }));
    this.spawnItem('ledger', mx + 0.3, mz + 0.2, 0, 'Tobin');
    const box2 = this.spawnItem('strongbox', mx - 1.4, mz - 0.8, 0);
    box2.locked = 30; box2.loot = ['pouch', 'pouch', 'tomeBolt'];
    this.spawnItem('pot', mx - 0.9, mz + 0.8, 0);
    this.spawnItem('stoneChunk', mx + 1.2, mz - 0.4, 0);
    this.add('note', 'Torn page', mx + 1.1, mz + 1.4, { radius: 0.3, height: 1.2, text: '...left it by the millstone, I am sure of it. Must come back before Vela goes poking about. T.' });

    for (const site of DUNGEON_SITES) {
      this.add('dungeon', site.name, site.point.x, site.point.z, {
        radius: 1.3, height: 3.6, solid: true, locationId: site.id,
        desc: `A dark entrance into ${site.name.toLowerCase()}. The stone around it is older than the road.`,
      });
    }

    // Watch post, standing stones, echo stones.
    this.add('post', 'Watch post', 3, 28, { radius: 0.9, height: 4.5, desc: STATIC_DESC.post });
    this.spawnItem('crate', 4.6, 29.4, 0, 'village');
    ([[-11, 3, 1, 0], [-11, 7, 2, 1], [-11, 11, 0, 2]] as [number, number, number, number][])
      .forEach(([x, z, targetRune, currentRune], i) => this.add('rune', 'Standing stone', x, z, { radius: 0.75, height: 2.8, targetRune, currentRune, variant: i }));
    this.add('note', 'Chalked slate', -13.2, 7, { radius: 0.3, height: 1.2, text: 'Faces above, signs below. The stones forget; we remember. O.' });
    for (let i = 0; i < 3; i++) this.add('echo', 'Echo stone', 24 + i * 3.2, -19, { radius: 0.7, height: 2.6, variant: i, currentRune: i, targetRune: i });

    // Clutter that makes the village feel used.
    ([[4, 9.4, 'crate'], [18, -1, 'crate'], [-15.5, -2, 'barrel'], [14.8, -2.6, 'barrel'], [-19.6, 3.4, 'barrel'], [18.8, 9.8, 'barrel'],
      [21.6, -0.9, 'barrel'], [7.9, 1.5, 'stool'], [4.1, 1.7, 'stool'], [6.3, -1.9, 'stool'], [5, -1.3, 'bucket'], [-9.4, -3.6, 'pot'],
      [14, 9.6, 'basket'], [-2.6, -2.6, 'lantern'], [-14.2, 12.2, 'log'], [-14.8, 12.6, 'log'], [-14.4, 13.1, 'log'], [-13.7, 12.7, 'log'],
      [-16.2, 1.2, 'pot'], [12.2, -9.8, 'bucket'], [10.6, -10.4, 'barrel'], [-9.8, -15, 'crate'], [9.6, -14.6, 'basket'], [20.4, -7.6, 'stoneChunk'],
      [19.6, -8.3, 'hammer'], [-20.4, -3.2, 'bucket'], [-21.2, -16.4, 'herb'], [-18.6, -17.6, 'herb']] as [number, number, ItemType][])
      .forEach(([x, z, type]) => this.spawnItem(type, x, z, 0));

    // Trees and stone near the village, then the forest that fills the rest of the valley.
    ([['tree', -6, 15, 0], ['tree', -10, 19, 1], ['tree', 8, 18, 2], ['tree', 15, 18, 1], ['ore', 6, 13.5, 0], ['ore', 11, 15, 1], ['ore', -8, 22, 1],
      ['tree', -3, 46, 1], ['tree', -8, 53, 0], ['tree', 12, 48, 2], ['tree', 16, 55, 1], ['ore', 1, 49, 0], ['ore', 11, 52, 1], ['ore', -5, 60, 0], ['ore', 16, 62, 1]] as ['tree' | 'ore', number, number, number][])
      .forEach(([kind, x, z, v]) => this.addNode(kind, x, z, v));
    const clear = [{ x: 0, z: 0, r: 26 }, { x: sx, z: sz, r: 7 }, { x: mx, z: mz, r: 7 }, { x: 3, z: 28, r: 5 }, { x: 27, z: -19, r: 6 }, { x: 5, z: 57, r: 12 }];
    for (let i = 0; i < 190; i++) {
      const x = (this.rng() - 0.5) * 172, z = (this.rng() - 0.5) * 172;
      if (clear.some((c) => Math.hypot(x - c.x, z - c.z) < c.r) || (Math.abs(x - 1) < 5 && z > 12 && z < 66)) continue;
      if (this.actors.some((a) => a.solid && distance(a, { x, z }) < a.radius + 2.2)) continue;
      this.addNode(i % 6 === 0 ? 'ore' : 'tree', x, z, i % 3);
    }

    ([[7, 54, 'crate'], [2, 61, 'crate'], [9, 56, 'barrel'], [0, 55, 'barrel']] as [number, number, ItemType][]).forEach(([x, z, t]) => this.spawnItem(t, x, z, 0));
    ([['slime', 0, 51], ['brute', 10, 53], ['wisp', -2, 57], ['stalker', 12, 60], ['slime', -4, 52], ['brute', 15, 58], ['stalker', -7, 60], ['wisp', 8, 64]] as [FoeKind, number, number][])
      .forEach(([k, x, z]) => this.spawnFoe(k, x, z));
  }

  private addNode(kind: 'tree' | 'ore', x: number, z: number, variant = 0) {
    this.add(kind, kind === 'tree' ? 'Old-growth tree' : 'Stone outcrop', x, z, {
      radius: kind === 'tree' ? 0.7 : 1, height: kind === 'tree' ? 6 : 1.3, hp: 3, maxHp: 3, variant,
      desc: kind === 'tree' ? 'An old tree, thick enough to give good timber.' : 'Grey stone, easy to split along the seams.',
    });
  }

  private spawnFoe(kind: FoeKind, x: number, z: number, raid = false) {
    const def = FOES[kind];
    return this.add('foe', def.name, x, z, {
      foeKind: kind, faction: 'wild', radius: def.radius, height: 1.8, solid: false, hp: def.hp + this.wave * 8, maxHp: def.hp + this.wave * 8,
      intent: raid ? 'raid' : 'forage', carriedWood: 0, carriedStone: 0, attackCooldown: 0, workCooldown: 0, weaponLevel: 1,
      focus: kind === 'wisp' ? 60 : 0, maxFocus: kind === 'wisp' ? 60 : 0,
      facing: this.rng() * Math.PI * 2,
    });
  }

  // ---------------------------------------------------------------- messages
  say(text: string, speaker?: string, seconds = 4.5) { this.subtitle = { text, speaker, until: this.elapsed + seconds }; }
  notify(text: string) { this.notice = { text, until: this.elapsed + 5 }; }
  private bark(n: Actor, text: string) { if (sameSpace(n, this.player) && distance(n, this.player) < 7 && !this.dialogue) this.say(text, n.name, 2.6); }

  // ---------------------------------------------------------------- quests
  private questDefinition(id: string): QuestDef | undefined {
    return QUESTS[this.quests[id]?.data?.kind ?? id];
  }
  startQuest(id: string, stage: string) {
    if (this.quests[id]) return;
    const def = QUESTS[id];
    this.quests[id] = { stage, status: 'active', title: def.title, log: [def.stages[stage].journal(this, id)] };
    this.tracked = id;
    this.notify(`New in your journal: ${def.title}`);
  }
  setStage(id: string, stage: string) {
    const q = this.quests[id];
    const def = this.questDefinition(id);
    if (!q || !def) return;
    q.stage = stage;
    if (stage === 'done') {
      q.status = 'done';
      this.releaseQuestSite(id);
      this.notify(`${this.questTitle(id)} completed`);
      if (this.tracked === id) this.tracked = Object.keys(this.quests).find((k) => this.quests[k].status === 'active') ?? id;
      return;
    }
    q.log.push(def.stages[stage].journal(this, id));
    this.notify(`Journal updated: ${this.questTitle(id)}`);
  }
  private failRadiantQuest(id: string, reason: string) {
    const q = this.quests[id];
    if (!q || q.status !== 'active') return;
    q.status = 'failed';
    q.log.push(reason);
    this.releaseQuestSite(id);
    if (this.tracked === id) this.tracked = Object.keys(this.quests).find((k) => this.quests[k].status === 'active') ?? id;
    this.notify(`${this.questTitle(id)} could not be finished`);
  }
  private releaseQuestSite(id: string) {
    const siteId = this.quests[id]?.data?.siteId;
    const state = siteId ? this.siteStates[siteId] : undefined;
    if (state?.questId === id) {
      state.phase = 'recovering';
      state.questId = undefined;
      state.readyAt = this.elapsed + 45;
      state.lastUsed = this.elapsed;
    }
  }
  journalText(id: string) {
    const q = this.quests[id];
    if (!q) return '';
    if (q.status !== 'active') return q.log[q.log.length - 1];
    return this.questDefinition(id)?.stages[q.stage]?.journal(this, id) ?? '';
  }
  questTitle(id: string) { return this.quests[id]?.title ?? QUESTS[id]?.title ?? id; }
  questTarget(): Point | null {
    const q = this.quests[this.tracked];
    if (!q || q.status !== 'active') return null;
    if (this.currentSpace !== EXTERIOR_SPACE) {
      const exit = this.actors.find((a) => a.kind === 'portal' && a.spaceId === this.currentSpace);
      return exit ? { x: exit.x, z: exit.z } : null;
    }
    return this.questDefinition(this.tracked)?.stages[q.stage]?.target?.(this, this.tracked) ?? null;
  }
  private updateQuests() {
    for (const [id, q] of Object.entries(this.quests)) {
      if (q.status !== 'active') continue;
      const data = q.data;
      if (data && !this.byId(data.patronId)?.alive) { this.failRadiantQuest(id, 'The person who asked for help is gone.'); continue; }
      if (data?.kind === 'rescue' && !this.byId(data.captiveId)?.alive) { this.failRadiantQuest(id, `${data.captiveName} did not survive.`); continue; }
      if (data?.kind === 'hunt' && !this.byId(data.enemyId)?.alive) data.defeated = true;
      const next = this.questDefinition(id)?.stages[q.stage]?.update?.(this, id);
      if (next) this.setStage(id, next);
    }
  }

  private updateWorldHistory() {
    if (this.currentSpace !== EXTERIOR_SPACE) return;
    const p = this.player;
    for (const place of WORLD_LOCATIONS) {
      if (!this.visitedLocations.includes(place.id) && distance(p, place.point) <= place.radius) {
        this.visitedLocations.push(place.id);
        if (place.kind !== 'settlement') this.notify(`Discovered: ${place.name}`);
      }
    }
    for (const n of this.actors) {
      if (n.kind !== 'villager' || !n.alive || this.metNpcIds.includes(n.id)) continue;
      if (distance(p, n) < 6 && canSee(n, p, 7, this.hour(), p.skills?.stealth ?? 0, !!p.sneaking)) this.metNpcIds.push(n.id);
    }
    this.refreshSiteStates();
  }

  private refreshSiteStates() {
    for (const site of RADIANT_SITES) {
      if (!this.visitedLocations.includes(site.id)) continue;
      const state = this.siteStates[site.id] ??= { phase: 'uncleared' };
      if (state.phase === 'occupied') {
        if (state.questId && this.quests[state.questId]?.status === 'active') continue;
        state.phase = 'recovering';
        state.readyAt = this.elapsed + 45;
        state.lastUsed ??= this.elapsed;
        state.questId = undefined;
      }
      if (state.phase === 'recovering' && (state.readyAt ?? 0) > this.elapsed) continue;
      const threatened = this.actors.some((a) => a.alive && a.kind === 'foe'
        && (a.x - site.point.x) ** 2 + (a.z - site.point.z) ** 2 < site.radius ** 2);
      if (threatened) state.phase = 'uncleared';
      else state.phase = state.lastUsed === undefined ? 'cleared' : 'reset';
    }
  }
  locationStatus(id: string) {
    this.refreshSiteStates();
    return this.visitedLocations.includes(id) ? this.siteStates[id]?.phase ?? 'uncleared' : 'unexplored';
  }
  private availableAliases() {
    this.refreshSiteStates();
    const readiness = Math.min(3, this.level + (this.weaponLevel > 1 ? 1 : 0));
    return matchLocationAliases(this.visitedLocations, this.siteStates, this.actors, this.player, readiness, this.nextRadiantQuest);
  }
  radiantQuests(): [string, QuestState][] { return Object.entries(this.quests).filter(([, q]) => !!q.data); }
  hasActiveRadiantFor(patronId: string) {
    return this.radiantQuests().some(([, q]) => q.status === 'active' && q.data?.patronId === patronId);
  }
  canGenerateRadiant(patron: Actor) {
    return patron.kind === 'villager' && patron.alive && this.metNpcIds.includes(patron.id)
      && !this.hasActiveRadiantFor(patron.id) && this.availableAliases().length > 0;
  }
  canGenerateRescue(patron: Actor) {
    return this.canGenerateRadiant(patron) && (patron.memory?.opinion ?? 0) >= 10
      && this.actors.some((a) => a.kind === 'villager' && a.alive && a !== patron && !a.capturedFor
        && this.metNpcIds.includes(a.id) && (a.memory?.opinion ?? 0) > 0 && a.profession !== 'Warden');
  }

  private nextQuestKey() {
    let id: string;
    do { id = `radiant-${this.nextRadiantQuest++}`; } while (this.quests[id]);
    return id;
  }
  private reserveSite(alias: LocationAlias, id: string) {
    this.siteStates[alias.locationId] = { phase: 'occupied', questId: id, lastUsed: this.siteStates[alias.locationId]?.lastUsed };
  }
  private beginRadiant(id: string, data: DynamicQuestData, title: string, alias: LocationAlias) {
    this.quests[id] = { stage: 'travel', status: 'active', title, log: [], data };
    this.reserveSite(alias, id);
    this.quests[id].log.push(QUESTS[data.kind].stages.travel.journal(this, id));
    this.tracked = id;
    this.notify(`New in your journal: ${title}`);
  }
  private stationGuard(id: string, alias: LocationAlias, x: number, z: number) {
    const guard = this.spawnFoe('stalker', x, z);
    guard.name = 'Site guard';
    guard.intent = 'guard';
    guard.guardPost = { ...alias.point };
    guard.lastKnown = { ...alias.point };
    guard.questFor = id;
    return guard;
  }
  generateRescueQuest(patron: Actor) {
    if (!this.canGenerateRescue(patron)) return false;
    const captives = this.actors.filter((a) => a.kind === 'villager' && a.alive && a !== patron && !a.capturedFor
      && this.metNpcIds.includes(a.id) && (a.memory?.opinion ?? 0) > 0 && a.profession !== 'Warden');
    captives.sort((a, b) => (b.memory?.opinion ?? 0) - (a.memory?.opinion ?? 0) || a.id.localeCompare(b.id));
    const captive = captives[0];
    const readiness = this.level - 1 + (this.weaponLevel > 1 ? 1 : 0) + ((this.player.spells?.length ?? 0) > 0 ? 1 : 0);
    const site = this.availableAliases()[0];
    if (!captive || !site) return false;
    const id = this.quests.rescue ? this.nextQuestKey() : 'rescue';

    if (captive.sittingOn) this.releaseSeat(captive);
    this.endConversation(captive);
    const originalPoint = { x: captive.x, z: captive.z };
    const guardCount = clamp(1 + Math.floor(readiness / 2) + Math.max(0, site.difficulty - 1), 1, 3);
    const stealth = this.player.skills?.stealth ?? 0;
    const approach = stealth >= 20
      ? 'Your stealth may let you slip past the sentries.'
      : readiness >= 2 ? 'The sentries know the tunnels. Expect a fight if you rush in.' : 'The entrance is close; stay quiet and look for a way through.';
    const data: DynamicQuestData = {
      kind: 'rescue', patronId: patron.id, captiveId: captive.id, captiveName: captive.name,
      siteId: site.locationId, siteName: site.locationName, siteActorId: site.actorId,
      dungeonId: site.locationId, dungeonName: site.locationName, dungeonActorId: site.actorId,
      aliases: { locationId: site.locationId, locationActorId: site.actorId, personId: captive.id },
      point: { ...site.point }, originalPoint, reward: 25 + readiness * 10, guardCount, approach,
    };
    this.beginRadiant(id, data, `${captive.name} at ${site.locationName}`, site);
    captive.capturedFor = id;
    captive.followingPlayer = false;
    captive.activity = 'Captured';
    captive.utility = undefined;
    captive.goal = undefined;
    captive.action = undefined; captive.actionT = 0; captive.actionDur = 0;
    captive.x = site.point.x + (site.kind === 'camp' ? 4.3 : 2.4);
    captive.z = site.point.z + 2.2;
    captive.vx = captive.vz = 0;
    for (let i = 0; i < guardCount; i++) {
      const angle = (i / guardCount) * Math.PI * 2;
      this.stationGuard(id, site, site.point.x + Math.cos(angle) * 5, site.point.z + Math.sin(angle) * 5);
    }
    return true;
  }

  /** Assemble a new objective from a place, a patron, and an item, enemy, or known friend. */
  generateRadiantQuest(patron: Actor, preferred?: DynamicQuestData['kind']): string | undefined {
    if (!this.canGenerateRadiant(patron)) return undefined;
    const cycle: DynamicQuestData['kind'][] = ['retrieve', 'hunt', 'rescue'];
    let kind = preferred ?? cycle[(this.nextRadiantQuest - 1) % cycle.length];
    if (kind === 'rescue') {
      if (this.canGenerateRescue(patron) && this.generateRescueQuest(patron)) return this.tracked;
      if (preferred) return undefined;
      kind = this.nextRadiantQuest % 2 ? 'retrieve' : 'hunt';
    }
    const alias = this.availableAliases()[0];
    if (!alias) return undefined;
    const id = this.nextQuestKey();
    const base = {
      patronId: patron.id, siteId: alias.locationId, siteName: alias.locationName, siteActorId: alias.actorId,
      point: { ...alias.point }, reward: 22 + alias.difficulty * 8 + this.level * 4,
    };
    if (kind === 'retrieve') {
      const itemType = RADIANT_ITEMS[(this.nextRadiantQuest + Math.floor(this.rng() * RADIANT_ITEMS.length)) % RADIANT_ITEMS.length];
      const item = this.spawnItem(itemType, alias.point.x + 2.4, alias.point.z + 2.3);
      item.questFor = id;
      const data: DynamicQuestData = {
        ...base, kind, itemType, itemName: ITEMS[itemType].name, itemActorId: item.id,
        aliases: { locationId: alias.locationId, locationActorId: alias.actorId, itemType, itemActorId: item.id },
      };
      this.beginRadiant(id, data, `${data.itemName} from ${alias.locationName}`, alias);
      this.stationGuard(id, alias, alias.point.x - 4.5, alias.point.z + 2.5);
    } else {
      const kinds: FoeKind[] = ['brute', 'stalker', 'wisp', 'slime'];
      const enemyType = kinds[(this.nextRadiantQuest + Math.floor(this.rng() * kinds.length)) % kinds.length];
      const enemy = this.spawnFoe(enemyType, alias.point.x + 3.8, alias.point.z + 3);
      enemy.name = `${FOES[enemyType].name} captain`;
      enemy.questFor = id;
      enemy.guardPost = { ...alias.point };
      enemy.intent = 'guard';
      const data: DynamicQuestData = {
        ...base, kind: 'hunt', enemyType, enemyName: enemy.name, enemyId: enemy.id,
        aliases: { locationId: alias.locationId, locationActorId: alias.actorId, enemyType, enemyId: enemy.id },
      };
      this.beginRadiant(id, data, `${enemy.name} at ${alias.locationName}`, alias);
      this.stationGuard(id, alias, alias.point.x - 4.4, alias.point.z + 2.5);
    }
    return id;
  }

  rescueCaptive(captive: Actor) {
    const id = captive.capturedFor;
    const quest = id ? this.quests[id] : undefined, data = quest?.data;
    if (!quest || quest.status !== 'active' || quest.stage !== 'free' || data?.kind !== 'rescue' || data.captiveId !== captive.id || !captive.alive) return false;
    data.rescued = true;
    captive.capturedFor = undefined;
    captive.followingPlayer = true;
    captive.activity = 'Following';
    captive.utility = undefined;
    captive.action = undefined;
    captive.decideIn = 1;
    this.adjustOpinion(captive, 12);
    this.addRumor(captive, 'helped');
    this.setStage(id!, 'report');
    return true;
  }

  finishRescueQuest(patron: Actor, id = this.radiantQuests().find(([, q]) => q.status === 'active' && q.data?.kind === 'rescue' && q.data.patronId === patron.id)?.[0]) {
    const quest = id ? this.quests[id] : undefined, data = quest?.data;
    const captive = data?.kind === 'rescue' ? this.byId(data.captiveId) : undefined;
    if (!id || !quest || quest.status !== 'active' || quest.stage !== 'report' || data?.kind !== 'rescue' || data.patronId !== patron.id || !captive?.alive || !data.rescued) return false;
    this.stock.gold += data.reward;
    this.awardExperience(25);
    if (!this.flags.firstRescueReward) { this.addToPack('familyLocket'); this.flags.firstRescueReward = true; }
    this.adjustOpinion(patron, 10);
    this.adjustOpinion(captive, 8);
    captive.followingPlayer = false;
    captive.activity = undefined;
    captive.utility = undefined;
    this.addRumor(patron, 'helped');
    this.setStage(id, 'done');
    return true;
  }

  finishRetrieveQuest(id: string, patron: Actor) {
    const quest = this.quests[id], data = quest?.data;
    if (!quest || quest.status !== 'active' || quest.stage !== 'report' || data?.kind !== 'retrieve'
      || data.patronId !== patron.id || !data.recovered || !this.takeFromPack(data.itemType)) return false;
    this.stock.gold += data.reward;
    this.awardExperience(18);
    this.adjustOpinion(patron, 8);
    this.addRumor(patron, 'helped');
    this.setStage(id, 'done');
    return true;
  }

  finishHuntQuest(id: string, patron: Actor) {
    const quest = this.quests[id], data = quest?.data;
    if (!quest || quest.status !== 'active' || quest.stage !== 'report' || data?.kind !== 'hunt' || data.patronId !== patron.id || !data.defeated) return false;
    this.stock.gold += data.reward;
    this.awardExperience(22);
    this.adjustOpinion(patron, 8);
    this.addRumor(patron, 'helped');
    this.setStage(id, 'done');
    return true;
  }

  // ---------------------------------------------------------------- people
  adjustOpinion(n: Actor, delta: number) { if (n.memory) n.memory.opinion = clamp(n.memory.opinion + delta, -100, 100); }
  addRumor(n: Actor, rumor: string) { if (n.memory && !n.memory.rumors.includes(rumor)) n.memory.rumors.push(rumor); }

  awardExperience(amount: number) {
    this.xp += amount;
    while (this.xp >= this.level * 75) {
      this.xp -= this.level * 75;
      this.level++;
      this.player.maxHp += 15;
      this.player.hp = this.player.maxHp;
      this.notify(`You feel stronger. (Level ${this.level})`);
    }
  }

  // ---------------------------------------------------------------- pack
  addToPack(type: ItemType, n = 1) { this.pack[type] = (this.pack[type] ?? 0) + n; }
  /** Any actor's inventory: the guardian uses the world pack, everyone else carries their own. */
  bag(a: Actor): Partial<Record<ItemType, number>> {
    if (a.kind === 'player') return this.pack;
    if (!a.items) a.items = {};
    return a.items;
  }
  give(a: Actor, type: ItemType, n = 1, stolen = false) {
    const b = this.bag(a);
    b[type] = (b[type] ?? 0) + n;
    if (stolen && a.kind !== 'player') { a.stolen = a.stolen ?? {}; a.stolen[type] = (a.stolen[type] ?? 0) + n; }
  }
  take(a: Actor, type: ItemType, n = 1): boolean {
    const b = this.bag(a);
    if ((b[type] ?? 0) < n) return false;
    if (b[type] === n) delete b[type]; else b[type] = b[type]! - n;
    return true;
  }
  firstFood(a: Actor): ItemType | undefined {
    const b = this.bag(a);
    return (['bread', 'cheese', 'apple', 'herb'] as ItemType[]).find((t) => (b[t] ?? 0) > 0);
  }
  /** Melee damage from the same formula for everyone: body, skill and what is in the hand. */
  meleeDamage(a: Actor): number {
    const w = WEAPONS[a.weapon ?? 'fists'];
    return (6 + (a.attrs?.might ?? 5) * 1.3 + w.damage) * (1 + (a.skills?.blade ?? 0) / 110);
  }
  takeFromPack(type: ItemType, n = 1) {
    const have = this.pack[type] ?? 0;
    if (have < n) return false;
    if (have === n) delete this.pack[type]; else this.pack[type] = have - n;
    return true;
  }
  usePack(type: ItemType): string {
    const def = ITEMS[type];
    if (!this.pack[type]) return '';
    if (def.read) {
      if (type === 'ledger') this.flags.ledgerRead = true;
      if (type === 'tomeBolt' || type === 'tomeMend') {
        const spell: SpellId = type === 'tomeBolt' ? 'bolt' : 'mending';
        if (!this.player.spells!.includes(spell)) { this.player.spells!.push(spell); this.skillXp('magic', 10); }
      }
      return def.read;
    }
    if (def.heal) {
      const p = this.player;
      if (p.hp >= p.maxHp) return 'You are not hurt.';
      this.takeFromPack(type);
      p.hp = Math.min(p.maxHp, p.hp + def.heal);
      return `You eat the ${def.name.toLowerCase()}.`;
    }
    return `You turn the ${def.name.toLowerCase()} over in your hands.`;
  }
  dropFromPack(type: ItemType) {
    if (!this.takeFromPack(type)) return;
    const p = this.player;
    const it = this.spawnItem(type, p.x + Math.sin(p.facing) * 0.8, p.z + Math.cos(p.facing) * 0.8, 1.0);
    it.spaceId = p.spaceId;
    it.sleeping = false;
    const reserved = this.radiantQuests().filter(([, q]) => q.status === 'active' && q.data?.kind === 'retrieve'
      && q.data.recovered && q.data.itemType === type);
    if ((this.pack[type] ?? 0) < reserved.length && reserved[0]) {
      const [id, quest] = reserved[0];
      const data = quest.data;
      if (data?.kind === 'retrieve') {
        data.recovered = false;
        data.itemActorId = it.id;
        data.aliases.itemActorId = it.id;
        it.questFor = id;
        if (quest.stage === 'report') this.setStage(id, 'recover');
      }
    }
  }

  // ---------------------------------------------------------------- crime
  private witnesses(at: Point, exclude?: string) {
    const sneaking = this.player.sneaking;
    return this.actors.filter((n) => {
      if (n.kind !== 'villager' || !n.alive || !sameSpace(n, this.player) || n.id === exclude || n.activity === 'Sleeping') return false;
      return canSee(n, at, sneaking ? 6 : 13, this.hour(), this.player.skills?.stealth ?? 0, !!sneaking);
    });
  }
  private commitCrime(kind: 'theft' | 'assault' | 'murder', value: number, victim?: Actor) {
    const seen = this.witnesses(this.player, undefined);
    if (victim && victim.kind === 'villager' && victim.alive && !seen.includes(victim)) seen.push(victim);
    if (!seen.length) return false;
    this.bounty += kind === 'theft' ? value * 2 + 5 : kind === 'murder' ? 100 : 25;
    this.standing = Math.max(-100, this.standing - (kind === 'murder' ? 20 : 4));
    for (const w of seen) {
      w.memory!.witnessedCrime++;
      w.memory!.alarmUntil = this.elapsed + (kind === 'murder' ? 90 : kind === 'assault' ? 45 : 20);
      w.memory!.threatId = this.player.id;
      this.adjustOpinion(w, kind === 'murder' ? -55 : kind === 'assault' ? -25 : -12);
      this.addRumor(w, kind === 'murder' && victim ? `murder:${victim.name}` : 'crime');
    }
    if (kind !== 'murder') this.recordDeed(kind, victim, seen);
    const shout = seen.find((w) => w.profession !== 'Warden') ?? seen[0];
    this.say(kind === 'theft' ? 'Thief! Somebody fetch the wardens!' : kind === 'murder' ? 'Murder! Wardens!' : 'Help! Wardens!', shout.name, 3);
    return true;
  }

  private locationAt(point: Point) {
    let best = WORLD_LOCATIONS[0], bd = Infinity;
    for (const place of WORLD_LOCATIONS) {
      const d = distance(place.point, point);
      if (d < bd) { bd = d; best = place; }
    }
    return best;
  }

  /** Persistent world memory of what the guardian did, where, and who saw it. */
  recordDeed(kind: DeedKind, victim: Actor | undefined, witnessesSeen: Actor[], reaction?: Deed['reaction']) {
    const existing = victim ? [...this.deeds].reverse().find((d) => d.kind === kind && d.victimId === victim.id && this.elapsed - d.at < 1) : undefined;
    if (existing) {
      if (reaction) existing.reaction = reaction;
      return existing;
    }
    const place = this.locationAt(this.player);
    const deed: Deed = {
      id: `deed${this.nextId++}`, kind, at: this.elapsed,
      locationId: place.id, locationName: place.name,
      victimId: victim?.id, victimName: victim?.name,
      witnessIds: witnessesSeen.filter((a) => a.alive && a.id !== PLAYER_ID).map((a) => a.id),
      reaction,
    };
    this.deeds.push(deed);
    for (const w of this.deeds.length > 20 ? witnessesSeen.slice(-2) : witnessesSeen) {
      if (w.kind === 'villager' && w.memory) this.addRumor(w, `${kind}:${deed.locationName}`);
    }
    return deed;
  }

  houseFor(n: Actor) {
    if (n.houseId) return this.byId(n.houseId);
    return this.actors.find((a) => a.kind === 'house' && !!n.home && distance(a, n.home) < 4);
  }

  residentsOf(house: Actor) {
    return (house.residents ?? []).map((id) => this.byId(id)).filter((a): a is Actor => !!a && a.alive);
  }

  houseOwner(house: Actor) {
    const residents = this.residentsOf(house);
    return residents.find((a) => !!a.home && distance(a.home!, house) < 4.5) ?? residents[0];
  }

  /** Doors are barred while the household's night package is active. */
  houseLocked(house: Actor) {
    if (house.kind !== 'house') return false;
    const residents = this.residentsOf(house);
    if (!residents.length) return false;
    const hour = this.hour();
    return residents.some((n) => {
      const r = n.routine;
      return !!r && (hour >= r.bedtime - 0.25 || hour < r.wake + 0.25);
    });
  }

  activePackageFor(n: Actor, hour = this.hour()) {
    const pkg = activePackage(n.packages, hour);
    n.activePackage = pkg?.id;
    return pkg;
  }

  /**
   * The guardian cannot enter a private home. At night the attempt is a break-in:
   * sleeping residents wake, arm themselves with a warning, and make the intruder leave.
   */
  attemptHouseEntry(house: Actor) {
    if (house.kind !== 'house') return false;
    const residents = this.residentsOf(house);
    const owner = this.houseOwner(house);
    if (!owner) { this.say('The door is locked. No one seems to live here.'); return false; }
    if (!this.houseLocked(house)) {
      if ((owner.memory?.opinion ?? 0) >= 40) return this.enterInterior(house);
      this.say(`${owner.name}'s door is unbarred, though propriety keeps you on the step.`);
      return false;
    }
    const homeSleepers = residents.filter((n) => distance(n, n.home ?? house) < 4.5 && (n.activity === 'Sleeping' || (n.utility?.kind === 'sleep' && distance(n, n.home ?? house) < 3)));
    if (!homeSleepers.length) {
      this.say('The door is barred. No one answers.');
      return false;
    }
    const witnessesSeen = this.witnesses(house, undefined);
    const deed = this.recordDeed('trespass', undefined, witnessesSeen, 'alarm');
    if (!deed.witnessIds.length) deed.reaction = 'alarm';
    this.bounty += 5;
    for (const n of homeSleepers) {
      if (n.sittingOn) this.releaseSeat(n);
      this.endConversation(n);
      n.memory!.alarmUntil = this.elapsed + 80;
      n.memory!.threatId = PLAYER_ID;
      n.homeDefenseUntil = this.elapsed + 24;
      n.activity = 'Confronting';
      n.lookAt = PLAYER_ID;
      n.utility = { kind: 'confront', targetId: PLAYER_ID, until: this.elapsed + 24, score: 2.4 };
      n.decideIn = 0;
      this.adjustOpinion(n, -30);
      this.addRumor(n, 'trespass');
      n.doorLocked = true;
    }
    this.say(this.homeDefenseLine(owner), owner.name, 5);
    this.noise(house, 13);
    return true;
  }

  private homeDefenseLine(owner: Actor) {
    const responsibility = owner.desires?.responsibility ?? 0.5;
    const aggression = owner.desires?.aggression ?? 0.4;
    if (aggression > 0.72) return 'Get out of my house before I put you out myself!';
    if (responsibility > 0.66) return 'Out! The wardens will hear of this!';
    return 'What in the light are you doing in my home? Get out!';
  }

  private recordVendetta(victim: Actor, relatives: Actor[]) {
    const familyId = victim.familyId ?? `house-${victim.houseId ?? victim.id}`;
    const contractor = relatives[0];
    const point = DUNGEON_SITES.find((site) => !this.visitedLocations.includes(site.id))?.point ?? { x: 55, z: -35 };
    const vendetta: Vendetta = {
      id: `vendetta${this.nextId++}`, familyId, victimId: victim.id, victimName: victim.name,
      contractorId: contractor?.id, createdAt: this.elapsed, ambushAt: this.elapsed + 18,
      point: { x: point.x + 7, z: point.z + 7 }, count: 2, triggered: false, resolved: false,
    };
    this.vendettas.push(vendetta);
    return vendetta;
  }

  private updateVendettas() {
    const p = this.player;
    const inWilderness = Math.hypot(p.x, p.z) > 32;
    for (const vendetta of this.vendettas) {
      if (vendetta.triggered || vendetta.resolved || this.elapsed < vendetta.ambushAt || !inWilderness) continue;
      const contractor = vendetta.contractorId ? this.byId(vendetta.contractorId) : undefined;
      if (!contractor?.alive) { vendetta.resolved = true; continue; }
      vendetta.triggered = true;
      for (let i = 0; i < vendetta.count; i++) {
        const angle = (i / Math.max(1, vendetta.count)) * Math.PI * 2;
        const hunter = this.spawnFoe('stalker', p.x + Math.cos(angle) * 7, p.z + Math.sin(angle) * 7);
        hunter.name = 'Hired blade';
        hunter.intent = 'chase';
        hunter.targetId = PLAYER_ID;
        hunter.vendettaFor = vendetta.victimId;
        hunter.lastKnown = { x: p.x, z: p.z };
        hunter.lostFor = 0;
      }
      const deed = [...this.deeds].reverse().find((d) => d.kind === 'murder' && d.victimId === vendetta.victimId);
      if (deed) deed.reaction = 'vendetta';
      this.say('Hired steel steps out of the trees. The family has not forgotten.', undefined, 5);
    }
  }

  // ---------------------------------------------------------------- update
  update(dtIn: number) {
    const dt = clamp(dtIn, 0, 0.05);
    this.elapsed += dt;
    this.streamer.reconcile(this.actors);
    if (this.streamer.update(this.player, this.uGridsToLoad, this.uExteriorCellBuffer,
      { x: this.player.vx || this.input.x, z: this.player.vz || this.input.z })) this.staticDirty = true;
    if (this.staticDirty) {
      this.solidGrid.clear();
      for (const a of this.streamer.loadedActors()) if (a.alive && a.solid && STATIC_KINDS.has(a.kind)) this.solidGrid.insert(a);
      this.staticDirty = false;
    }
    this.itemGrid.clear();
    this.chars.length = 0;
    for (const a of this.actors) {
      if (!a.alive) continue;
      if (a.kind === 'item' && !a.carriedBy && this.isActorLoaded(a)) this.itemGrid.insert(a);
      else if (a.kind === 'player' || a.kind === 'villager' || a.kind === 'foe') this.chars.push(a);
    }

    this.updatePlayer(dt);
    const pp = this.player;
    for (const a of this.actors) {
      if (!a.alive) continue;
      // Tiered simulation: nearby minds run every tick, distant ones think and move in longer strides.
      if (a.kind === 'villager' || a.kind === 'foe') {
        const d2 = (a.x - pp.x) ** 2 + (a.z - pp.z) ** 2;
        a.far = !this.isActorLoaded(a);
        a.acc = (a.acc ?? 0) + dt;
        const step = a.far ? 0.25 : d2 > 30 * 30 ? 0.12 : 0;
        if (step > 0 && a.acc < step) continue;
        const useDt = a.acc;
        a.acc = 0;
        if (a.kind === 'villager') this.updateVillager(a, useDt); else this.updateFoe(a, useDt);
        continue;
      }
      if (a.kind === 'tower') this.updateTower(a, dt);
      else if (a.kind === 'item') this.updateItem(a, dt);
    }
    this.separateCharacters();

    if (this.waveActive && this.spawnQueue > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = 1.3;
        const kinds: FoeKind[] = ['slime', 'slime', 'brute', 'stalker', 'wisp'];
        const camp = this.camp;
        this.spawnFoe(kinds[(this.wave + this.spawnQueue) % kinds.length], camp.x + (this.rng() - 0.5) * 4, camp.z - 3.5, true);
        this.spawnQueue--;
      }
    }
    if (this.waveActive && this.spawnQueue === 0 && !this.actors.some((a) => a.alive && a.kind === 'foe' && a.intent === 'raid')) {
      this.waveActive = false;
      this.waveCleared = this.wave;
      this.stock.gold += 30 + this.wave * 5;
      this.say('That is the last of them. The Citadel stands.', 'Alden', 4);
    }
    this.campTimer += dt;
    if (this.campTimer >= 5) { this.campTimer = 0; this.updateCamps(); }
    this.questTimer += dt;
    if (this.questTimer >= 0.5) { this.questTimer = 0; this.updateWorldHistory(); this.updateQuests(); this.updateVendettas(); }
    this.tacticTimer += dt;
    if (this.tacticTimer >= 0.4) { this.tacticTimer = 0; this.coordinateThreats(); }
    this.confrontCooldown = Math.max(0, this.confrontCooldown - dt);
    if (this.subtitle && this.subtitle.until < this.elapsed) this.subtitle = null;
  }

  // ---------------------------------------------------------------- movement & physics
  private moveCharacter(a: Actor, dx: number, dz: number) {
    if (!dx && !dz) return;
    const limit = spaceOf(a) === EXTERIOR_SPACE ? WORLD_LIMIT : 6.3;
    if (a.far && a.kind !== 'player') {
      a.x = clamp(a.x + dx, -limit + a.radius, limit - a.radius);
      a.z = clamp(a.z + dz, -limit + a.radius, limit - a.radius);
      return;
    }
    let nx = clamp(a.x + dx, -limit + a.radius, limit - a.radius);
    let nz = clamp(a.z + dz, -limit + a.radius, limit - a.radius);
    const near = this.solidGrid.query(nx, nz, a.radius + 4, this.qa);
    for (const o of near) {
      if (!o.alive || !o.solid || a.y > o.height - 0.05) continue;
      const ox = nx - o.x, oz = nz - o.z;
      const d = Math.hypot(ox, oz), min = a.radius + o.radius;
      if (d < min) {
        if (d < 1e-4) { nx += min; continue; }
        nx = o.x + (ox / d) * min;
        nz = o.z + (oz / d) * min;
      }
    }
    a.x = nx;
    a.z = nz;
    // Walking into loose objects shoves them; heavy ones shove back.
    const items = this.itemGrid.query(a.x, a.z, a.radius + 0.8, this.qb);
    for (const it of items) {
      if (!it.alive || it.carriedBy || it.y > a.y + 1.1) continue;
      if (it.seatTakenBy) continue;
      const ox = it.x - a.x, oz = it.z - a.z;
      const d = Math.hypot(ox, oz), min = a.radius + it.radius;
      if (d >= min || d < 1e-4) continue;
      const mass = ITEMS[it.itemType!].mass;
      const share = mass > 3 ? 0.45 : 1;
      const push = min - d;
      it.x += (ox / d) * push * share;
      it.z += (oz / d) * push * share;
      a.x -= (ox / d) * push * (1 - share);
      a.z -= (oz / d) * push * (1 - share);
      const kick = Math.min(4, Math.hypot(a.vx, a.vz)) / Math.max(1, mass * 0.6);
      it.vx += (ox / d) * kick;
      it.vz += (oz / d) * kick;
      it.sleeping = false;
    }
  }

  private surfaceAt(x: number, z: number) {
    let h = 0;
    for (const o of this.solidGrid.query(x, z, 2, this.qc)) {
      if (o.surface !== undefined && o.alive && Math.hypot(x - o.x, z - o.z) < o.radius * 0.95) h = Math.max(h, o.surface);
    }
    return h;
  }

  private updateItem(it: Actor, dt: number) {
    const def = ITEMS[it.itemType!];
    if (it.carriedBy) {
      const c = this.byId(it.carriedBy);
      if (!c || !c.alive || c.hp <= 0) { it.carriedBy = undefined; it.sleeping = false; return; }
      it.spaceId = c.spaceId;
      const reach = c.radius + def.radius * 0.7 + 0.1;
      it.x = c.x + Math.sin(c.facing) * reach;
      it.z = c.z + Math.cos(c.facing) * reach;
      it.y = c.y + 0.95 - def.height * 0.35;
      it.vx = c.vx; it.vz = c.vz; it.vy = 0;
      it.facing = c.facing;
      return;
    }
    if (it.sleeping) return;
    // Unloaded references keep their exact state until their cell is simulated again.
    if (!this.isActorLoaded(it)) return;
    it.vy -= 20 * dt;
    it.x += it.vx * dt;
    it.z += it.vz * dt;
    it.y += it.vy * dt;
    const ground = this.surfaceAt(it.x, it.z);
    let onGround = false;
    if (it.y <= ground) {
      it.y = ground;
      if (it.vy < -3) { it.vy = -it.vy * 0.28; it.vx *= 0.7; it.vz *= 0.7; }
      else { it.vy = 0; onGround = true; }
    }
    const friction = onGround ? Math.exp(-dt * 7) : Math.exp(-dt * 0.15);
    it.vx *= friction;
    it.vz *= friction;
    if (!onGround) it.facing += dt * 5;
    const limit = spaceOf(it) === EXTERIOR_SPACE ? WORLD_LIMIT : 6.3;
    it.x = clamp(it.x, -limit + 0.5, limit - 0.5);
    it.z = clamp(it.z, -limit + 0.5, limit - 0.5);

    for (const o of this.solidGrid.query(it.x, it.z, it.radius + 4, this.qa)) {
      if (!o.alive || !o.solid || it.y >= o.height - 0.02) continue;
      const ox = it.x - o.x, oz = it.z - o.z;
      const d = Math.hypot(ox, oz), min = it.radius + o.radius;
      if (d >= min || d < 1e-4) continue;
      const nx = ox / d, nz = oz / d;
      it.x = o.x + nx * min;
      it.z = o.z + nz * min;
      const vn = it.vx * nx + it.vz * nz;
      if (vn < 0) { it.vx -= 1.45 * vn * nx; it.vz -= 1.45 * vn * nz; }
    }
    for (const o of this.itemGrid.query(it.x, it.z, it.radius + 0.6, this.qb)) {
      if (o === it || o.carriedBy || Math.abs(o.y - it.y) > 0.5) continue;
      const ox = it.x - o.x, oz = it.z - o.z;
      const d = Math.hypot(ox, oz), min = it.radius + o.radius;
      if (d >= min || d < 1e-4) continue;
      const nx = ox / d, nz = oz / d, push = (min - d) * 0.5;
      it.x += nx * push; it.z += nz * push;
      const speed = Math.hypot(it.vx, it.vz);
      if (speed > 0.8) {
        const ratio = def.mass / (def.mass + ITEMS[o.itemType!].mass);
        o.vx -= nx * speed * ratio; o.vz -= nz * speed * ratio;
        it.vx *= 1 - ratio; it.vz *= 1 - ratio;
        o.sleeping = false;
      }
    }
    const speed = Math.hypot(it.vx, it.vz);
    if (speed > 4 && it.y < 1.9) {
      for (const c of this.chars) {
        if (!sameSpace(c, it)) continue;
        if (c.id === it.thrownBy && this.elapsed - (it.thrownAt ?? 0) < 0.45) continue;
        if (Math.hypot(c.x - it.x, c.z - it.z) > c.radius + it.radius) continue;
        const dmg = Math.round(def.mass * speed * 0.8 + 4);
        this.hurt(c, dmg, it.thrownBy);
        c.vx += it.vx * 0.4; c.vz += it.vz * 0.4;
        it.vx *= -0.3; it.vz *= -0.3;
        if (c.kind === 'foe') this.alertFoe(c, this.player);
        break;
      }
    }
    if (onGround && speed < 0.06) {
      it.restTimer = (it.restTimer ?? 0) + dt;
      if (it.restTimer > 0.35) { it.sleeping = true; it.vx = it.vy = it.vz = 0; it.restTimer = 0; }
    } else it.restTimer = 0;
  }

  private separateCharacters() {
    const cs = this.chars;
    for (let i = 0; i < cs.length; i++) {
      const a = cs[i];
      for (let j = i + 1; j < cs.length; j++) {
        const b = cs[j];
        if (!sameSpace(a, b)) continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        if (Math.abs(dx) > 2 || Math.abs(dz) > 2) continue;
        const d = Math.hypot(dx, dz), min = a.radius + b.radius;
        if (d >= min || d < 1e-4 || a.hp <= 0 || b.hp <= 0) continue;
        const push = (min - d) * 0.5, nx = dx / d, nz = dz / d;
        a.x -= nx * push; a.z -= nz * push;
        b.x += nx * push; b.z += nz * push;
      }
    }
  }

  private turnToward(a: Actor, target: number, rate: number, dt: number) {
    a.facing += clamp(angleDelta(a.facing, target), -rate * dt, rate * dt);
  }

  private steer(a: Actor, target: Point, speed: number, dt: number, stop = 0.4) {
    const dx = target.x - a.x, dz = target.z - a.z;
    const d = Math.hypot(dx, dz);
    let tx = 0, tz = 0;
    if (d > stop) {
      let sx = dx, sz = dz;
      const targetId = a.kind === 'player' ? this.targetId
        : a.utility?.targetId ?? a.talkingTo ?? a.quarryId ?? a.targetId
          ?? (a.followingPlayer || (a.kind === 'foe' && (a.intent === 'chase' || a.intent === 'raid')) ? PLAYER_ID : undefined);
      for (const other of this.chars) {
        if (other === a || !sameSpace(a, other) || !other.alive || other.hp <= 0 || other.id === targetId || other.activity === 'Sleeping') continue;
        const ax = a.x - other.x, az = a.z - other.z;
        const separation = Math.hypot(ax, az), clearance = a.radius + other.radius + 0.55;
        if (separation > 1e-4 && separation < clearance) {
          const strength = (clearance - separation) / clearance * 1.6;
          sx += ax / separation * strength;
          sz += az / separation * strength;
        }
      }
      const ang = Math.atan2(sx, sz) + ((a.detourT ?? 0) > 0 ? a.detour ?? 0 : 0);
      const s = Math.min(speed * this.agilityScale(a), (d - stop) * 3 + 0.4);
      tx = Math.sin(ang) * s;
      tz = Math.cos(ang) * s;
      this.turnToward(a, ang, 7, dt);
    }
    const k = 1 - Math.exp(-dt * 8);
    a.vx += (tx - a.vx) * k;
    a.vz += (tz - a.vz) * k;
    const bx = a.x, bz = a.z;
    this.moveCharacter(a, a.vx * dt, a.vz * dt);
    if (d > stop && Math.hypot(a.x - bx, a.z - bz) < speed * dt * 0.25) {
      a.stuck = (a.stuck ?? 0) + dt;
      if (a.stuck > 0.4) { a.detour = (this.rng() < 0.5 ? 1 : -1) * 1.25; a.detourT = 1.1; a.stuck = 0; }
    } else a.stuck = 0;
    if (a.detourT) a.detourT = Math.max(0, a.detourT - dt);
    return d;
  }

  private stopMoving(a: Actor, dt: number) {
    const k = 1 - Math.exp(-dt * 10);
    a.vx -= a.vx * k;
    a.vz -= a.vz * k;
    if (Math.abs(a.vx) + Math.abs(a.vz) > 0.02) this.moveCharacter(a, a.vx * dt, a.vz * dt);
  }

  private startAction(a: Actor, kind: ActionKind, dur: number) {
    a.action = kind; a.actionT = 0; a.actionDur = dur; a.actionHit = false;
  }

  private regenerateFocus(actor: Actor, dt: number) {
    actor.focus = Math.min(actor.maxFocus ?? 0, (actor.focus ?? 0) + dt * (2 + (actor.attrs?.will ?? 6) * 0.2));
  }

  private agilityScale(actor: Actor) {
    return 0.88 + clamp(actor.attrs?.agility ?? 6, 0, 12) * 0.02;
  }

  // ---------------------------------------------------------------- the guardian
  private updatePlayer(dt: number) {
    const p = this.player;
    this.staminaDelay -= dt;
    if (this.staminaDelay <= 0) this.stamina = Math.min(this.maxStamina, this.stamina + 24 * dt);
    this.regenerateFocus(p, dt);
    if (p.hp <= 0) { this.stopMoving(p, dt); return; }
    if (p.sittingOn) {
      const seat = this.byId(p.sittingOn);
      const wantMove = Math.hypot(this.input.x, this.input.z) > 0.15;
      if (!seat || !seat.alive || seat.carriedBy || wantMove) {
        if (seat && seat.seatTakenBy === PLAYER_ID) seat.seatTakenBy = undefined;
        p.sittingOn = undefined;
      } else {
        p.x = seat.x; p.z = seat.z; p.vx = 0; p.vz = 0;
        this.stamina = Math.min(this.maxStamina, this.stamina + 30 * dt);
        return;
      }
    }
    if (p.action) {
      p.actionT! += dt;
      this.resolvePlayerAction(p);
      if (p.actionT! >= p.actionDur!) this.finishAction(p);
    }
    const held = this.held();
    const locked = p.action === 'gather' || p.action === 'pickup' || p.action === 'hurt' || p.action === 'land';
    const attacking = !!p.action && p.action.startsWith('attack');
    let ix = this.dialogue ? 0 : this.input.x, iz = this.dialogue ? 0 : this.input.z;
    const len = Math.hypot(ix, iz);
    if (len > 1) { ix /= len; iz /= len; }
    let tx = 0, tz = 0;
    if (p.action === 'roll') {
      tx = Math.sin(p.facing) * 8.5 * this.agilityScale(p);
      tz = Math.cos(p.facing) * 8.5 * this.agilityScale(p);
    } else if (!locked) {
      const mass = held ? ITEMS[held.itemType!].mass : 0;
      const sprint = this.input.sprint && len > 0.1 && this.stamina > 1 && mass < 3 && !attacking && !p.sneaking;
      const speed = (attacking ? 1.2 : mass >= 3 ? 2.8 : held ? 3.8 : sprint ? 7.4 : 4.3) * this.agilityScale(p) * (p.sneaking ? 0.55 : 1);
      if (sprint) { this.stamina -= 15 * dt; this.staminaDelay = 0.7; }
      tx = ix * speed;
      tz = iz * speed;
      if (len > 0.1 && !attacking) this.turnToward(p, Math.atan2(ix, iz), 11, dt);
    }
    const k = 1 - Math.exp(-dt * (p.y > 0.05 ? 2.5 : 11));
    p.vx += (tx - p.vx) * k;
    p.vz += (tz - p.vz) * k;
    this.moveCharacter(p, p.vx * dt, p.vz * dt);
    if (p.y > 0 || p.vy > 0) {
      p.vy -= 22 * dt;
      p.y += p.vy * dt;
      if (p.y <= 0) {
        if (p.vy < -17) this.hurt(p, Math.round((-p.vy - 15) * 4));
        if (p.vy < -10 && !p.action) this.startAction(p, 'land', 0.22);
        p.y = 0; p.vy = 0;
      }
    }
  }

  private resolvePlayerAction(p: Actor) {
    if (p.actionHit) return;
    const t = p.actionT!;
    if ((p.action === 'attack1' || p.action === 'attack2') && t >= 0.2) { p.actionHit = true; this.playerStrike(p.action === 'attack1' ? 1 : 2); }
    else if (p.action === 'attack3' && t >= 0.4) { p.actionHit = true; this.playerStrike(3); }
    else if (p.action === 'gather' && t >= 0.75) { p.actionHit = true; this.completeGather(p); }
  }

  private finishAction(p: Actor) {
    const was = p.action;
    p.action = undefined;
    if (this.queuedAttack && (was === 'attack1' || was === 'attack2')) {
      this.queuedAttack = false;
      if (this.stamina >= 6) {
        this.stamina -= 12; this.staminaDelay = 0.8;
        this.startAction(p, was === 'attack1' ? 'attack2' : 'attack3', was === 'attack1' ? 0.48 : 0.72);
      }
    }
    this.queuedAttack = false;
  }

  jump() {
    const p = this.player;
    if (p.hp <= 0 || this.dialogue || p.y > 0.01 || (p.action && p.action !== 'land') || this.stamina < 8) return;
    if (this.held() && ITEMS[this.held()!.itemType!].mass >= 3) return;
    p.vy = 7.2;
    p.y = 0.001;
    this.stamina -= 10;
    this.staminaDelay = 0.6;
  }

  dodge() {
    const p = this.player;
    if (p.hp <= 0 || this.dialogue || p.y > 0.05 || this.stamina < 15 || this.held()) return;
    if (p.action && p.action !== 'attack1' && p.action !== 'attack2' && p.action !== 'attack3' && p.action !== 'land') return;
    const len = Math.hypot(this.input.x, this.input.z);
    if (len > 0.1) p.facing = Math.atan2(this.input.x, this.input.z);
    this.stamina -= 20;
    this.staminaDelay = 0.9;
    this.queuedAttack = false;
    this.startAction(p, 'roll', 0.55);
    this.invulnUntil = this.elapsed + 0.42;
  }

  attack() {
    const p = this.player;
    if (p.hp <= 0 || this.dialogue) return;
    if (this.held()) { this.throwHeld(); return; }
    if (p.action === 'attack1' || p.action === 'attack2') { this.queuedAttack = true; return; }
    if (p.action || this.stamina < 6) return;
    this.stamina -= 12;
    this.staminaDelay = 0.8;
    this.startAction(p, 'attack1', 0.48);
  }

  private playerStrike(step: number) {
    const p = this.player;
    const dmg = (this.meleeDamage(p) + 6 + (this.level - 1) * 3) * [1, 1.15, 1.7][step - 1];
    const range = step === 3 ? 2.7 : 2.4;
    let hitAny = false;
    for (const a of this.actors) {
      if (!a.alive || !sameSpace(a, p) || a.id === PLAYER_ID || a.carriedBy) continue;
      const hittable = a.kind === 'foe' || a.kind === 'villager' || a.kind === 'item' || (a.faction === 'wild' && (a.kind === 'tower' || a.kind === 'camp'));
      if (!hittable) continue;
      const d = distance(a, p) - a.radius;
      if (d > range || Math.abs(a.y - p.y) > 1.6) continue;
      if (d > 0.5 && Math.abs(angleDelta(p.facing, angleTo(p, a))) > 1.1) continue;
      const nx = Math.sin(angleTo(p, a)), nz = Math.cos(angleTo(p, a));
      if (a.kind === 'item') {
        const mass = ITEMS[a.itemType!].mass;
        a.vx += (nx * 7) / Math.max(1, mass);
        a.vz += (nz * 7) / Math.max(1, mass);
        a.vy = 3 / Math.max(1, mass * 0.5);
        a.y = Math.max(a.y, 0.05);
        a.sleeping = false;
        continue;
      }
      hitAny = true;
      if (a.kind === 'foe') this.skillXp('blade', 2);
      this.hurt(a, dmg, PLAYER_ID);
      a.vx += nx * (step === 3 ? 6 : 3);
      a.vz += nz * (step === 3 ? 6 : 3);
      if (a.kind === 'foe') this.alertFoe(a, p);
    }
    if (hitAny) this.combatUntil = this.elapsed + 6;
  }

  canNpcDamagePlayer(attacker: Actor) {
    if (attacker.kind !== 'villager' || !attacker.alive || !brainFor(attacker)?.attack) return false;
    const resisting = attacker.profession === 'Warden' && attacker.activity === 'Fighting' && this.hostileUntil > this.elapsed;
    return resisting || (canRetaliate(attacker, this.player, this.elapsed)
      && (attacker.memory?.alarmUntil ?? 0) > this.elapsed);
  }

  private canNpcFight(attacker: Actor, target: Actor) {
    return attacker.kind === 'villager' && !!brainFor(attacker)?.attack
      && (target.kind === 'foe' || (target.kind === 'player' && this.canNpcDamagePlayer(attacker)));
  }

  hurt(target: Actor, damage: number, source?: string) {
    if (!target.alive || target.hp <= 0) return;
    const attacker = source ? this.byId(source) : undefined;
    if (target.kind === 'player' && attacker?.kind === 'villager' && !this.canNpcDamagePlayer(attacker)) return;
    if (target.kind === 'player' && this.elapsed < this.invulnUntil) return;
    damage *= 1 - Math.min(0.45, (target.armor ?? 0) + (target.skills?.guard ?? 0) * 0.002);
    if (source && (target.kind === 'player' || target.kind === 'villager' || target.kind === 'foe')) {
      this.trainSkill(target, 'guard', target.kind === 'player' ? 1.5 : 0.8);
    }
    target.hp = Math.max(0, target.hp - damage);
    if (attacker?.kind === 'foe' && (target.kind === 'player' || target.kind === 'villager')) this.signalThreat(target, attacker);
    if (target.kind === 'player') {
      this.combatUntil = this.elapsed + 6;
      if (target.action !== 'roll') { this.startAction(target, 'hurt', 0.28); this.queuedAttack = false; }
      if (target.hp <= 0) {
        target.action = undefined;
        const held = this.held();
        if (held) { held.carriedBy = undefined; held.sleeping = false; }
      }
      return;
    }
    if (source === PLAYER_ID && (target.kind === 'foe' || target.kind === 'villager' || target.kind === 'tower' || target.kind === 'camp')) {
      this.targetId = target.id;
      this.targetUntil = this.elapsed + 4;
    }
    if (target.kind === 'villager') {
      if (target.hp > 0) {
        this.startAction(target, 'hurt', 0.3);
        if (target.memory) { target.memory.alarmUntil = this.elapsed + 30; target.memory.threatId = source; }
        if (attacker?.kind === 'player' || attacker?.kind === 'foe') target.retaliationUntil = this.elapsed + 12;
        if (source === PLAYER_ID && this.hostileUntil < this.elapsed) this.commitCrime('assault', 0, target);
        return;
      }
      this.releaseSeat(target);
      this.endConversation(target);
      target.alive = false;
      target.solid = false;
      target.activity = 'Dead';
      if (target.capturedFor) this.failRadiantQuest(target.capturedFor, `${target.name} did not survive.`);
      target.capturedFor = undefined;
      target.followingPlayer = false;
      if (source === PLAYER_ID) {
        this.onVillagerDeath(target);
        if (this.hostileUntil < this.elapsed) this.commitCrime('murder', 0, target);
      }
      return;
    }
    if (target.kind === 'foe') {
      if (target.action === 'windup') target.attackCooldown = 0.6;
      this.startAction(target, 'hurt', 0.3);
    }
    if (target.hp > 0) return;
    if (target.kind === 'citadel') { this.say('The Citadel light gutters and goes dark.'); return; }
    target.alive = false;
    target.solid = false;
    if (STATIC_KINDS.has(target.kind)) { this.staticDirty = true; this.renderRevision++; }
    if (target.kind === 'foe' && target.foeKind) {
      const quest = target.questFor ? this.quests[target.questFor] : undefined;
      if (quest?.status === 'active' && quest.data?.kind === 'hunt' && quest.data.enemyId === target.id) {
        quest.data.defeated = true;
        if (quest.stage !== 'report') this.setStage(target.questFor!, 'report');
      }
      this.stock.gold += FOES[target.foeKind].bounty;
      this.awardExperience(15);
      if (this.rng() < 0.35) { const h = this.spawnItem('herb', target.x, target.z, 0.6); h.sleeping = false; }
      if ((target.carriedWood ?? 0) > 0) { const l = this.spawnItem('log', target.x + 0.4, target.z, 0.6); l.sleeping = false; }
      if (target.vendettaFor) { const writ = this.spawnItem('mercenaryWrit', target.x, target.z, 0.4); writ.sleeping = false; }
    } else if (target.kind === 'camp' && target.faction === 'wild') {
      this.say('The camp burns. The wilds will remember this.');
      this.awardExperience(60);
    }
  }

  private onVillagerDeath(victim: Actor) {
    const blood = this.actors.filter((a) => a.alive && a.kind === 'villager' && a.id !== victim.id
      && !!victim.familyId && a.familyId === victim.familyId);
    const relatives = blood.length ? blood : this.actors.filter((a) => a.alive && a.kind === 'villager' && a.id !== victim.id
      && !!victim.houseId && a.houseId === victim.houseId);
    const deed = this.recordDeed('murder', victim, this.witnesses(this.player, undefined), relatives.length ? 'estate' : 'alarm');
    if (!relatives.length) {
      this.stock.gold += Math.max(0, Math.floor((victim.crowns ?? 0) * 0.5));
      victim.crowns = 0;
      victim.items = {};
      return;
    }
    const kin = relatives[0];
    // The estate, not merely the grudge, passes to the next of kin.
    const crowns = victim.crowns ?? 0;
    const items = { ...(victim.items ?? {}) };
    victim.crowns = 0;
    victim.items = {};
    kin.crowns = (kin.crowns ?? 0) + crowns;
    for (const [type, count] of Object.entries(items) as [ItemType, number][]) this.give(kin, type, count);
    deed.inheritedBy = kin.id;
    deed.inheritedCrowns = crowns;
    deed.reaction = 'vendetta';
    this.recordVendetta(victim, relatives);
    for (const relative of relatives) {
      this.adjustOpinion(relative, -100);
      if (relative.memory) {
        relative.memory.alarmUntil = this.elapsed + 180;
        relative.memory.threatId = PLAYER_ID;
      }
      this.addRumor(relative, `murder:${victim.name}`);
    }
    // A first show of force at home; the delayed wilderness ambush follows from world state.
    for (let i = 0; i < 2; i++) {
      const hunter = this.spawnFoe('stalker', kin.x + (i ? 1 : -1) * 5, kin.z + 5 + i * 2);
      hunter.name = 'Hired blade';
      hunter.intent = 'chase';
      hunter.targetId = PLAYER_ID;
      hunter.vendettaFor = victim.id;
      hunter.lastKnown = { x: this.player.x, z: this.player.z };
      hunter.lostFor = 0;
    }
    this.say(`${kin.name} has inherited ${victim.name}'s affairs, and sworn the family will have its reckoning.`, kin.name, 5);
  }

  private planCombatOrder(actor: Actor, target: Actor): TacticalOrder {
    const order = actor.tactic;
    if (order && order.targetId === target.id && order.until > this.elapsed
      && (actor.hp >= actor.maxHp * 0.34 || order.action === 'withdraw')) return order;
    const allies = this.chars.filter((a) => a !== actor && sameSpace(a, actor) && a.alive && a.hp > 0 && a.faction === actor.faction
      && (a.kind === 'foe' || a.kind === 'villager') && !a.capturedFor
      && (a.x - actor.x) ** 2 + (a.z - actor.z) ** 2 < 14 * 14
      && (a.intent === 'chase' || a.intent === 'raid' || a.intent === 'search' || a.activity === 'Fighting' || a.utility?.kind === 'fight'));
    const wounded = this.chars.find((a) => a !== actor && a !== target && sameSpace(a, actor) && a.alive && a.hp > 0 && a.hp < a.maxHp * 0.72
      && a.faction === actor.faction && (a.x - actor.x) ** 2 + (a.z - actor.z) ** 2 < 9 * 9);
    actor.tactic = planTactic(actor, target, allies, wounded, this.elapsed);
    return actor.tactic;
  }

  private signalThreat(source: Actor, target: Actor) {
    const existing = this.threatSignals.find((s) => s.sourceId === source.id && s.targetId === target.id && s.until > this.elapsed);
    if (existing) { existing.point = { x: target.x, z: target.z }; existing.until = this.elapsed + 3; return; }
    this.threatSignals.push({ sourceId: source.id, targetId: target.id, faction: source.faction,
      point: { x: target.x, z: target.z }, until: this.elapsed + 3 });
    if (this.threatSignals.length > 24) this.threatSignals.shift();
  }

  /** Short-lived sightings let nearby allies respond without every mind scanning every actor. */
  private coordinateThreats() {
    this.threatSignals = this.threatSignals.filter((s) => s.until > this.elapsed && !!this.byId(s.targetId)?.alive);
    for (const signal of this.threatSignals) {
      const target = this.byId(signal.targetId);
      if (!target) continue;
      for (const ally of this.chars) {
        if (!ally.alive || !sameSpace(ally, target) || ally.hp <= 0 || ally.id === signal.sourceId || ally.faction !== signal.faction || ally.capturedFor) continue;
        if ((ally.x - signal.point.x) ** 2 + (ally.z - signal.point.z) ** 2 > 18 * 18) continue;
        if (ally.kind === 'foe' && ally.intent !== 'raid' && ally.intent !== 'chase' && ally.intent !== 'flee') {
          ally.intent = 'search'; ally.targetId = target.id; ally.lastKnown = { ...signal.point }; ally.lostFor = 0;
        } else if (ally.kind === 'villager' && target.kind === 'foe' && ally.memory) {
          ally.memory.threatId = target.id;
          ally.memory.alarmUntil = Math.max(ally.memory.alarmUntil, this.elapsed + 7);
          ally.decideIn = Math.min(ally.decideIn ?? 0, 0.1);
        }
      }
    }
  }

  private alertFoe(f: Actor, at: Actor) {
    f.intent = f.intent === 'flee' ? 'flee' : 'chase';
    f.lastKnown = { x: at.x, z: at.z };
    f.lostFor = 0;
    f.targetId = at.id;
    this.signalThreat(f, at);
    // Foes call to each other: anyone in earshot comes to look.
    for (const ally of this.chars) {
      if (ally.kind !== 'foe' || ally === f || !ally.alive || !sameSpace(ally, f)) continue;
      if (distance(ally, f) < 14 && ally.intent !== 'chase' && ally.intent !== 'flee') {
        ally.intent = 'search';
        ally.lastKnown = { x: at.x, z: at.z };
        ally.lostFor = 0;
      }
    }
  }

  held() {
    for (const a of this.actors) if (a.carriedBy === PLAYER_ID && a.alive) return a;
    return undefined;
  }

  // ---------------------------------------------------------------- interaction
  focus(): Actor | null {
    const p = this.player;
    let best: Actor | null = null, bestScore = Infinity;
    for (const a of this.actors) {
      if (!a.alive || !sameSpace(a, p) || a.id === PLAYER_ID || a.carriedBy || !INTERACTIVE.has(a.kind)) continue;
      if ((a.kind === 'camp' && a.faction !== 'citadel') || (a.kind === 'villager' && a.activity === 'Sleeping')) continue;
      const dx = a.x - p.x, dz = a.z - p.z;
      if (Math.abs(dx) > 5 || Math.abs(dz) > 5) continue;
      const d = Math.hypot(dx, dz) - a.radius;
      const reach = a.kind === 'item' ? 1.3 : 1.8;
      if (d > reach || (a.kind === 'item' && Math.abs(a.y - p.y) > 1.7)) continue;
      const ang = Math.abs(angleDelta(p.facing, Math.atan2(dx, dz)));
      if (ang > 1.35 && d > 0.45) continue;
      const score = d + ang * 0.8 + (a.kind === 'item' ? -0.15 : 0) + (STATIC_KINDS.has(a.kind) && a.kind !== 'tree' && a.kind !== 'ore' && a.kind !== 'rune' && a.kind !== 'echo' && a.kind !== 'bell' && a.kind !== 'note' ? 0.6 : 0);
      if (score < bestScore) { bestScore = score; best = a; }
    }
    return best;
  }

  private verb(a: Actor): Prompt {
    const name = a.kind === 'rune' || a.kind === 'echo' ? a.name : a.name;
    switch (a.kind) {
      case 'villager': return { name, primary: 'Talk', crime: false };
      case 'item': {
        const def = ITEMS[a.itemType!];
        if (a.itemType === 'stool') return { name, primary: this.player.sittingOn === a.id ? 'Stand' : 'Sit', secondary: 'Lift', crime: false };
        if (a.itemType === 'strongbox') return { name, primary: a.locked ? 'Pick the lock' : (a.loot?.length ? 'Open' : 'Examine'), crime: false };
        const owned = !!a.owner && a.owner !== 'player';
        const trusted = this.isTrustedHouseholdItem(a);
        return def.take ? { name, primary: owned && !trusted ? 'Steal' : 'Take', secondary: 'Lift', crime: owned && !trusted } : { name, primary: 'Lift', crime: false };
      }
      case 'tree': return { name, primary: 'Chop', crime: false };
      case 'ore': return { name, primary: 'Mine', crime: false };
      case 'rune': return { name, primary: 'Turn', secondary: 'Examine', crime: false };
      case 'echo': return { name, primary: 'Strike', crime: false };
      case 'note': return { name, primary: 'Read', crime: false };
      case 'bell': return { name, primary: this.waveActive ? 'Examine' : 'Ring', crime: false };
      case 'camp': return { name, primary: 'Rest', crime: false };
      case 'well': return { name, primary: 'Drink', crime: false };
      case 'dungeon': return { name, primary: 'Enter', crime: false };
      case 'house': {
        const locked = this.houseLocked(a);
        const welcome = !locked && (this.houseOwner(a)?.memory?.opinion ?? 0) >= 40;
        return { name, primary: locked ? 'Try the door' : welcome ? 'Enter' : 'Examine', secondary: locked ? 'Listen' : 'Look in', crime: locked };
      }
      case 'tavern': return { name, primary: 'Enter', secondary: 'Listen', crime: false };
      case 'portal': return { name, primary: 'Leave', crime: false };
      case 'counter': return { name, primary: 'Buy a drink', crime: false };
      default: return { name, primary: 'Examine', crime: false };
    }
  }

  private examineText(a: Actor) {
    if (a.kind === 'rune') return `The face shows the ${RUNE_NAMES[a.currentRune ?? 0]} sign. Cut low into the base: ${RUNE_NAMES[a.targetRune ?? 0]}.`;
    if (a.kind === 'villager') return `${a.name}. ${a.profession} of the village. ${a.persona ? impression(a) : ''}`.trim();
    if (a.kind === 'house') {
      const owner = this.houseOwner(a);
      const locked = this.houseLocked(a);
      return owner ? `${owner.name}'s home. ${locked ? 'The door is barred from the inside.' : 'The door is unbarred.'}` : STATIC_DESC.house!;
    }
    if (a.kind === 'tavern') return STATIC_DESC.tavern!;
    if (a.kind === 'item' && a.itemType === 'strongbox') return a.locked ? 'Iron bands and a good lock. Slim steel would sing in there.' : (a.loot?.length ? 'Unlocked. Something shifts inside.' : 'Empty but for dust.');
    if (a.kind === 'item') return ITEMS[a.itemType!].desc;
    if (a.kind === 'tower' && a.faction === 'wild') return 'Lashed timber and stolen stone. Crude, but it will hold.';
    return a.desc ?? a.name;
  }

  /** Primary action (E). Returns true when a conversation was opened. */
  interact(): boolean {
    const p = this.player;
    if (p.hp <= 0 || this.dialogue || (p.action && p.action !== 'land')) return false;
    if (this.placing) { this.confirmBuild(); return false; }
    const held = this.held();
    if (held) { this.release(held, false); return false; }
    const t = this.focus();
    if (!t) return false;
    p.facing = angleTo(p, t);
    switch (t.kind) {
      case 'villager': this.openDialogue(t); return true;
      case 'item':
        if (t.itemType === 'stool') { this.toggleSit(t); return false; }
        if (t.itemType === 'strongbox') { if (t.locked) this.attemptLockpick(t); else this.openBox(t); return false; }
        if (ITEMS[t.itemType!].take) this.takeItem(t); else this.grab(t);
        return false;
      case 'tree': case 'ore':
        p.gatherTarget = t.id;
        this.startAction(p, 'gather', 0.95);
        return false;
      case 'rune':
        t.currentRune = ((t.currentRune ?? 0) + 1) % RUNE_NAMES.length;
        t.struckAt = this.elapsed;
        return false;
      case 'echo': this.strikeEcho(t); return false;
      case 'note': this.say(t.text ?? '', undefined, 6); return false;
      case 'bell':
        if (this.waveActive) this.say(this.examineText(t));
        else this.startWave();
        return false;
      case 'dungeon':
        this.enterInterior(t);
        return false;
      case 'house':
        this.attemptHouseEntry(t);
        return false;
      case 'tavern':
        this.enterInterior(t);
        return false;
      case 'portal':
        this.leaveInterior();
        return false;
      case 'counter':
        if (this.stock.gold >= 2) {
          this.stock.gold -= 2;
          p.hp = Math.min(p.maxHp, p.hp + 8);
          this.say('You buy a cup of thin ale and listen to the room. The village is still talking.');
        } else this.say('The tavern keeper shakes an empty cup. Two crowns buys a drink.');
        return false;
      case 'camp':
        p.hp = p.maxHp;
        this.respawn = { x: t.x + t.radius + 1, z: t.z };
        this.say('You rest a while. You will wake here if you fall.');
        return false;
      case 'well':
        p.hp = Math.min(p.maxHp, p.hp + 5);
        this.say('The water is cold enough to ache.');
        return false;
      default: this.say(this.examineText(t), undefined, 4.5); return false;
    }
  }

  private toggleSit(seat: Actor) {
    const p = this.player;
    if (p.sittingOn === seat.id) {
      seat.seatTakenBy = undefined;
      p.sittingOn = undefined;
      return;
    }
    if (seat.seatTakenBy || seat.carriedBy) { this.say('Taken.'); return; }
    if (p.sittingOn) this.toggleSit(this.byId(p.sittingOn)!);
    seat.seatTakenBy = PLAYER_ID;
    p.sittingOn = seat.id;
    p.x = seat.x; p.z = seat.z; p.vx = 0; p.vz = 0;
  }

  private attemptLockpick(box: Actor) {
    const p = this.player;
    if (!this.takeFromPackSilent('lockpicks')) { this.say('Locked fast. You would need lockpicks.'); return; }
    this.addToPack('lockpicks', 1);
    this.startAction(p, 'pickup', 0.6);
    const chance = 35 + (p.skills?.lockpick ?? 0) * 0.8 - (box.locked ?? 20);
    if (this.rng() * 100 < chance) {
      box.locked = 0;
      this.say('The lock gives with a soft click.');
      this.skillXp('lockpick', 8);
    } else {
      this.noise(box, 8);
      if (this.rng() < 0.3) { this.takeFromPackSilent('lockpicks'); this.say('A pick snaps inside the lock.'); }
      else this.say('The picks scrape and slip. The noise carries.');
      this.skillXp('lockpick', 3);
      if (p.sneaking) this.skillXp('stealth', 2);
    }
  }

  private takeFromPackSilent(type: ItemType): boolean {
    if ((this.pack[type] ?? 0) <= 0) return false;
    return this.takeFromPack(type);
  }

  private openBox(box: Actor) {
    if (!box.loot?.length) { this.say('Empty but for dust.'); return; }
    for (const type of box.loot) {
      const it = this.spawnItem(type, box.x + (this.rng() - 0.5), box.z + 0.8, 1);
      it.spaceId = box.spaceId;
      it.sleeping = false;
    }
    box.loot = [];
    this.startAction(this.player, 'pickup', 0.35);
  }

  /** Secondary action (F): lift, set down, or look closely. */
  secondary() {
    const p = this.player;
    if (p.hp <= 0 || this.dialogue || p.action) return;
    const held = this.held();
    if (held) { this.release(held, false); return; }
    const t = this.focus();
    if (!t) return;
    if (t.kind === 'item') this.grab(t);
    else this.say(this.examineText(t), undefined, 4.5);
  }

  private takeItem(it: Actor) {
    const def = ITEMS[it.itemType!];
    const owned = !!it.owner && it.owner !== 'player';
    const trusted = this.isTrustedHouseholdItem(it);
    if (owned && !trusted && !it.questFor) this.commitCrime('theft', def.value);
    const data = it.questFor ? this.quests[it.questFor]?.data : undefined;
    if (data?.kind === 'retrieve' && data.itemActorId === it.id) data.recovered = true;
    if (def.stock) this.stock[def.stock] += 2;
    else if (def.gold) this.stock.gold += def.gold;
    else this.addToPack(it.itemType!);
    this.actors = this.actors.filter((a) => a !== it);
    this.byIdCache.delete(it.id);
    this.startAction(this.player, 'pickup', 0.38);
  }

  isTrustedHouseholdItem(item: Actor) {
    if (item.kind !== 'item' || !item.itemType || !item.owner) return false;
    const owner = this.npc(item.owner);
    return !!owner && !!owner.home && ITEMS[item.itemType].value <= 5 && (owner.memory?.opinion ?? 0) >= 40
      && distance(item, owner.home) < 5.5;
  }

  private grab(it: Actor) {
    if (it.owner && it.owner !== 'player') {
      const owner = this.npc(it.owner);
      if (owner && distance(owner, this.player) < 8 && owner.activity !== 'Sleeping') this.bark(owner, 'Careful with that. It is not yours.');
    }
    it.carriedBy = PLAYER_ID;
    it.sleeping = false;
    this.startAction(this.player, 'pickup', 0.3);
  }

  private release(it: Actor, thrown: boolean) {
    const p = this.player;
    const def = ITEMS[it.itemType!];
    it.carriedBy = undefined;
    it.sleeping = false;
    const reach = p.radius + def.radius + 0.15;
    it.x = p.x + Math.sin(p.facing) * reach;
    it.z = p.z + Math.cos(p.facing) * reach;
    it.y = p.y + (thrown ? 1.4 : 0.9);
    if (thrown) {
      const power = 11 / Math.max(1, def.mass * 0.45);
      it.vx = Math.sin(p.facing) * power + p.vx * 0.5;
      it.vz = Math.cos(p.facing) * power + p.vz * 0.5;
      it.vy = 3.4;
      it.thrownBy = PLAYER_ID;
      it.thrownAt = this.elapsed;
      this.startAction(p, 'throw', 0.35);
    } else { it.vx = it.vz = it.vy = 0; }
  }

  throwHeld() { const h = this.held(); if (h && this.player.hp > 0) this.release(h, true); }

  private completeGather(p: Actor) {
    const node = p.gatherTarget ? this.byId(p.gatherTarget) : undefined;
    if (!node || !node.alive) return;
    node.hp -= 1;
    node.struckAt = this.elapsed;
    const type: ItemType = node.kind === 'tree' ? 'log' : 'stoneChunk';
    const pop = () => {
      const a = this.rng() * Math.PI * 2;
      const it = this.spawnItem(type, node.x + Math.sin(a) * (node.radius + 0.4), node.z + Math.cos(a) * (node.radius + 0.4), 1.2);
      it.vx = Math.sin(a) * 2; it.vz = Math.cos(a) * 2; it.vy = 2.5; it.sleeping = false;
    };
    pop();
    if (node.hp <= 0) { pop(); node.alive = false; node.solid = false; this.staticDirty = true; this.renderRevision++; }
  }

  private strikeEcho(t: Actor) {
    t.struckAt = this.elapsed;
    if (!this.quests.echo) this.startQuest('echo', 'sound');
    if (this.echoSolved) { this.say('The stone hums softly, already at peace.'); return; }
    const order = [0, 1, 2, 0];
    if (t.variant === order[this.echoProgress]) {
      this.echoProgress++;
      if (this.echoProgress === order.length) {
        this.echoSolved = true;
        this.stock.essence += 2;
        this.stock.gold += 20;
        const it = this.spawnItem('draught', t.x, t.z + 1.2, 1.5);
        it.sleeping = false;
        this.say('The grove answers in a single long chord. Something glints at the base of the stones.');
      }
    } else {
      this.echoProgress = t.variant === 0 ? 1 : 0;
      this.say('The note sours and fades.');
    }
  }

  // ---------------------------------------------------------------- conversation
  openDialogue(n: Actor) {
    if (!this.metNpcIds.includes(n.id)) this.metNpcIds.push(n.id);
    if (n.memory) n.memory.conversations++;
    if (n.talkingTo) { const other = this.byId(n.talkingTo); if (other) other.talkingTo = undefined; n.talkingTo = undefined; }
    if (n.activity === 'Sleeping') n.activity = 'Talking';
    this.dialogue = { npcId: n.id, line: greetingFor(this, n), options: buildOptions(this, n), shop: false };
    this.subtitle = null;
  }

  choose(optionId: string) {
    const d = this.dialogue;
    if (!d) return;
    const n = this.byId(d.npcId);
    const option = d.options.find((o) => o.id === optionId);
    if (!n || !option) return;
    this.skillXp('speech', 1);
    const reply = option.run(this, n);
    if (reply.end) { this.dialogue = null; this.say(reply.line, n.name, 5); return; }
    d.line = reply.line;
    d.shop = !!reply.shop;
    d.options = reply.options ?? buildOptions(this, n);
  }

  closeDialogue() {
    const d = this.dialogue;
    if (!d) return;
    this.dialogue = null;
    const n = this.byId(d.npcId);
    if (n && n.profession !== 'Warden') this.say('Light keep you.', n.name, 2);
  }

  dialogueView(): DialogueView | null {
    const d = this.dialogue;
    if (!d) return null;
    const n = this.byId(d.npcId);
    return { npcId: d.npcId, speaker: n?.name ?? '', line: d.line, options: d.options.map((o) => ({ id: o.id, text: o.text })), shop: d.shop };
  }

  private priceMult() {
    const tobin = this.npc('Tobin');
    const opinion = tobin?.memory?.opinion ?? 0;
    const speech = 1 - Math.min(0.15, (this.player.skills?.speech ?? 0) * 0.0015);
    return clamp(1 - opinion / 200, 0.75, 1.35) * (this.flags.discount ? 0.8 : 1) * (this.flags.ledger === 'exposed' ? 1.2 : 1) * speech;
  }
  shopList(): ShopEntry[] {
    const m = this.priceMult();
    const list: ShopEntry[] = [
      { id: 'draught', name: 'Healing draught', price: Math.round(20 * m), detail: 'Honey and copper.' },
      { id: 'bread', name: 'Loaf of bread', price: Math.round(5 * m), detail: 'Bran baked it this morning.' },
      { id: 'cheese', name: 'Wheel of cheese', price: Math.round(8 * m), detail: 'Keeps for weeks.' },
      { id: 'timber', name: 'Timber from the stores', price: Math.round(15 * m), detail: `Three lengths. ${this.citadel.stockWood ?? 0} left.` },
      { id: 'stone', name: 'Stone from the stores', price: Math.round(12 * m), detail: `Two blocks. ${this.citadel.stockStone ?? 0} left.` },
    ];
    if (this.weaponLevel < 2) list.push({ id: 'blade', name: 'Iron blade', price: Math.round(65 * m), detail: "Sera's work. Heavier, keener." });
    list.push({ id: 'lockpicks', name: 'Lockpicks', price: Math.round(8 * m), detail: 'Slim steel. Ask no questions.' });
    if ((this.player.armor ?? 0) < 0.25) list.push({ id: 'coat', name: "Warden's coat", price: Math.round(45 * m), detail: 'Boiled leather. Turns a blade, somewhat.' });
    return list;
  }
  buy(id: string): string {
    const entry = this.shopList().find((e) => e.id === id);
    if (!entry) return '';
    if (this.stock.gold < entry.price) return 'You do not have enough crowns.';
    if (id === 'timber' || id === 'stone') {
      const key = id === 'timber' ? 'stockWood' : 'stockStone';
      const amount = id === 'timber' ? 3 : 2;
      if ((this.citadel[key] ?? 0) < amount) return 'The stores are bare. The workers will fill them again.';
      this.citadel[key] = (this.citadel[key] ?? 0) - amount;
      this.stock[id === 'timber' ? 'wood' : 'stone'] += amount;
    } else if (id === 'blade') { this.weaponLevel = 2; this.player.weapon = 'blade'; }
    else if (id === 'coat') this.player.armor = 0.25;
    else this.addToPack(id as ItemType);
    this.stock.gold -= entry.price;
    this.skillXp('speech', 2);
    return `Bought: ${entry.name.toLowerCase()}.`;
  }
  sellList(): SellEntry[] {
    const m = 1 / this.priceMult();
    const list: SellEntry[] = [];
    if (this.stock.wood >= 5) list.push({ id: 'timber', name: 'Five timber', price: Math.round(25 * m), count: Math.floor(this.stock.wood / 5) });
    for (const [type, count] of Object.entries(this.pack) as [ItemType, number][]) {
      if (!count || type === 'ledger') continue;
      const reserved = this.radiantQuests().filter(([, q]) => q.status === 'active' && q.data?.kind === 'retrieve'
        && q.data.recovered && q.data.itemType === type).length;
      if (count > reserved) list.push({ id: type, name: ITEMS[type].name, price: Math.max(1, Math.round(ITEMS[type].value * 0.5 * m)), count: count - reserved });
    }
    return list;
  }
  sell(id: ItemType | 'timber'): string {
    const entry = this.sellList().find((e) => e.id === id);
    if (!entry) return '';
    if (id === 'timber') {
      this.stock.wood -= 5;
      this.citadel.stockWood = Math.min(60, (this.citadel.stockWood ?? 0) + 5);
    } else this.takeFromPack(id);
    this.stock.gold += entry.price;
    return `Sold for ${entry.price} crowns.`;
  }

  // ---------------------------------------------------------------- villagers
  private updateVillager(n: Actor, dt: number) {
    const m = n.memory!, needs = n.needs!;
    const asleep = n.activity === 'Sleeping';
    needs.energy = clamp(needs.energy + (asleep ? dt / 70 : -dt / 600), 0, 1);
    needs.hunger = clamp(needs.hunger + dt / 480, 0, 1);
    needs.social = clamp(needs.social + dt / 320, 0, 1);
    needs.fun = clamp(needs.fun + dt / 420, 0, 1);
    if ((n.homeFood ?? 0) < 2 && this.rng() < dt / 300) n.homeFood = (n.homeFood ?? 0) + 1;
    this.regenerateFocus(n, dt);
    n.attackCooldown = Math.max(0, (n.attackCooldown ?? 0) - dt);
    n.workCooldown = Math.max(0, (n.workCooldown ?? 0) - dt);
    if (n.action) {
      n.actionT! += dt;
      if (n.action === 'windup' && n.actionT! >= n.actionDur!) { this.startAction(n, 'strike', 0.32); this.npcStrike(n); }
      else if (n.actionT! >= n.actionDur!) n.action = undefined;
      if (n.action === 'hurt') { this.stopMoving(n, dt); return; }
    }
    if (this.dialogue?.npcId === n.id) {
      n.activity = 'Talking';
      n.lookAt = PLAYER_ID;
      this.stopMoving(n, dt);
      this.turnToward(n, angleTo(n, this.player), 6, dt);
      return;
    }
    const p = this.player;
    if (n.capturedFor) {
      n.activity = 'Captured';
      this.stopMoving(n, dt);
      return;
    }
    if (n.followingPlayer) {
      if (!sameSpace(n, p)) { n.activity = 'Waiting'; this.stopMoving(n, dt); return; }
      const d = this.steer(n, p, 2.5, dt, 2.6);
      n.activity = d > 3.5 ? 'Following' : 'Waiting';
      if (d <= 3.5) this.stopMoving(n, dt);
      return;
    }
    const dp = sameSpace(n, p) ? distance(n, p) : Infinity;
    const seesPlayer = p.hp > 0 && sameSpace(n, p) && canSee(n, p, 5, this.hour(), p.skills?.stealth ?? 0, !!p.sneaking);
    const avoiding = n.utility?.kind === 'warn' || n.utility?.kind === 'shelter' || n.utility?.kind === 'hide';
    n.lookAt = !asleep && seesPlayer && !avoiding ? PLAYER_ID : n.talkingTo;
    if (dp < 3.2 && seesPlayer && !asleep && this.elapsed - m.lastGreet > 50 && m.alarmUntil < this.elapsed && !n.talkingTo && n.profession !== 'Warden') {
      m.lastGreet = this.elapsed;
      this.bark(n, barkFor(this, n));
    }

    n.decideIn = (n.decideIn ?? 0) - dt;
    if (n.decideIn <= 0) { this.vividDecide(n); n.decideIn = 0.8 + this.rng() * 0.5; }
    if (n.utility?.kind !== 'hide' && n.activity === 'Hiding') n.sneaking = false;

    const warden = n.profession === 'Warden';
    if (warden && n.quarryId) {
      const q = this.byId(n.quarryId);
      if (!q || !q.alive || !sameSpace(n, q) || (q.wantedUntil ?? 0) < this.elapsed) n.quarryId = undefined;
      else {
        n.activity = 'Pursuing';
        const d = this.steer(n, q, 4.3, dt, 1.2);
        if (d < 1.9) {
          q.crowns = Math.max(0, (q.crowns ?? 0) - (q.wanted ?? 10));
          const stall = this.actors.find((a) => a.kind === 'stall');
          for (const [type, count] of Object.entries(q.stolen ?? {}) as [ItemType, number][]) {
            if (this.take(q, type, count) && stall) {
              for (let i = 0; i < count; i++) this.spawnItem(type, stall.x + (this.rng() - 0.5) * 0.8, stall.z + (this.rng() - 0.5) * 0.6, stall.surface ?? 0.9, 'Tobin');
            }
          }
          q.stolen = {};
          q.wanted = 0; q.wantedUntil = 0; q.utility = undefined; n.quarryId = undefined;
          this.bark(n, 'The fine is paid, and the goods go back. See that it does not happen again.');
        }
        return;
      }
    }
    if (warden && !sameSpace(n, p) && (n.activity === 'Pursuing' || n.activity === 'Fighting')) n.activity = 'Patrolling';
    if (warden && n.activity === 'Fighting' && this.hostileUntil <= this.elapsed && !canRetaliate(n, p, this.elapsed)) {
      n.activity = this.bounty > 0 ? 'Pursuing' : 'Patrolling';
    }
    if (warden && n.activity === 'Fighting' && this.canNpcDamagePlayer(n)) {
      n.utility = { kind: 'fight', targetId: p.id, until: this.elapsed + 5, score: 3 };
      this.runGoal(n, dt);
      return;
    }
    if (warden && n.activity === 'Pursuing') {
      n.goal = { x: p.x, z: p.z };
      const d = this.steer(n, p, 4, dt, 1.4);
      if (d < 1.9 && this.confrontCooldown <= 0 && !this.dialogue && p.hp > 0) {
        this.turnToward(n, angleTo(n, p), 8, dt);
        this.confrontCooldown = 25;
        this.dialogue = { npcId: n.id, line: `Stop right there. You owe ${Math.ceil(this.bounty)} crowns for what you did. Pay up, or come with me.`, options: confrontOptions(this), shop: false };
      }
      return;
    }
    if (n.utility) this.runGoal(n, dt);
    else this.stopMoving(n, dt);
  }

  /** Vivid AI: keep a worthwhile goal, otherwise weigh every desire against the moment. */
  private vividDecide(n: Actor) {
    const m = n.memory!;
    if (n.talkingTo) {
      const other = this.byId(n.talkingTo);
      if (other && other.talkingTo === n.id && (n.socialUntil ?? 0) > this.elapsed) {
        n.activity = 'Conversing';
        n.utility = { kind: 'chat', until: n.socialUntil ?? this.elapsed + 10 };
        return;
      }
      if (other && other.talkingTo === n.id) this.shareRumors(n, other);
      this.endConversation(n);
    }
    if (n.homeDefenseUntil && n.homeDefenseUntil > this.elapsed) {
      const intruder = this.byId(PLAYER_ID);
      if (!intruder || !sameSpace(n, intruder) || intruder.hp <= 0 || distance(n, intruder) > 15) {
        n.homeDefenseUntil = 0;
        m.alarmUntil = 0;
        n.utility = undefined;
        n.activity = 'Barring the door';
      } else {
        n.utility = { kind: 'confront', targetId: PLAYER_ID, until: n.homeDefenseUntil, score: 2.4 };
        n.activity = 'Confronting';
        return;
      }
    }
    if (m.alarmUntil > this.elapsed && n.profession !== 'Warden') {
      this.endConversation(n);
      if (n.sittingOn) this.releaseSeat(n);
      const threat = m.threatId ? this.byId(m.threatId) : undefined;
      if (threat?.alive && sameSpace(n, threat) && distance(n, threat) < 22) {
        n.utility = roleResponse(this, n, threat, (n.retaliationUntil ?? 0) > this.elapsed);
        if (n.utility.kind === 'fight') n.activity = 'Fighting';
        return;
      }
      m.alarmUntil = 0;
      m.threatId = undefined;
      if (n.utility?.kind === 'hide') n.sneaking = false;
      n.utility = undefined;
    }
    if (n.profession === 'Warden') {
      const hostile = this.hostileUntil > this.elapsed;
      const directAttack = canRetaliate(n, this.player, this.elapsed);
      const pursuitRange = n.activity === 'Pursuing' || n.activity === 'Fighting' ? 22 : 14;
      const seesPlayer = sameSpace(n, this.player) && canSee(n, this.player, pursuitRange, this.hour(), this.player.skills?.stealth ?? 0, !!this.player.sneaking);
      if ((this.bounty > 0 || hostile || directAttack) && seesPlayer && this.player.hp > 0) {
        n.activity = hostile || directAttack ? 'Fighting' : 'Pursuing';
        this.endConversation(n);
        return;
      }
      if (n.activity === 'Pursuing' || n.activity === 'Fighting') n.activity = 'Patrolling';
      const criminal = this.chars.find((a) => a.kind === 'villager' && a.id !== n.id && sameSpace(a, n) && (a.wantedUntil ?? 0) > this.elapsed && distance(a, n) < 18);
      if (criminal) { n.quarryId = criminal.id; return; }
    }
    if (n.activity === 'Sleeping' && n.needs!.energy < 0.65 && this.hour() < (n.routine?.wake ?? 6.5)) {
      n.utility = { kind: 'sleep', until: this.elapsed + 30 };
      return;
    }
    const cur = n.utility;
    if (cur && cur.until > this.elapsed && this.goalValid(n, cur)) {
      const next = this.chooseNpcGoal(n);
      if (next.kind === cur.kind && next.targetId === cur.targetId) { cur.score = next.score; return; }
      const immediate = next.kind === 'flee' || (next.kind === 'heal' && n.hp < n.maxHp * 0.55);
      if (!immediate && (next.score ?? 0) <= (cur.score ?? 0.45) + 0.18) return;
      if (n.sittingOn && next.kind !== 'sit') this.releaseSeat(n);
      n.utility = next;
      return;
    }
    if (n.sittingOn && cur?.kind !== 'sit') this.releaseSeat(n);
    n.utility = this.chooseNpcGoal(n);
  }

  private chooseNpcGoal(n: Actor): Goal {
    const needs = chooseGoal(this, n);
    const profession = brainFor(n)?.onRoutine(this, n);
    return profession && (profession.score ?? 0) > (needs.score ?? 0) ? profession : needs;
  }

  private goalValid(n: Actor, g: Goal): boolean {
    const needs = n.needs!;
    switch (g.kind) {
      case 'sleep': return needs.energy < 0.92;
      case 'eatFood': return needs.hunger > 0.18 && !!this.firstFood(n);
      case 'eatHome': return needs.hunger > 0.18 && (n.homeFood ?? 0) > 0;
      case 'buyFood': return needs.hunger > 0.18 && (n.crowns ?? 0) >= 5 && this.actors.some((a) => a.kind === 'stall' && a.alive && sameSpace(a, n));
      case 'steal': {
        const t = g.targetId ? this.byId(g.targetId) : undefined;
        return !!t && t.alive && sameSpace(t, n) && !t.carriedBy && needs.hunger > 0.3 && (t.itemType === 'strongbox' || (!!t.owner && ['bread', 'apple', 'cheese'].includes(t.itemType ?? '')));
      }
      case 'scavenge': {
        const t = g.targetId ? this.byId(g.targetId) : undefined;
        return !!t && t.alive && sameSpace(t, n) && !t.carriedBy && !t.owner && (t.itemType === 'pouch' || ['bread', 'apple', 'cheese', 'herb'].includes(t.itemType ?? ''));
      }
      case 'sit': {
        const seat = g.targetId ? this.byId(g.targetId) : undefined;
        const claimed = !!seat && this.actors.some((other) => other !== n && other.alive && other.utility?.kind === 'sit'
          && other.utility.targetId === seat.id && other.utility.until > this.elapsed);
        return !!seat && seat.alive && sameSpace(seat, n) && !seat.carriedBy && !claimed && (!seat.seatTakenBy || seat.seatTakenBy === n.id) && (needs.energy < 0.9 || needs.fun > 0.25);
      }
      case 'chat': return needs.social > 0.12 || !!n.talkingTo;
      case 'work': { const h = this.hour(), r = n.routine!; return h >= r.workStart - 0.3 && h < r.workEnd + 0.3; }
      case 'stroll': return needs.fun > 0.15;
      case 'heal': { const t = g.targetId ? this.byId(g.targetId) : undefined; return !!t && t.alive && sameSpace(t, n) && t.hp < t.maxHp * 0.95; }
      case 'fight': {
        const t = g.targetId ? this.byId(g.targetId) : undefined;
        return !!t && t.alive && sameSpace(t, n) && t.hp > 0 && distance(t, n) < 16 && this.canNpcFight(n, t);
      }
      case 'castBolt': {
        const t = g.targetId ? this.byId(g.targetId) : undefined;
        return !!t && t.alive && sameSpace(t, n) && t.kind === 'foe' && (n.spells ?? []).includes('bolt') && (n.focus ?? 0) >= SPELLS.bolt.cost;
      }
      case 'flee': { const t = g.targetId ? this.byId(g.targetId) : undefined; return !!t && t.alive && sameSpace(t, n) && distance(t, n) < 14; }
      case 'warn': case 'shelter': case 'hide': {
        const t = g.targetId ? this.byId(g.targetId) : undefined;
        return !!t && t.alive && sameSpace(t, n) && ((n.memory?.alarmUntil ?? 0) > this.elapsed || distance(t, n) < 18);
      }
      case 'holdGround': {
        const t = g.targetId ? this.byId(g.targetId) : undefined;
        return !!t && t.alive && sameSpace(t, n) && distance(t, g.point ?? n) < 20;
      }
      case 'confront': return !!n.homeDefenseUntil && n.homeDefenseUntil > this.elapsed;
      case 'tavern': return (n.crowns ?? 0) >= 2 || (n.needs?.hunger ?? 0) > 0.2;
      case 'earnFood': return (n.crowns ?? 0) < 6 && !!n.work;
      case 'investigate': return true;
      default: return false;
    }
  }

  private releaseSeat(n: Actor) {
    if (!n.sittingOn) return;
    const seat = this.byId(n.sittingOn);
    if (seat && seat.seatTakenBy === n.id) seat.seatTakenBy = undefined;
    n.sittingOn = undefined;
  }

  private performProfessionWork(n: Actor, dt: number) {
    const brain = brainFor(n);
    if (!brain) return;
    n.workProgress = (n.workProgress ?? 0) + dt;
    if (n.workProgress < brain.workInterval) return;
    n.workProgress -= brain.workInterval;
    brain.onWork(this, n);
  }

  /** Execute the current goal: steer, arrive, act. Goals resolve their own targets as the world changes. */
  private runGoal(n: Actor, dt: number) {
    const g = n.utility!;
    const needs = n.needs!;
    const go = (pt: Point, speed: number, stop: number) => this.steer(n, pt, speed, dt, stop);
    switch (g.kind) {
      case 'sleep': {
        const d = go(n.home!, 1.7, 0.5);
        n.activity = d <= 0.9 ? 'Sleeping' : 'Heading home';
        const house = this.houseFor(n);
        if (house) house.doorLocked = d <= 0.9;
        break;
      }
      case 'tavern': {
        const tavern = this.tavern;
        if (!tavern) { n.utility = undefined; break; }
        const d = go({ x: tavern.x, z: tavern.z + tavern.radius + 1.15 }, 1.5, 0.7);
        n.activity = d <= 1.4 ? 'At the tavern' : 'Heading to the tavern';
        if (d <= 1.4) {
          this.stopMoving(n, dt);
          needs.social = Math.max(0, needs.social - dt * 0.025);
          n.earnTimer = (n.earnTimer ?? 0) + dt;
          if (g.targetId !== 'served' && n.earnTimer > 2.2) {
            n.earnTimer = 0;
            if ((n.crowns ?? 0) >= 3) {
              n.crowns! -= 3;
              needs.hunger = Math.max(0, needs.hunger - 0.32);
              needs.fun = Math.max(0, needs.fun - 0.16);
              n.activity = 'Eating';
              g.targetId = 'served';
            } else if (n.profession !== 'Warden') {
              n.utility = { kind: 'earnFood', until: this.elapsed + 35 };
            }
          }
        }
        break;
      }
      case 'earnFood': {
        if (!n.work) { n.utility = undefined; break; }
        const d = go(n.work, 1.5, 0.7);
        n.activity = d <= 1.2 ? 'Working for a meal' : 'Looking for work';
        if (d <= 1.2) {
          this.stopMoving(n, dt);
          n.earnTimer = (n.earnTimer ?? 0) + dt;
          if (n.earnTimer >= 5) {
            n.earnTimer = 0;
            n.crowns = (n.crowns ?? 0) + 5;
            n.utility = { kind: 'buyFood', until: this.elapsed + 30 };
          }
        }
        break;
      }
      case 'confront': {
        const intruder = g.targetId ? this.byId(g.targetId) : undefined;
        if (!intruder || !intruder.alive || intruder.hp <= 0 || !n.homeDefenseUntil || n.homeDefenseUntil <= this.elapsed) {
          n.homeDefenseUntil = 0; n.utility = undefined; break;
        }
        const d = go(intruder, 3.2, 1.9);
        n.activity = 'Confronting';
        n.lookAt = intruder.id;
        if (d <= 2.8) {
          this.stopMoving(n, dt);
          this.turnToward(n, angleTo(n, intruder), 7, dt);
          if ((n.workCooldown ?? 0) <= 0) {
            this.say(this.homeDefenseLine(n), n.name, 4);
            if ((n.desires?.responsibility ?? 0.5) > 0.58) this.noise(n, 12);
            n.workCooldown = 5;
          }
        }
        if (distance(n, intruder) > 13) {
          n.homeDefenseUntil = 0;
          n.memory!.alarmUntil = 0;
          n.utility = undefined;
          n.activity = 'Barring the door';
        }
        break;
      }
      case 'eatFood': case 'eatHome': {
        if (g.kind === 'eatHome' && go(n.home!, 1.4, 0.6) > 1) { n.activity = 'Heading home'; break; }
        n.activity = 'Eating';
        this.stopMoving(n, dt);
        needs.hunger = Math.max(0, needs.hunger - dt * 0.055);
        if (needs.hunger <= 0.22) {
          if (g.kind === 'eatFood') { const f = this.firstFood(n); if (f) this.take(n, f); }
          else n.homeFood = Math.max(0, (n.homeFood ?? 1) - 1);
          n.utility = undefined;
        }
        break;
      }
      case 'buyFood': {
        const stall = this.actors.find((a) => a.kind === 'stall')!;
        const d = go({ x: stall.x, z: stall.z + 1.7 }, 1.5, 0.4);
        n.activity = 'Buying';
        if (d <= 0.8) {
          if ((n.crowns ?? 0) >= 5) {
            n.crowns! -= 5;
            const tobin = this.npc('Tobin');
            if (tobin) tobin.crowns = (tobin.crowns ?? 0) + 5;
            this.give(n, 'bread');
            n.utility = { kind: 'eatFood', until: this.elapsed + 25 };
          } else n.utility = undefined;
        }
        break;
      }
      case 'steal': {
        const t = g.targetId ? this.byId(g.targetId) : undefined;
        if (!t || !t.alive || t.carriedBy) { n.utility = undefined; break; }
        n.activity = 'Sneaking';
        const d = go(t, 2.3, t.radius + 0.9);
        if (d > t.radius + 1.7) break;
        this.stopMoving(n, dt);
        const seen = this.seenByOthers(t, n);
        if (t.itemType === 'strongbox') {
          const chance = 30 + (n.skills?.lockpick ?? 0) * 0.8 - (t.locked ?? 20);
          if (seen.length === 0 && this.rng() * 100 < chance) {
            t.locked = 0; t.loot = [];
            n.crowns = (n.crowns ?? 0) + 12;
            this.trainSkill(n, 'lockpick', 4);
          } else if (seen.length) this.caughtStealing(n, seen);
          n.utility = undefined;
          break;
        }
        if (seen.length) { this.caughtStealing(n, seen); break; }
        this.actors = this.actors.filter((a) => a !== t);
        this.byIdCache.delete(t.id);
        this.give(n, t.itemType!, 1, !!t.owner);
        this.trainSkill(n, 'stealth', 3);
        n.utility = { kind: 'eatFood', until: this.elapsed + 25 };
        break;
      }
      case 'sit': {
        const seat = g.targetId ? this.byId(g.targetId) : undefined;
        if (!seat || !seat.alive || seat.carriedBy || (seat.seatTakenBy && seat.seatTakenBy !== n.id)) {
          // Someone took the seat, or it was carried off: choose again rather than stand stuck.
          this.releaseSeat(n);
          n.utility = undefined;
          break;
        }
        if (n.sittingOn === seat.id) {
          n.activity = 'Sitting';
          n.x = seat.x; n.z = seat.z; n.vx = 0; n.vz = 0;
          needs.energy = clamp(needs.energy + dt / 260, 0, 1);
          needs.fun = Math.max(0, needs.fun - dt / 320);
          const near = this.chars.find((c) => c.kind === 'villager' && c !== n && Math.abs(c.x - n.x) + Math.abs(c.z - n.z) < 3.4);
          if (near) this.turnToward(n, angleTo(n, near), 3, dt);
          break;
        }
        n.activity = 'Strolling';
        if (go(seat, 1.4, 0.15) <= 1.1) {
          this.releaseSeat(n);
          seat.seatTakenBy = n.id;
          n.sittingOn = seat.id;
          n.x = seat.x; n.z = seat.z;
          n.activity = 'Sitting';
        }
        break;
      }
      case 'chat': {
        if (n.talkingTo) {
          const other = this.byId(n.talkingTo);
          if (other && other.talkingTo === n.id) {
            const d = go(other, 1.3, 0.85);
            n.activity = 'Conversing';
            if (d <= 1.4) { this.stopMoving(n, dt); this.turnToward(n, angleTo(n, other), 4, dt); needs.social = Math.max(0, needs.social - dt * 0.03); }
            break;
          }
          this.endConversation(n);
        }
        const partner = this.actors.find((o) => o !== n && o.kind === 'villager' && o.alive && !o.talkingTo && o.profession !== 'Warden' &&
          o.activity !== 'Sleeping' && o.activity !== 'Talking' && (o.needs?.social ?? 0) > 0.2 && distance(o, n) < 10 && this.dialogue?.npcId !== o.id);
        if (partner) {
          n.talkingTo = partner.id; partner.talkingTo = n.id;
          n.socialUntil = partner.socialUntil = this.elapsed + 14 + this.rng() * 8;
          n.activity = partner.activity = 'Conversing';
        } else {
          go(n.social!, 1.3, 0.6);
          n.activity = 'Conversing';
        }
        break;
      }
      case 'work': {
        if ((n.profession === 'Warden' || n.profession === 'Scout') && n.patrol) {
          const tgt = n.patrol[n.patrolIndex ?? 0];
          if (distance(n, tgt) < 1.2) n.patrolIndex = ((n.patrolIndex ?? 0) + 1) % n.patrol.length;
          go(n.patrol[n.patrolIndex ?? 0], n.profession === 'Scout' ? 2 : 1.5, 0.6);
          n.activity = n.profession === 'Scout' ? 'Scouting' : 'Patrolling';
          break;
        }
        let spot = n.work!;
        const blocker = this.chars.find((c) => c !== n && c.hp > 0 && distance(c, n.work!) < 0.9 && (c.kind === 'player' || c.sittingOn || (c.kind === 'villager' && c.activity !== 'Strolling')));
        if (blocker) {
          const a = angleTo(blocker, n) || n.variant;
          spot = { x: n.work!.x + Math.sin(a) * 1.6, z: n.work!.z + Math.cos(a) * 1.6 };
          if (blocker.kind === 'player' && (n.workCooldown ?? 0) <= 0 && distance(n, this.player) < 4) {
            this.bark(n, (n.persona?.temper ?? 0.5) < 0.35 ? 'You are in my way.' : 'Mind yourself, I need that spot.');
            n.workCooldown = 20;
          }
        }
        const d = go(spot, 1.35, 0.7);
        n.activity = WORK_ACTIVITY[n.profession ?? ''] ?? 'Working';
        if (d <= 1.1) {
          this.stopMoving(n, dt);
          if (n.activity === 'Chopping' && this.rng() < dt / 22) this.citadel.stockWood = Math.min(60, (this.citadel.stockWood ?? 0) + 1);
          if (n.activity === 'Masonry' && this.rng() < dt / 26) this.citadel.stockStone = Math.min(60, (this.citadel.stockStone ?? 0) + 1);
          this.performProfessionWork(n, dt);
        }
        break;
      }
      case 'scavenge': {
        const t = g.targetId ? this.byId(g.targetId) : undefined;
        if (!t || !t.alive || t.carriedBy || t.owner) { n.utility = undefined; break; }
        n.activity = 'Strolling';
        const d = go(t, 1.6, t.radius + 0.4);
        if (d > t.radius + 0.9) break;
        this.actors = this.actors.filter((a) => a !== t);
        this.byIdCache.delete(t.id);
        if (t.itemType === 'pouch') n.crowns = (n.crowns ?? 0) + 12; else this.give(n, t.itemType!);
        this.startAction(n, 'pickup', 0.38);
        n.utility = undefined;
        break;
      }
      case 'stroll': {
        const pt = g.point ?? n.routine!.haunt;
        const d = go(pt, 1.2, 0.8);
        n.activity = d <= 1.2 ? 'Watching' : 'Strolling';
        if (d <= 1.2) { this.stopMoving(n, dt); needs.fun = Math.max(0, needs.fun - dt * 0.045); }
        break;
      }
      case 'heal': {
        const t = g.targetId ? this.byId(g.targetId) : undefined;
        if (!t || !t.alive || t.hp >= t.maxHp) { n.utility = undefined; break; }
        const d = go(t, 1.7, 4);
        n.activity = 'Tending';
        if (d <= 6.5) {
          this.stopMoving(n, dt);
          this.turnToward(n, angleTo(n, t), 5, dt);
          if ((n.workCooldown ?? 0) <= 0) { this.castMending(n); n.workCooldown = 2.5; }
        }
        break;
      }
      case 'fight': {
        const t = g.targetId ? this.byId(g.targetId) : undefined;
        const style = brainFor(n)?.attack;
        if (!t || !t.alive || t.hp <= 0 || !this.canNpcFight(n, t) || !style) { n.utility = undefined; break; }
        const order = this.planCombatOrder(n, t);
        if (order.action === 'withdraw') { n.utility = { kind: 'flee', targetId: t.id, until: this.elapsed + 5, score: 2.5 }; break; }
        if (order.action === 'support' && order.allyId) { n.utility = { kind: 'heal', targetId: order.allyId, until: this.elapsed + 5, score: 2.4 }; break; }
        const reach = 1.15 + WEAPONS[n.weapon ?? 'fists'].reach + t.radius + style.reach;
        if (order.action === 'flank' && order.point && distance(n, order.point) > 0.9 && distance(n, t) > reach + 0.35) {
          go(order.point, style.speed, 0.6);
          n.activity = 'Flanking';
          break;
        }
        const d = go(t, style.speed, reach * 0.8);
        n.activity = 'Fighting';
        if (d <= reach + 0.35) {
          this.turnToward(n, angleTo(n, t), 7, dt);
          this.stopMoving(n, dt);
          if ((n.attackCooldown ?? 0) <= 0 && !n.action) {
            n.targetId = t.id;
            n.attackCooldown = style.cooldown;
            this.startAction(n, 'windup', style.windup);
          }
        }
        break;
      }
      case 'castBolt': {
        const t = g.targetId ? this.byId(g.targetId) : undefined;
        if (!t || !t.alive || t.kind !== 'foe' || (n.focus ?? 0) < SPELLS.bolt.cost) { n.utility = undefined; break; }
        const order = this.planCombatOrder(n, t);
        if (order.action === 'withdraw') { n.utility = { kind: 'flee', targetId: t.id, until: this.elapsed + 5, score: 2.5 }; break; }
        if (order.action === 'support' && order.allyId) { n.utility = { kind: 'heal', targetId: order.allyId, until: this.elapsed + 5, score: 2.4 }; break; }
        const near = distance(n, t) < 4;
        const d = near ? go({ x: n.x + (n.x - t.x) * 2, z: n.z + (n.z - t.z) * 2 }, 2.8, 0.6)
          : go(t, 2.2, SPELLS.bolt.range - 0.6);
        n.activity = d <= SPELLS.bolt.range ? 'Casting' : 'Closing in';
        if (!near && d <= SPELLS.bolt.range) {
          this.stopMoving(n, dt);
          this.turnToward(n, angleTo(n, t), 5, dt);
          if ((n.workCooldown ?? 0) <= 0) {
            if (this.castBolt(n, t)) n.workCooldown = 2.6;
            else n.utility = undefined;
          }
        }
        break;
      }
      case 'flee': {
        const threat = g.targetId ? this.byId(g.targetId) : undefined;
        const away = threat && distance(threat, n) < 10 ? { x: n.x + (n.x - threat.x) * 2, z: n.z + (n.z - threat.z) * 2 } : n.home!;
        go(away, 3.9, 0.4);
        n.activity = 'Fleeing';
        break;
      }
      case 'warn': {
        const d = go(g.point ?? n.social ?? n.home!, 2.7, 0.8);
        n.activity = d < 1.5 ? 'Calling wardens' : 'Seeking wardens';
        if ((n.workCooldown ?? 0) <= 0) { this.noise(n, 11); n.workCooldown = 5; }
        break;
      }
      case 'shelter': {
        const d = go(g.point ?? n.home!, 3, 0.6);
        n.activity = d < 1.2 ? 'Sheltering' : 'Heading for shelter';
        if (d < 1.2) this.stopMoving(n, dt);
        break;
      }
      case 'hide': {
        const threat = g.targetId ? this.byId(g.targetId) : undefined;
        const away = threat && distance(threat, n) < 7
          ? { x: n.x + (n.x - threat.x) * 2, z: n.z + (n.z - threat.z) * 2 } : g.point ?? n.home!;
        n.sneaking = true;
        const d = go(away, 2.6, 0.7);
        n.activity = 'Hiding';
        if (d < 1) this.stopMoving(n, dt);
        break;
      }
      case 'holdGround': {
        const threat = g.targetId ? this.byId(g.targetId) : undefined;
        if (!threat?.alive || !sameSpace(n, threat)) { n.utility = undefined; break; }
        if (distance(n, threat) < 3.4 && n.hp > n.maxHp * 0.38) {
          n.utility = { kind: n.spells?.includes('bolt') && (n.focus ?? 0) >= 20 ? 'castBolt' : 'fight',
            targetId: threat.id, until: this.elapsed + 5, score: 2.5 };
          break;
        }
        go(g.point ?? n.work ?? n, 2.1, 0.7);
        n.activity = 'Holding position';
        break;
      }
      case 'investigate': {
        const d = go(g.point ?? n.social!, 1.8, 0.8);
        n.activity = d <= 1.2 ? 'Watching' : 'Investigating';
        if (d <= 1.2) this.stopMoving(n, dt);
        break;
      }
      default: {
        go(n.social!, 1.2, 0.8);
        n.activity = 'Idle';
      }
    }
  }

  /** Who can see this spot, allowing for a thief who knows how to move quietly. */
  private seenByOthers(at: Point, thief: Actor): Actor[] {
    const stealth = thief.skills?.stealth ?? 0;
    const sneaking = !!thief.sneaking || thief.activity === 'Sneaking';
    const seen: Actor[] = [];
    for (const o of this.chars) {
      if (o === thief || !sameSpace(o, thief) || !o.alive || o.hp <= 0) continue;
      if (o.kind !== 'villager' && o.kind !== 'player') continue;
      if (o.kind === 'villager' && o.activity === 'Sleeping') continue;
      if (canSee(o, at, 8.7, this.hour(), stealth, sneaking)) seen.push(o);
    }
    return seen;
  }

  private caughtStealing(n: Actor, seen: Actor[]) {
    const witness = seen.find((o) => o.kind === 'villager') ?? seen[0];
    this.say('Thief! Wardens!', witness.name, 3);
    n.wanted = 12;
    n.wantedUntil = this.elapsed + 150;
    for (const o of seen) if (o.kind === 'villager' && o.memory) { this.addRumor(o, `thief:${n.name}`); this.adjustOpinion(o, -15); }
    n.utility = { kind: 'flee', targetId: witness.id, until: this.elapsed + 10 };
  }

  /** A villager's blow, resolved when their wind-up completes. Uses the same melee rules as foes. */
  private npcStrike(n: Actor) {
    const t = n.targetId ? this.byId(n.targetId) : undefined;
    const style = brainFor(n)?.attack;
    if (!t || !t.alive || !sameSpace(n, t) || !this.canNpcFight(n, t) || !style) return;
    if (distance(n, t) > 1.3 + WEAPONS[n.weapon ?? 'fists'].reach + t.radius + style.reach) return;
    this.hurt(t, this.meleeDamage(n) * style.damage, n.id);
    this.trainSkill(n, 'blade', 1.5);
    if (t.kind === 'foe') { t.targetId = n.id; this.alertFoe(t, n); }
  }

  /** Sounds carry. Curious villagers come and look; wardens come faster. */
  noise(at: Point & { spaceId?: string }, radius = 7) {
    for (const n of this.chars) {
      if (n.kind !== 'villager' || !n.alive || n.activity === 'Sleeping' || n.activity === 'Fleeing') continue;
      if (!sameSpace(n, at)) continue;
      if ((n.memory?.alarmUntil ?? 0) > this.elapsed && n.memory?.threatId) continue;
      if (distance(n, at) > radius) continue;
      const duty = PROFESSION_DUTIES[n.profession ?? ''];
      if (duty === 'patrol' || duty === 'scout' || (duty === 'heal' && (n.persona?.curiosity ?? 0) > 0.7)) {
        n.utility = { kind: 'investigate', point: { x: at.x, z: at.z }, until: this.elapsed + 16 };
        n.decideIn = Math.min(n.decideIn ?? 0, 2.5);
      }
    }
  }

  // ---------------------------------------------------------------- spells & skills (shared by everyone)
  /** Skill growth is shared by the guardian and every autonomous actor. */
  trainSkill(actor: Actor, kind: SkillKind, amount: number) {
    if (!actor.skills || amount <= 0) return;
    const before = Math.floor(actor.skills[kind] / 25);
    actor.skills[kind] = clamp(actor.skills[kind] + amount, 0, 100);
    if (actor.kind === 'player' && Math.floor(actor.skills[kind] / 25) > before) this.notify(`Your ${kind} skill improves.`);
  }
  skillXp(kind: SkillKind, amount: number) {
    this.trainSkill(this.player, kind, amount);
  }

  castMending(caster: Actor): boolean {
    if ((caster.focus ?? 0) < SPELLS.mending.cost || (caster.kind !== 'foe' && !caster.spells?.includes('mending'))) return false;
    let target: Actor | undefined, worst = 1;
    for (const a of this.actors) {
      if (!a.alive || !sameSpace(a, caster) || a.hp <= 0) continue;
      if (caster.memory?.threatId === a.id && caster.memory.alarmUntil > this.elapsed) continue;
      const ally = caster.faction === 'wild' ? a.kind === 'foe' : a.kind === 'villager' || a.kind === 'player';
      if (!ally || distance(a, caster) > SPELLS.mending.range) continue;
      const f = a.hp / a.maxHp;
      if (f < worst) { worst = f; target = a; }
    }
    if (!target || worst >= 1) return false;
    caster.focus! -= SPELLS.mending.cost;
    target.hp = Math.min(target.maxHp, target.hp + SPELLS.mending.power * (1 + (caster.skills?.magic ?? 0) / 100));
    caster.shotAt = this.elapsed; caster.shotX = target.x; caster.shotZ = target.z;
    this.startAction(caster, 'strike', 0.35);
    this.trainSkill(caster, 'magic', 6);
    return true;
  }

  castBolt(caster: Actor, target?: Actor): boolean {
    if ((caster.focus ?? 0) < SPELLS.bolt.cost) return false;
    let t = target;
    if (!t || !t.alive || !this.isHostile(caster, t) || distance(caster, t) > SPELLS.bolt.range) {
      let bd = SPELLS.bolt.range;
      for (const a of this.actors) {
        if (!a.alive || a.hp <= 0) continue;
        if (!this.isHostile(caster, a)) continue;
        const d = distance(a, caster);
        if (d < bd) { bd = d; t = a; }
      }
    }
    if (!t || !t.alive || !this.isHostile(caster, t) || distance(caster, t) > SPELLS.bolt.range) return false;
    caster.focus! -= SPELLS.bolt.cost;
    caster.facing = angleTo(caster, t);
    caster.shotAt = this.elapsed; caster.shotX = t.x; caster.shotZ = t.z;
    this.startAction(caster, 'strike', 0.3);
    this.hurt(t, SPELLS.bolt.power * (1 + (caster.skills?.magic ?? 0) / 120), caster.id);
    if (t.kind === 'foe') this.alertFoe(t, caster);
    this.trainSkill(caster, 'magic', 5);
    return true;
  }

  private isHostile(caster: Actor, target: Actor) {
    if (!sameSpace(caster, target)) return false;
    if (caster.faction === 'wild') return target.faction === 'citadel' || target.kind === 'player';
    return target.kind === 'foe' || target.faction === 'wild';
  }

  /** The guardian casts with the same rules, focus and skills as any villager mage. */
  castSpell(id: SpellId) {
    const p = this.player;
    if (!p.spells?.includes(id) || p.hp <= 0 || this.dialogue) return;
    if (id === 'mending') { if (!this.castMending(p)) this.say('The verse will not come. Either you are unhurt, or your focus is spent.'); }
    else if (!this.castBolt(p)) this.say('No foe within reach of the spark.');
  }

  toggleSneak() {
    const p = this.player;
    if (p.hp <= 0 || p.sittingOn) return;
    p.sneaking = !p.sneaking;
  }

  private endConversation(n: Actor) {
    if (!n.talkingTo) return;
    const other = this.byId(n.talkingTo);
    if (other && other.talkingTo === n.id) { other.talkingTo = undefined; if (other.activity === 'Conversing') other.activity = 'Strolling'; }
    n.talkingTo = undefined;
  }

  /** Word travels: whatever one villager knows about the guardian, the other now knows too. */
  private shareRumors(a: Actor, b: Actor) {
    const exchange = (from: Actor, to: Actor) => {
      for (const r of from.memory!.rumors) {
        if (to.memory!.rumors.includes(r)) continue;
        to.memory!.rumors.push(r);
        this.adjustOpinion(to, r === 'crime' ? -8 : r === 'helped' ? 6 : 0);
      }
    };
    exchange(a, b); exchange(b, a);
    a.memory!.conversations++; b.memory!.conversations++;
    a.needs!.social = 0; b.needs!.social = 0;
  }

  // ---------------------------------------------------------------- the wilds
  private updateFoe(f: Actor, dt: number) {
    const def = FOES[f.foeKind!];
    const behavior = FOE_BEHAVIORS[f.foeKind!];
    f.attackCooldown = Math.max(0, (f.attackCooldown ?? 0) - dt);
    f.workCooldown = Math.max(0, (f.workCooldown ?? 0) - dt);
    if (f.foeKind === 'wisp') this.regenerateFocus(f, dt);
    if (f.action) {
      f.actionT! += dt;
      if (f.action === 'windup') {
        const t = f.targetId ? this.byId(f.targetId) : undefined;
        if (t) this.turnToward(f, angleTo(f, t), 3, dt);
        if (f.actionT! >= f.actionDur!) { this.startAction(f, 'strike', 0.32); this.foeStrike(f); }
      } else if (f.actionT! >= f.actionDur!) f.action = undefined;
      if (f.action) { this.stopMoving(f, dt); return; }
    }
    if (f.foeKind === 'wisp' && f.workCooldown <= 0 && (f.focus ?? 0) >= SPELLS.mending.cost) {
      const ally = this.chars.find((a) => a.kind === 'foe' && a !== f && a.alive && a.hp > 0 && a.hp < a.maxHp * 0.7 && distance(a, f) < 6);
      if (ally && this.castMending(f)) { f.workCooldown = 3; return; }
    }
    const p = this.player;
    const playerHere = sameSpace(f, p);
    const dp = playerHere ? distance(f, p) : Infinity;
    const closeSighting = p.sneaking ? dp < 4.5 : dp < 8;
    const sees = playerHere && p.hp > 0 && (closeSighting || canSee(f, p, p.sneaking ? 12 : 15, this.hour(), p.skills?.stealth ?? 0, !!p.sneaking));
    if (!playerHere && f.intent === 'chase') { f.intent = 'search'; f.targetId = undefined; }
    if (!playerHere && f.intent === 'flee') f.intent = 'return';
    if (sees && f.intent !== 'chase' && f.intent !== 'flee') this.alertFoe(f, p);
    if (sees) { f.lastKnown = { x: p.x, z: p.z }; f.lostFor = 0; }
    if (f.intent === 'guard' && !sees) {
      if (f.guardPost && distance(f, f.guardPost) > 1.5) this.steer(f, f.guardPost, def.speed, dt, 1);
      else this.stopMoving(f, dt);
      return;
    }
    if (f.hp < f.maxHp * 0.3 && def.courage < 0.5 && dp < 12) f.intent = 'flee';

    if (f.intent === 'flee') {
      const away = f.tactic?.action === 'withdraw' && f.tactic.point ? f.tactic.point : { x: f.x + (f.x - p.x), z: f.z + (f.z - p.z) };
      this.steer(f, away, def.speed * 1.1, dt);
      if (dp > 20) f.intent = 'return';
      return;
    }
    if (f.intent === 'chase' || f.intent === 'raid') {
      if (f.intent === 'chase' && !sees && !f.vendettaFor) {
        f.lostFor = (f.lostFor ?? 0) + dt;
        if ((f.lostFor ?? 0) > 3) { f.intent = 'search'; return; }
      }
      let target: Actor = p;
      const quarry = f.targetId ? this.byId(f.targetId) : undefined;
      if (quarry && quarry.alive && sameSpace(quarry, f) && quarry.kind === 'villager' && distance(quarry, f) < 9) target = quarry;
      if (f.foeKind === 'brute' && f.intent === 'raid') {
        target = this.actors.find((a) => a.alive && sameSpace(a, f) && a.faction === 'citadel'
          && (a.kind === 'tower' || a.kind === 'barricade' || a.kind === 'camp') && distance(a, f) < 14) ?? this.citadel;
        if (sees && dp < 2.8) target = p;
      } else if (f.intent === 'raid' && (!sees || dp > 6)) {
        target = this.actors.find((a) => a.alive && sameSpace(a, f) && a.faction === 'citadel' && (a.kind === 'tower' || a.kind === 'barricade' || a.kind === 'camp') && distance(a, f) < 6) ?? this.citadel;
      }
      if (target === p && (!playerHere || p.hp <= 0)) { f.intent = f.intent === 'raid' ? 'raid' : 'return'; return; }
      const reach = def.reach + target.radius;
      const d = distance(f, target);
      const order = this.planCombatOrder(f, target);
      if (order.action === 'withdraw' && order.point) {
        f.intent = 'flee';
        this.steer(f, order.point, def.speed * 1.1, dt);
        return;
      }
      if (order.action === 'hold' && f.guardPost) { f.intent = 'guard'; this.steer(f, f.guardPost, def.speed, dt, 1); return; }
      if (order.action === 'support' && order.allyId) {
        const ally = this.byId(order.allyId);
        if (ally?.alive) {
          if (distance(f, ally) > 6) this.steer(f, ally, def.speed, dt, 5);
          else if (f.workCooldown <= 0 && this.castMending(f)) f.workCooldown = 3;
          else this.stopMoving(f, dt);
          return;
        }
      }
      if (order.action === 'flank' && order.point && d > reach + 0.4 && distance(f, order.point) > 0.8) {
        this.steer(f, order.point, def.speed * 1.12, dt, 0.6);
        return;
      }
      if (order.action === 'ranged' && f.foeKind === 'wisp') {
        if (d < 4) this.steer(f, { x: f.x + (f.x - target.x) * 2, z: f.z + (f.z - target.z) * 2 }, def.speed, dt);
        else if (d > 10) this.steer(f, target, def.speed, dt, 9);
        else this.stopMoving(f, dt);
        if (d < SPELLS.bolt.range && f.workCooldown <= 0 && this.castBolt(f, target)) f.workCooldown = 3.2;
        return;
      }
      if (d <= reach) {
        this.turnToward(f, angleTo(f, target), 6, dt);
        this.stopMoving(f, dt);
        if (f.attackCooldown <= 0) {
          f.targetId = target.id;
          f.attackCooldown = def.windup + 1.1;
          this.startAction(f, 'windup', def.windup);
        }
      } else this.steer(f, target, def.speed, dt, reach * 0.9);
      return;
    }
    if (f.intent === 'search') {
      const tgt = f.lastKnown ?? this.camp;
      const d = this.steer(f, tgt, def.speed * 0.8, dt, 1);
      f.lostFor = (f.lostFor ?? 0) + dt;
      if (d < 1.2 || (f.lostFor ?? 0) > 9) f.intent = f.guardPost ? 'guard' : 'return';
      return;
    }
    if (f.guardPost && f.intent === 'return') {
      const d = this.steer(f, f.guardPost, def.speed, dt, 1);
      if (d < 1.4) f.intent = 'guard';
      return;
    }
    // Forage and return: workers decide from their own load and the camp's needs.
    let camp: Actor | undefined, campDistance = Infinity;
    for (const candidate of this.actors) {
      if (candidate.kind !== 'camp' || candidate.faction !== 'wild' || !candidate.alive) continue;
      const d2 = (candidate.x - f.x) ** 2 + (candidate.z - f.z) ** 2;
      if (d2 < campDistance) { campDistance = d2; camp = candidate; }
    }
    if (!camp) { this.stopMoving(f, dt); return; }
    const load = (f.carriedWood ?? 0) + (f.carriedStone ?? 0);
    if (load >= 3 || f.intent === 'return') {
      f.intent = 'return';
      if (distance(f, camp) <= camp.radius + f.radius + 1) {
        camp.stockWood = (camp.stockWood ?? 0) + (f.carriedWood ?? 0);
        camp.stockStone = (camp.stockStone ?? 0) + (f.carriedStone ?? 0);
        f.carriedWood = 0; f.carriedStone = 0; f.intent = 'forage'; f.targetId = undefined;
      } else this.steer(f, camp, def.speed * 0.75, dt, camp.radius + f.radius + 0.5);
      return;
    }
    if (!behavior.gathers) {
      if (f.foeKind === 'wisp') {
        const patient = this.chars.find((a) => a.kind === 'foe' && a !== f && a.alive && a.hp < a.maxHp * 0.7 && distance(a, f) < 14);
        if (patient) { this.steer(f, patient, def.speed * 0.85, dt, 4.5); f.activity = 'Screening'; return; }
      }
      this.steer(f, foePatrolPoint(f, camp, this.elapsed), def.speed * (f.foeKind === 'stalker' ? 0.85 : 0.65), dt, 0.7);
      f.activity = f.foeKind === 'slime' ? 'Prowling' : f.foeKind === 'wisp' ? 'Screening' : 'Lurking';
      return;
    }
    let node = f.targetId ? this.byId(f.targetId) : undefined;
    if (!node || !node.alive || (node.kind !== 'tree' && node.kind !== 'ore')) {
      const want = (camp.stockWood ?? 0) < (camp.stockStone ?? 0) * 1.5 + 3 ? 'tree' : 'ore';
      node = undefined;
      let best = Infinity;
      for (const a of this.solidGrid.query(camp.x, camp.z, 26, this.qa)) {
        if (!a.alive || a.kind !== want) continue;
        const d = distance(a, f);
        if (d < best && distance(a, camp) < 26) { best = d; node = a; }
      }
      f.targetId = node?.id;
    }
    if (!node) { this.stopMoving(f, dt); return; }
    const reach = f.radius + node.radius + 0.8;
    if (distance(f, node) > reach) this.steer(f, node, def.speed * 0.65, dt, reach - 0.2);
    else {
      this.stopMoving(f, dt);
      this.turnToward(f, angleTo(f, node), 5, dt);
      if (f.workCooldown <= 0) {
        f.workCooldown = 2.8;
        this.startAction(f, 'strike', 0.32);
        if (node.kind === 'tree') f.carriedWood = (f.carriedWood ?? 0) + 1; else f.carriedStone = (f.carriedStone ?? 0) + 1;
        node.hp = Math.max(0, node.hp - 0.25);
        node.struckAt = this.elapsed;
        if (node.hp === 0) { node.alive = false; node.solid = false; this.staticDirty = true; this.renderRevision++; }
      }
    }
  }

  private foeStrike(f: Actor) {
    const def = FOES[f.foeKind!];
    const t = f.targetId ? this.byId(f.targetId) : undefined;
    if (!t || !t.alive || !sameSpace(f, t)) return;
    const siege = f.foeKind === 'brute' && (t.kind === 'citadel' || t.kind === 'tower' || t.kind === 'barricade');
    const dmg = def.damage * (siege ? 1.5 : 1) * (1 + ((f.weaponLevel ?? 1) - 1) * 0.3);
    if (t.kind === 'player') {
      if (distance(f, t) > def.reach + t.radius + 0.5) return;
      if (Math.abs(angleDelta(f.facing, angleTo(f, t))) > 1.2) return;
      this.hurt(t, dmg, f.id);
      if (f.foeKind === 'slime') this.stamina = Math.max(0, this.stamina - 8);
      if (this.elapsed >= this.invulnUntil) {
        const a = angleTo(f, t);
        t.vx += Math.sin(a) * 5; t.vz += Math.cos(a) * 5;
      }
    } else this.hurt(t, dmg, f.id);
  }

  private updateCamps() {
    for (const camp of this.actors.filter((a) => a.alive && a.kind === 'camp' && a.faction === 'wild')) {
      const wood = camp.stockWood ?? 0, stone = camp.stockStone ?? 0;
      const guards = this.actors.filter((a) => a.alive && a.kind === 'tower' && a.faction === 'wild' && distance(a, camp) < 12).length;
      if (wood >= 5 && stone >= 3 && guards < 2) {
        const spot = this.findBuildSpot(camp, 5, 10, 1.4);
        if (spot) {
          camp.stockWood = wood - 5; camp.stockStone = stone - 3;
          this.add('tower', 'Wild watchtower', spot.x, spot.z, { faction: 'wild', structure: 'archer', radius: 1.35, height: 5, hp: 180, maxHp: 180, attackCooldown: 0 });
          continue;
        }
      }
      if (wood >= 2 && stone >= 2) {
        const worker = this.chars.find((a) => a.kind === 'foe' && distance(a, camp) < 8 && (a.weaponLevel ?? 1) < 2);
        if (worker) { worker.weaponLevel = 2; camp.stockWood = wood - 2; camp.stockStone = stone - 2; continue; }
      }
      if (wood >= 12 && stone >= 8 && this.wildCampCount() < 2) {
        const spot = this.findBuildSpot({ x: camp.x + 16, z: camp.z - 10 }, 3, 9, 2.5);
        if (spot) {
          camp.stockWood = wood - 12; camp.stockStone = stone - 8;
          this.add('camp', 'Wild outpost', spot.x, spot.z, { faction: 'wild', radius: 2.4, height: 4, hp: 220, maxHp: 220, stockWood: 0, stockStone: 0, desc: 'A newer camp. The wilds are spreading.' });
        }
      }
    }
  }

  private updateTower(t: Actor, dt: number) {
    t.attackCooldown = Math.max(0, (t.attackCooldown ?? 0) - dt);
    if (t.attackCooldown > 0) return;
    if (t.structure === 'ward' && t.faction === 'citadel') {
      t.attackCooldown = 2;
      for (const a of this.actors) if (a.alive && sameSpace(a, t) && a.faction === 'citadel' && (a.kind === 'citadel' || a.kind === 'tower') && distance(a, t) < 12) a.hp = Math.min(a.maxHp, a.hp + 3);
      return;
    }
    let target: Actor | undefined, best = 12;
    for (const a of this.chars) {
      if (a.hp <= 0 || !sameSpace(a, t) || (t.faction === 'citadel' ? a.kind !== 'foe' : a.kind !== 'player')) continue;
      const d = distance(a, t);
      if (d < best) { best = d; target = a; }
    }
    if (!target) return;
    t.attackCooldown = 1.1;
    t.facing = angleTo(t, target);
    t.shotAt = this.elapsed; t.shotX = target.x; t.shotZ = target.z;
    this.hurt(target, t.faction === 'wild' ? 9 : 22, t.id);
  }

  // ---------------------------------------------------------------- building & waves
  private validBuild(point: Point, radius: number) {
    if (Math.abs(point.x) > WORLD_LIMIT - radius || Math.abs(point.z) > WORLD_LIMIT - radius) return false;
    const loaded = this.currentSpace === EXTERIOR_SPACE && this.streamer.loadedCells.has(cellKey({ id: 'build-check', ...point }));
    const solids = loaded ? this.solidGrid.query(point.x, point.z, radius + 4, this.qa) : this.actors;
    for (const a of solids) if (spaceOf(a) === EXTERIOR_SPACE && a.alive && a.solid && distance(a, point) < a.radius + radius + 0.3) return false;
    return !this.chars.some((c) => spaceOf(c) === EXTERIOR_SPACE && distance(c, point) < c.radius + radius);
  }
  private findBuildSpot(origin: Point, start: number, end: number, radius: number): Point | null {
    for (let r = start; r <= end; r += 1) for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8;
      const p = { x: origin.x + Math.cos(a) * r, z: origin.z + Math.sin(a) * r };
      if (this.validBuild(p, radius)) return p;
    }
    return null;
  }
  buildPreview(): { point: Point; valid: boolean; affordable: boolean } | null {
    if (!this.placing || this.currentSpace !== EXTERIOR_SPACE) return null;
    const def = BUILDINGS[this.placing];
    const p = this.player;
    const d = p.radius + def.radius + 1.2;
    const point = { x: p.x + Math.sin(p.facing) * d, z: p.z + Math.cos(p.facing) * d };
    return { point, valid: this.validBuild(point, def.radius), affordable: this.stock.wood >= def.wood && this.stock.stone >= def.stone && this.stock.gold >= def.gold };
  }
  confirmBuild() {
    const preview = this.buildPreview();
    if (!preview || !this.placing) return false;
    if (!preview.affordable) { const b = BUILDINGS[this.placing]; this.say(`I need ${b.wood} timber, ${b.stone} stone and ${b.gold} crowns for that.`); return false; }
    if (!preview.valid) { this.say('Not enough room there.'); return false; }
    const ok = this.build(this.placing, preview.point);
    if (ok) this.placing = null;
    return ok;
  }
  build(kind: StructureKind, point: Point) {
    const def = BUILDINGS[kind];
    if (this.stock.wood < def.wood || this.stock.stone < def.stone || this.stock.gold < def.gold || !this.validBuild(point, def.radius)) return false;
    this.stock.wood -= def.wood; this.stock.stone -= def.stone; this.stock.gold -= def.gold;
    const hp = kind === 'barricade' ? 260 : kind === 'outpost' ? 240 : 180;
    this.add(kind === 'barricade' ? 'barricade' : kind === 'outpost' ? 'camp' : 'tower', def.name, point.x, point.z, {
      faction: 'citadel', structure: kind, radius: def.radius, height: kind === 'barricade' ? 1.3 : kind === 'outpost' ? 3 : 5,
      hp, maxHp: hp, attackCooldown: 0, desc: def.description,
    });
    return true;
  }
  startWave() {
    if (this.waveActive || this.player.hp <= 0 || this.citadel.hp <= 0) return;
    if (this.wildCampCount() === 0) { this.say('The bell rings out over an empty valley. No one answers.'); return; }
    this.wave++;
    this.spawnQueue = 3 + this.wave * 2;
    this.spawnTimer = 2;
    this.waveActive = true;
    this.cameraEvents.push({ target: { x: this.camp.x, z: this.camp.z }, duration: 3.2 });
    this.say('The bell carries south. Somewhere past the watch post, something answers.', undefined, 5);
  }

  respawnAtCitadel() {
    if (this.currentSpace !== EXTERIOR_SPACE) this.leaveInterior();
    const p = this.player;
    p.x = 0; p.z = 4; p.vx = p.vz = 0;
    this.hostileUntil = 0;
  }

  recover() {
    if (this.currentSpace !== EXTERIOR_SPACE) this.leaveInterior();
    const p = this.player;
    p.hp = p.maxHp;
    p.x = this.respawn.x; p.z = this.respawn.z; p.y = 0; p.vx = p.vz = p.vy = 0;
    p.action = undefined;
    this.stock.gold = Math.floor(this.stock.gold * 0.9);
    this.hostileUntil = 0;
    if (this.citadel.hp <= 0) this.citadel.hp = Math.floor(this.citadel.maxHp * 0.5);
    for (const a of this.actors) if (a.kind === 'foe' && a.intent === 'raid') { a.alive = false; a.solid = false; }
    this.waveActive = false; this.spawnQueue = 0;
    this.say('You wake, aching, with a lighter purse.');
  }

  // ---------------------------------------------------------------- views
  hud(): HudView {
    const p = this.player;
    const h = this.hour();
    const held = this.held();
    let prompt: Prompt | null = null;
    if (!this.dialogue && !this.placing && p.hp > 0) {
      if (held) prompt = { name: held.name, primary: 'Set down', secondary: 'Throw', crime: false };
      else { const f = this.focus(); if (f) prompt = this.verb(f); }
    }
    const target = this.targetId && this.targetUntil > this.elapsed ? this.byId(this.targetId) : undefined;
    const hh = Math.floor(h), mm = Math.floor(((h % 1) * 60) / 10) * 10;
    return {
      hp: Math.ceil(p.hp), maxHp: p.maxHp, stamina: Math.round(this.stamina), maxStamina: this.maxStamina,
      combat: this.combatUntil > this.elapsed || this.waveActive || this.hostileUntil > this.elapsed,
      prompt,
      subtitle: this.subtitle ? { speaker: this.subtitle.speaker, text: this.subtitle.text } : null,
      notice: this.notice.until > this.elapsed ? this.notice.text : '',
      target: target && target.alive ? { name: target.name, hp: Math.ceil(target.hp), maxHp: target.maxHp } : null,
      marker: this.questTarget(),
      citadel: { x: this.citadel.x, z: this.citadel.z },
      player: { x: p.x, z: p.z },
      wave: this.wave, waveActive: this.waveActive,
      waveEnemies: this.spawnQueue + this.chars.filter((a) => a.kind === 'foe' && a.intent === 'raid').length,
      bounty: Math.ceil(this.bounty), defeated: p.hp <= 0,
      dialogue: this.dialogueView(),
      time: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
      day: Math.floor((8 + this.elapsed / 30) / 24) + 1,
      holding: held ? held.name : null,
      placing: this.placing,
      focus: Math.floor(p.focus ?? 0), maxFocus: p.maxFocus ?? 0, spellsKnown: p.spells?.length ?? 0, sneaking: !!p.sneaking,
    };
  }

  snapshot(): WorldSave {
    const { changeForms, spawned } = createChangeForms(this.initialActors, this.actors);
    return JSON.parse(JSON.stringify({
      version: SAVE_VERSION, seed: this.seed, changeForms, spawned, stock: this.stock, pack: this.pack, elapsed: this.elapsed,
      level: this.level, xp: this.xp, weaponLevel: this.weaponLevel, flags: this.flags, quests: this.quests, tracked: this.tracked,
      wave: this.wave, waveCleared: this.waveCleared, bounty: this.bounty, standing: this.standing, nextId: this.nextId,
      echoProgress: this.echoProgress, echoSolved: this.echoSolved, respawn: this.respawn,
      visitedLocations: this.visitedLocations, metNpcIds: this.metNpcIds,
      siteStates: this.siteStates, nextRadiantQuest: this.nextRadiantQuest, threatSignals: this.threatSignals,
      outsideReturn: this.outsideReturn, uGridsToLoad: this.uGridsToLoad, uExteriorCellBuffer: this.uExteriorCellBuffer,
      deeds: this.deeds, vendettas: this.vendettas,
    })) as WorldSave;
  }

  private restore(s: WorldSave) {
    const legacyActors = Array.isArray(s.actors);
    if (legacyActors) {
      this.actors = s.actors!;
      const ids = new Set(this.actors.map((a) => a.id));
      for (const original of this.initialActors.values()) {
        if (!original.spaceId || ids.has(original.id)) continue;
        const entranceId = original.spaceId.slice('interior:'.length);
        if (!ids.has(entranceId)) continue;
        const added = structuredClone(original);
        this.actors.push(added);
        ids.add(added.id);
      }
    } else if (s.changeForms && typeof s.changeForms === 'object') {
      this.actors = applyChangeForms(this.actors, s.changeForms, Array.isArray(s.spawned) ? s.spawned : []);
    }
    if (!this.actors.some((a) => a.id === PLAYER_ID) || !this.actors.some((a) => a.id === CITADEL_ID)) return;
    for (const actor of this.actors) actor.baseId ??= baseIdFor(actor);
    this.reindex();
    this.stock = { ...this.stock, ...s.stock };
    this.pack = { ...s.pack };
    this.elapsed = s.elapsed; this.level = s.level; this.xp = s.xp; this.weaponLevel = s.weaponLevel;
    this.flags = { ...s.flags };
    this.quests = s.quests && s.quests.light ? s.quests : this.quests;
    this.tracked = s.tracked && this.quests[s.tracked] ? s.tracked : 'light';
    this.wave = s.wave; this.waveCleared = s.waveCleared; this.bounty = s.bounty; this.standing = s.standing;
    this.nextId = Math.max(this.nextId, s.nextId || 0, ...this.actors.map((a) => /^a\d+$/.test(a.id) ? Number(a.id.slice(1)) + 1 : 0));
    this.uGridsToLoad = s.uGridsToLoad ?? uGridsToLoad;
    this.uExteriorCellBuffer = s.uExteriorCellBuffer ?? uExteriorCellBuffer;
    this.outsideReturn = s.outsideReturn;
    this.echoProgress = s.echoProgress ?? 0; this.echoSolved = !!s.echoSolved;
    this.respawn = s.respawn ?? this.respawn;
    this.visitedLocations = Array.isArray(s.visitedLocations) ? [...s.visitedLocations] : ['village'];
    this.siteStates = s.siteStates && typeof s.siteStates === 'object' ? { ...s.siteStates } : {};
    this.nextRadiantQuest = Math.max(s.nextRadiantQuest ?? 1, 1, ...Object.keys(this.quests)
      .filter((id) => id.startsWith('radiant-')).map((id) => (Number(id.slice(8)) || 0) + 1));
    this.threatSignals = Array.isArray(s.threatSignals) ? s.threatSignals.slice(-24) : [];
    this.metNpcIds = Array.isArray(s.metNpcIds) ? [...s.metNpcIds] : [];
    this.deeds = Array.isArray(s.deeds) ? s.deeds : [];
    this.vendettas = Array.isArray(s.vendettas) ? s.vendettas : [];
    const originalCamp = this.actors.find((a) => a.kind === 'camp' && a.name === 'Wild camp');
    if (originalCamp) originalCamp.locationId ??= 'southern-camp';
    this.citadel.neverFade = true;
    for (const [id, quest] of this.radiantQuests()) {
      const data = quest.data!;
      if (data.kind === 'rescue' && !data.siteId) {
        data.siteId = data.dungeonId; data.siteName = data.dungeonName; data.siteActorId = data.dungeonActorId;
      }
      data.aliases ??= { locationId: data.siteId, locationActorId: data.siteActorId };
      if (quest.status === 'active') this.siteStates[data.siteId] = { phase: 'occupied', questId: id, lastUsed: this.siteStates[data.siteId]?.lastUsed };
    }
    if (legacyActors && !this.actors.some((a) => a.kind === 'tavern' && a.alive)) {
      this.add('tavern', 'The Kettle & Crown', TAVERN_POINT.x, TAVERN_POINT.z, {
        radius: 2.15, height: 4.8, solid: true, faction: 'citadel', desc: STATIC_DESC.tavern,
      });
      this.add('table', 'Tavern table', TAVERN_POINT.x, TAVERN_POINT.z + 2.7, { radius: 0.8, height: 0.9, surface: 0.9, desc: 'A scarred table, ringed with old cup marks.' });
      this.spawnItem('stool', TAVERN_POINT.x - 0.85, TAVERN_POINT.z + 2.7, 0, 'tavern');
      this.spawnItem('stool', TAVERN_POINT.x + 0.85, TAVERN_POINT.z + 2.7, 0, 'tavern');
    }
    const houses = this.actors.filter((a) => a.kind === 'house' && a.alive);
    for (const house of houses) house.residents ??= [];
    for (const name of ['Tobin', 'Bran']) {
      const relative = this.npc(name);
      if (relative) relative.familyId ??= 'marlowe';
    }
    if (legacyActors) {
      for (const site of DUNGEON_SITES) {
        if (!this.actors.some((a) => a.kind === 'dungeon' && a.locationId === site.id)) {
          this.add('dungeon', site.name, site.point.x, site.point.z, {
            radius: 1.3, height: 3.6, solid: true, locationId: site.id,
            desc: `A dark entrance into ${site.name.toLowerCase()}. The stone around it is older than the road.`,
          });
        }
      }
      this.createInteriors();
    }
    if (legacyActors) for (const name of ['Tobin', 'Bran']) {
      const owner = this.npc(name);
      if (owner?.home && !this.actors.some((a) => a.kind === 'item' && a.itemType === 'candle' && a.owner === name)) {
        this.spawnItem('candle', owner.home.x + 1, owner.home.z + 0.8, 0, name);
      }
    }
    for (const npc of this.actors.filter((a) => a.kind === 'villager' && a.alive)) {
      if (npc.routine && !npc.packages) npc.packages = makePackages(npc.routine, npc.profession ?? '');
      if (!npc.desires) npc.desires = makeDesires(this.rng, npc.profession ?? '', npc.persona);
      if (!npc.houseId && npc.home && houses.length) {
        const house = houses.reduce((best, candidate) => distance(candidate, npc.home!) < distance(best, npc.home!) ? candidate : best, houses[0]);
        npc.houseId = house.id;
      }
      const house = npc.houseId ? this.byId(npc.houseId) : undefined;
      if (house?.kind === 'house') {
        house.residents ??= [];
        if (!house.residents.includes(npc.id)) house.residents.push(npc.id);
      }
    }
    for (const foe of this.actors) if (foe.kind === 'foe' && foe.foeKind === 'wisp') {
      foe.maxFocus ??= 60;
      foe.focus ??= foe.maxFocus;
    }
    // Raids in progress do not survive a reload; everything else is exactly as it was left.
    for (const a of this.actors) if (a.kind === 'foe' && a.intent === 'raid') { a.alive = false; a.solid = false; }
    this.refreshSiteStates();
    this.reindex();
    this.autoRepair();
  }

  verify(): VerificationIssue[] { return verifyWorld(this, WORLD_LIMIT); }
  private normalizeActorBrains() {
    for (const actor of this.actors) {
      if (actor.kind === 'villager') {
        delete actor.foeKind; delete actor.intent; delete actor.guardPost; delete actor.structure;
        delete actor.carriedWood; delete actor.carriedStone;
      } else if (actor.kind === 'foe') {
        if (!actor.foeKind || !FOES[actor.foeKind]) actor.foeKind = 'slime';
        delete actor.profession; delete actor.utility; delete actor.needs; delete actor.routine;
        delete actor.packages; delete actor.retaliationUntil; delete actor.structure;
      } else if (actor.kind === 'tower' || actor.kind === 'barricade' || actor.kind === 'camp') {
        delete actor.profession; delete actor.foeKind; delete actor.intent; delete actor.utility;
        delete actor.memory; delete actor.needs; delete actor.retaliationUntil;
      }
    }
  }
  autoRepair() { this.normalizeActorBrains(); const report = repairWorld(this, WORLD_LIMIT); this.reindex(); return report; }
  stats() {
    const items = this.actors.filter((a) => a.kind === 'item' && a.alive);
    return { actors: this.actors.length, items: items.length, awake: items.filter((a) => !a.sleeping).length, colliders: this.actors.filter((a) => a.solid && a.alive).length };
  }
}
