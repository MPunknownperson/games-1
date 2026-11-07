// PRESERVE ENGINE — Game logic (world, combat, waves, entities).
// Uses ISO 2.5D world coords. All rendering done by /render.ts and /blocks.ts.
import { TOWERS, ENEMIES, THEMES, THEME_ORDER, type TowerKind, type EnemyKind, type ThemeKind } from './blocks';
import { drawBlock, drawCylinder, drawGroundQuad, drawGroundShadow, drawSphere, drawPanel, shade, withAlpha, worldToScreen, screenToWorldGround, roundedRect, drawSky, drawHaze, drawVignette, type Camera } from './render';
import { drawText, measureText } from './typeface';
import { audio } from './audio';

export type PuzzleKind = 'sigil' | 'oracle' | 'riddle' | 'echo' | 'pulse' | 'shift' | 'gear';
export type ChestRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface Vec3 { x: number; y: number; z: number; }
export interface Vec2 { x: number; y: number; }
export interface Chest { id: string; rarity: ChestRarity; }
export interface Card { id: string; kind: PuzzleKind; rarity: ChestRarity; }

export type TargetingMode = 'first' | 'strongest' | 'last';

export interface Tower {
  id: number; kind: TowerKind;
  x: number; z: number;
  level: number; cooldown: number; kills: number; angle: number;
  targeting?: TargetingMode;
}
export interface Enemy {
  id: number; kind: EnemyKind;
  x: number; z: number;
  hp: number; maxHp: number;
  progress: number; // distance along path
  slowTimer: number; slowAmount: number;
  dead: boolean;
  // AI flavor fields (optional, JSON-serializable)
  lane?: number;     // perpendicular offset from the path centerline
  speedVar?: number; // per-enemy speed variance
  wobble?: number;   // wobble phase
  // Combat AI state
  shield?: number;    // current absorbing shield (golems)
  shieldMax?: number;
  lastHurt?: number;  // time of last damage, gates shield regeneration
  healCd?: number;    // cooldown for support enemies
}
export interface Projectile {
  id: number; from: Vec2; pos: Vec2;
  targetId: number; kind: TowerKind;
  damage: number; speed: number;
  splash?: number; slow?: number; chain?: number;
  life: number; y: number; // world y (for arc)
  arcT?: number;
  crit?: boolean;
}
export interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; maxLife: number;
  color: string; size: number;
}
export interface FloatText {
  x: number; z: number; y: number;
  text: string; life: number; color: string; vy: number;
  size?: number;
}

// ---------- Path & world generation ----------
export function mulberry32(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Stage {
  round: number;
  minor: number;
  theme: ThemeKind;
  path: Vec2[]; // (x,z) waypoints
  waves: WaveDef[];
  targetHp: number;
  startGold: number;
  decorPositions: { x: number; z: number; seed: number }[];
}
export interface WaveDef {
  entries: { kind: EnemyKind; count: number; interval: number; delay: number }[];
}

const WORLD = { xMin: -6, xMax: 6, zMin: -4, zMax: 4 };

export function generateStage(round: number, minor: number, seed: number): Stage {
  const rng = mulberry32(seed + round * 1013 + minor * 17);
  const themeIdx = Math.floor((round - 1) / 2) % THEME_ORDER.length;
  const theme = THEME_ORDER[themeIdx];
  const isMajor = minor === 6;

  // Path from left (spawn) to right (citadel), with 3-5 waypoints
  const points: Vec2[] = [{ x: WORLD.xMin - 0.5, y: (rng() - 0.5) * 4 }];
  const nodes = 3 + Math.floor(rng() * 3);
  for (let i = 1; i <= nodes; i++) {
    const t = i / (nodes + 1);
    points.push({ x: WORLD.xMin + (WORLD.xMax - WORLD.xMin) * t + (rng() - 0.5) * 1.2, y: (rng() - 0.5) * 5 });
  }
  points.push({ x: WORLD.xMax - 0.5, y: 0 });

  const waveCount = isMajor ? 5 : 3 + Math.min(2, Math.floor(round / 3));
  const waves: WaveDef[] = [];
  const pool = buildEnemyPool(round);
  for (let w = 0; w < waveCount; w++) {
    const entries: WaveDef['entries'] = [];
    const base = 4 + w * 2 + Math.floor(round * 1.1);
    for (const ek of pool) {
      const cnt = Math.max(0, Math.floor(base * (0.4 + rng()) * (ENEMIES[ek].hp < 150 ? 1 : 0.4)));
      if (cnt > 0) entries.push({ kind: ek, count: cnt, interval: Math.max(0.35, 0.9 - w * 0.07 - round * 0.02), delay: rng() * 1.5 });
    }
    if (isMajor && w === waveCount - 1) {
      entries.push({ kind: 'behemoth', count: 1 + Math.floor(round / 4), interval: 2, delay: 2.5 });
    }
    waves.push({ entries });
  }

  // Decor positions (not on path)
  const decorPositions: Stage['decorPositions'] = [];
  for (let i = 0; i < 24; i++) {
    let dx = WORLD.xMin + rng() * (WORLD.xMax - WORLD.xMin);
    let dz = WORLD.zMin + rng() * (WORLD.zMax - WORLD.zMin);
    const dToPath = distToPath({ x: dx, y: dz }, points);
    if (dToPath > 0.9) decorPositions.push({ x: dx, z: dz, seed: rng() });
  }

  return {
    round, minor, theme,
    path: points, waves,
    targetHp: 100 + round * 15,
    startGold: 175 + round * 15,
    decorPositions,
  };
}

function buildEnemyPool(round: number): EnemyKind[] {
  const p: EnemyKind[] = ['slime'];
  if (round >= 1) p.push('slime');
  if (round >= 2) p.push('brute');
  if (round >= 3) p.push('wisp');
  if (round >= 4) p.push('runner');
  if (round >= 5) p.push('golem');
  return Array.from(new Set(p));
}

function distToPath(p: Vec2, path: Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const d = distToSegment(p, path[i], path[i + 1]);
    if (d < best) best = d;
  }
  return best;
}
function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

interface PathSegments { seg: { start: Vec2; end: Vec2; length: number }[]; total: number; }
export function buildPath(points: Vec2[]): PathSegments {
  const seg: PathSegments['seg'] = []; let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const s = points[i], e = points[i + 1];
    const len = Math.hypot(e.x - s.x, e.y - s.y);
    seg.push({ start: s, end: e, length: len }); total += len;
  }
  return { seg, total };
}
export function alongPath(path: PathSegments, dist: number): { x: number; z: number; done: boolean; angle: number } {
  let r = dist;
  for (const s of path.seg) {
    if (r <= s.length) {
      const t = r / s.length;
      return { x: s.start.x + (s.end.x - s.start.x) * t, z: s.start.y + (s.end.y - s.start.y) * t, done: false, angle: Math.atan2(s.end.y - s.start.y, s.end.x - s.start.x) };
    }
    r -= s.length;
  }
  const last = path.seg[path.seg.length - 1];
  return { x: last.end.x, z: last.end.y, done: true, angle: 0 };
}

// ---------- Game class ----------
export interface EngineEvents {
  onGoldChange: (g: number) => void;
  onHpChange: (hp: number, max: number) => void;
  onWaveChange: (cur: number, total: number) => void;
  onLoot: (t: 'gold' | 'chest' | 'card', amt?: number) => void;
  onStateChange: (s: 'idle' | 'wave' | 'victory' | 'defeat') => void;
  onShake: (a: number) => void;
}

export class Game {
  stage!: Stage;
  path!: PathSegments;
  towers: Tower[] = [];
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  particles: Particle[] = [];
  floats: FloatText[] = [];
  inventory: { chests: Chest[]; cards: Card[]; keys: number } = { chests: [], cards: [], keys: 0 };
  gold = 0;
  hp = 0; maxHp = 0;
  waveIdx = 0;
  waveActive = false;
  spawnQueue: { kind: EnemyKind; at: number; hpMult: number }[] = [];
  elapsed = 0;
  paused = false;
  speedMult = 1;
  god = false; // dev-tools: citadel takes no damage while true
  nextId = 1;
  selectedKind: TowerKind | null = null;
  selectedTowerId: number | null = null;
  hoverX = 0; hoverZ = 0;
  kills = 0; goldEarned = 0; chestsFound = 0; cardsFound = 0;
  mvpId: number | null = null;
  // Adaptive director state: reacts to how well the player is defending
  leaks = 0;
  pressure = 1;
  waveStart = 0;
  /** In-flight damage per enemy id, used to avoid overkill targeting. */
  private incoming = new Map<number, { dmg: number; t: number }>();
  // Kill-streak combo: consecutive kills build bonus gold
  streak = 0;
  streakTimer = 0;
  // Ambient realm particles (leaves, snow, embers, motes)
  ambient: AmbientParticle[] = [];
  events: EngineEvents;
  rng!: () => number;

  constructor(events: EngineEvents) { this.events = events; }

  load(stage: Stage, inv: { chests: Chest[]; cards: Card[]; keys: number }, carryGold?: number) {
    this.stage = stage;
    this.path = buildPath(stage.path);
    this.towers = []; this.enemies = []; this.projectiles = []; this.particles = []; this.floats = [];
    this.gold = carryGold ?? stage.startGold;
    this.hp = stage.targetHp; this.maxHp = stage.targetHp;
    this.waveIdx = 0; this.waveActive = false; this.spawnQueue = [];
    this.elapsed = 0; this.kills = 0; this.goldEarned = 0; this.chestsFound = 0; this.cardsFound = 0;
    this.mvpId = null;
    this.leaks = 0; this.pressure = 1; this.waveStart = 0;
    this.incoming.clear();
    this.streak = 0; this.streakTimer = 0; this.ambient = [];
    this.inventory = { chests: [...inv.chests], cards: [...inv.cards], keys: inv.keys };
    this.rng = mulberry32(Date.now() & 0xffffffff);
    this.events.onGoldChange(this.gold);
    this.events.onHpChange(this.hp, this.maxHp);
    this.events.onWaveChange(0, stage.waves.length);
    this.events.onStateChange('idle');
  }

  startNextWave() {
    if (this.waveActive || this.waveIdx >= this.stage.waves.length) return;
    const w = this.stage.waves[this.waveIdx];
    // Adaptive director: pressure rises after clean fast clears, eases after leaks
    const diffMult = (1 + (this.stage.round - 1) * 0.3 + (this.stage.minor - 1) * 0.06) * this.pressure;
    this.waveStart = this.elapsed;
    this.spawnQueue = [];
    for (const entry of w.entries) {
      // Pressure makes waves both tougher and denser
      const count = Math.max(1, Math.round(entry.count * (0.7 + this.pressure * 0.5)));
      let t = entry.delay;
      for (let i = 0; i < count; i++) {
        this.spawnQueue.push({ kind: entry.kind, at: this.elapsed + t, hpMult: diffMult });
        t += entry.interval;
      }
    }
    this.waveActive = true;
    this.events.onWaveChange(this.waveIdx + 1, this.stage.waves.length);
    this.events.onStateChange('wave');
    audio.waveStart();
  }

  canPlaceAt(x: number, z: number): boolean {
    // Bounds
    if (x < WORLD.xMin || x > WORLD.xMax || z < WORLD.zMin || z > WORLD.zMax) return false;
    // Not on path
    if (distToPath({ x, y: z }, this.stage.path) < 0.7) return false;
    // Not on other towers
    for (const t of this.towers) if (Math.hypot(t.x - x, t.z - z) < 0.85) return false;
    return true;
  }

  place(kind: TowerKind, x: number, z: number): boolean {
    const def = TOWERS[kind];
    if (this.gold < def.cost) { audio.err(); return false; }
    if (!this.canPlaceAt(x, z)) { audio.err(); return false; }
    this.towers.push({ id: this.nextId++, kind, x, z, level: 1, cooldown: 0, kills: 0, angle: 0 });
    this.gold -= def.cost;
    this.events.onGoldChange(this.gold);
    audio.towerPlace();
    this.burst(x, 0.3, z, def.color, 10);
    return true;
  }

  upgradeCost(t: Tower) { return Math.floor(TOWERS[t.kind].cost * (0.6 + t.level * 0.5)); }
  towerStats(t: Tower) {
    const d = TOWERS[t.kind];
    const m = 1 + (t.level - 1) * 0.35;
    return {
      damage: d.damage * m, range: d.range * (1 + (t.level - 1) * 0.12),
      fireRate: d.fireRate * (1 + (t.level - 1) * 0.15),
      splash: d.splash ? d.splash * (1 + (t.level - 1) * 0.2) : undefined,
      slow: d.slow, chain: d.chain, projectileSpeed: d.projectileSpeed,
      color: d.color, accent: d.accent,
    };
  }
  upgrade(id: number): boolean {
    const t = this.towers.find((x) => x.id === id); if (!t) return false;
    if (t.level >= 4) return false;
    const c = this.upgradeCost(t);
    if (this.gold < c) { audio.err(); return false; }
    this.gold -= c; t.level++;
    this.events.onGoldChange(this.gold);
    audio.upgrade();
    this.burst(t.x, 0.5, t.z, '#fbbf24', 16);
    return true;
  }

  cycleTargeting(id: number): TargetingMode | null {
    const t = this.towers.find((x) => x.id === id);
    if (!t) return null;
    const order: TargetingMode[] = ['first', 'strongest', 'last'];
    const cur: TargetingMode = t.targeting ?? TOWERS[t.kind].targeting ?? 'first';
    const next = order[(order.indexOf(cur) + 1) % order.length];
    t.targeting = next;
    audio.click();
    return next;
  }
  sell(id: number): number {
    const i = this.towers.findIndex((x) => x.id === id); if (i < 0) return 0;
    const t = this.towers[i];
    let spent = TOWERS[t.kind].cost;
    for (let j = 1; j < t.level; j++) spent += Math.floor(TOWERS[t.kind].cost * (0.6 + j * 0.5));
    const refund = Math.floor(spent * 0.65);
    this.gold += refund; this.towers.splice(i, 1);
    this.events.onGoldChange(this.gold);
    audio.click();
    this.floats.push({ x: t.x, z: t.z, y: 0.5, text: `+${refund}`, life: 1, color: '#fbbf24', vy: -0.6 });
    return refund;
  }

  burst(x: number, y: number, z: number, color: string, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * 3;
      this.particles.push({
        x, y, z,
        vx: Math.cos(a) * s * 0.4, vy: Math.random() * 2 + 0.5, vz: Math.sin(a) * s * 0.4,
        life: 0.5 + Math.random() * 0.5, maxLife: 1, color, size: 2 + Math.random() * 3,
      });
    }
  }

  update(dtIn: number) {
    if (this.paused) return;
    const dt = dtIn * this.speedMult;
    this.elapsed += dt;

    // Spawns
    if (this.waveActive) {
      const due = this.spawnQueue.filter((q) => q.at <= this.elapsed);
      this.spawnQueue = this.spawnQueue.filter((q) => q.at > this.elapsed);
      for (const q of due) this.spawn(q.kind, q.hpMult);
      if (this.spawnQueue.length === 0 && this.enemies.length === 0) {
        this.waveActive = false; this.waveIdx++;
        if (this.waveIdx >= this.stage.waves.length) {
          this.events.onStateChange('victory');
        } else {
          this.events.onStateChange('idle');
          const clearTime = this.elapsed - this.waveStart;
          if (this.leaks === 0 && clearTime < 14) this.pressure = Math.min(1.5, this.pressure + 0.07);
          else if (this.leaks >= 3) this.pressure = Math.max(0.75, this.pressure - 0.1);
          this.leaks = 0;
          const bonus = 25 + this.stage.round * 3;
          this.gold += bonus; this.goldEarned += bonus;
          this.events.onGoldChange(this.gold);
          this.floats.push({ x: 0, z: 0, y: 3, text: `Wave Clear +${bonus}`, life: 2, color: '#fbbf24', vy: -0.3 });
        }
      }
    }

    // Commander auras: bosses spur every enemy inside their radius onward
    const auraBoost = new Map<number, number>();
    for (const b of this.enemies) {
      const aura = ENEMIES[b.kind].aura;
      if (!aura || b.dead) continue;
      for (const o of this.enemies) {
        if (o.dead) continue;
        if (Math.hypot(o.x - b.x, o.z - b.z) > aura.radius) continue;
        auraBoost.set(o.id, Math.max(auraBoost.get(o.id) ?? 1, aura.speedMult));
      }
    }
    // Expire stale in-flight damage estimates used by overkill avoidance
    for (const [id, rec] of this.incoming) if (rec.t <= this.elapsed - 2) this.incoming.delete(id);

    // Enemies
    for (const e of this.enemies) {
      if (e.dead) continue;
      let speed = ENEMIES[e.kind].speed * (e.speedVar ?? 1);
      const boost = auraBoost.get(e.id);
      if (boost !== undefined) speed *= boost;
      // Runners move in dash bursts instead of a constant pace
      if (e.kind === 'runner') {
        const ph = (this.elapsed * 0.4 + (e.wobble ?? 0)) % 1;
        if (ph < 0.35) speed *= 1.7;
      }
      if (e.slowTimer > 0) { speed *= 1 - e.slowAmount; e.slowTimer -= dt; }
      e.progress += speed * dt;
      const p = alongPath(this.path, e.progress);
      // Lane offset + gentle wobble keep enemies off the exact centerline
      const nx = -Math.sin(p.angle), nz = Math.cos(p.angle);
      const lane = (e.lane ?? 0) + Math.sin(this.elapsed * 3 + (e.wobble ?? 0)) * 0.06;
      e.x = p.x + nx * lane;
      e.z = p.z + nz * lane;

      // Regenerating shields recover once an enemy has avoided damage briefly
      if (e.shieldMax !== undefined && e.shield !== undefined && e.shield < e.shieldMax) {
        if (this.elapsed - (e.lastHurt ?? -99) > 3) {
          e.shield = Math.min(e.shieldMax, e.shield + 14 * dt);
        }
      }

      // Support AI: mend the most injured ally within reach
      const healDef = ENEMIES[e.kind].heal;
      if (healDef) {
        e.healCd = (e.healCd ?? 0) - dt;
        if (e.healCd <= 0) {
          let patient: Enemy | null = null;
          let worst = 0.2;
          for (const o of this.enemies) {
            if (o.dead || o.id === e.id) continue;
            if (Math.hypot(o.x - e.x, o.z - e.z) > healDef.radius) continue;
            const missing = 1 - o.hp / o.maxHp;
            if (missing > worst) { worst = missing; patient = o; }
          }
          if (patient) {
            patient.hp = Math.min(patient.maxHp, patient.hp + healDef.amount);
            e.healCd = healDef.interval;
            this.particles.push({ x: e.x, y: 0.7, z: e.z, vx: 0, vy: 0.5, vz: 0, life: 0.45, maxLife: 0.45, color: '#a7f3d0', size: 4 });
            this.floats.push({ x: patient.x, z: patient.z, y: 0.95, text: `+${healDef.amount}`, life: 0.7, color: '#6ee7b7', vy: -0.45 });
          } else {
            e.healCd = 0.4;
          }
        }
      }

      if (p.done) {
        e.dead = true;
        this.leaks++;
        if (!this.god) {
          const dmg = Math.ceil(5 + ENEMIES[e.kind].hp / 25);
          this.hp = Math.max(0, this.hp - dmg);
          this.events.onHpChange(this.hp, this.maxHp);
          audio.targetHit();
          this.events.onShake(10);
          this.burst(p.x, 0.5, p.z, '#ef4444', 20);
          this.floats.push({ x: p.x, z: p.z, y: 1, text: `-${dmg}`, life: 1, color: '#ef4444', vy: -0.5 });
          if (this.hp <= 0) this.events.onStateChange('defeat');
        }
      }
    }
    // Separation steering: overlapping enemies push each other apart
    const alive = this.enemies.filter((e) => !e.dead);
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i], b = alive[j];
        const dx = b.x - a.x, dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.001 && d < 0.45) {
          const push = (0.45 - d) / 2;
          const ux = dx / d, uz = dz / d;
          a.x -= ux * push; a.z -= uz * push;
          b.x += ux * push; b.z += uz * push;
        }
      }
    }

    // Towers — each kind has a targeting priority (first / last / strongest)
    for (const t of this.towers) {
      t.cooldown -= dt;
      const st = this.towerStats(t);
      const mode = t.targeting ?? TOWERS[t.kind].targeting ?? 'first';
      let best: Enemy | null = null; let key = -Infinity;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - t.x, e.z - t.z);
        if (d > st.range) continue;
        // Overkill avoidance: skip targets already covered by in-flight shots
        const eff = this.effectiveHp(e);
        if (eff <= 0) continue;
        const k = mode === 'last' ? -e.progress : mode === 'strongest' ? eff : e.progress;
        if (k > key) { key = k; best = e; }
      }
      if (best) {
        const dz = best.z - t.z, dx = best.x - t.x;
        t.angle = Math.atan2(dz * 0.5, dx * 0.866);
        if (t.cooldown <= 0) {
          t.cooldown = 1 / st.fireRate;
          this.fire(t, best, st);
        }
      }
    }

    // Projectiles — arcing motion for a 2.5D feel
    for (const p of this.projectiles) {
      p.life -= dt;
      const target = this.enemies.find((e) => e.id === p.targetId && !e.dead);
      if (!target) { p.life = 0; continue; }
      const dx = target.x - p.pos.x, dz = target.z - p.pos.y;
      const dist = Math.hypot(dx, dz);
      const step = p.speed * dt;
      if (dist <= step + 0.2) {
        this.hitEnemy(target, p.damage, p.kind, p.crit);
        if (p.splash) {
          for (const e of this.enemies) {
            if (e.dead || e.id === target.id) continue;
            if (Math.hypot(e.x - target.x, e.z - target.z) <= p.splash) this.hitEnemy(e, p.damage * 0.6, p.kind);
          }
          this.burst(target.x, 0.4, target.z, '#f97316', 18);
          audio.cannonImpact();
        }
        if (p.slow) { target.slowTimer = 2.5; target.slowAmount = p.slow; }
        if (p.chain && p.chain > 0) {
          let from = target; let remaining = p.chain;
          const hit = new Set<number>([target.id]);
          while (remaining > 0) {
            let next: Enemy | null = null; let nd = 2;
            for (const e of this.enemies) {
              if (e.dead || hit.has(e.id)) continue;
              const d = Math.hypot(e.x - from.x, e.z - from.z);
              if (d < nd) { nd = d; next = e; }
            }
            if (!next) break;
            hit.add(next.id);
            this.hitEnemy(next, p.damage * 0.7, p.kind);
            // Chain visual
            for (let i = 0; i < 6; i++) {
              const t = i / 6;
              this.particles.push({
                x: from.x + (next.x - from.x) * t + (Math.random() - 0.5) * 0.15,
                y: 0.5, z: from.z + (next.z - from.z) * t + (Math.random() - 0.5) * 0.15,
                vx: 0, vy: 0, vz: 0, life: 0.15, maxLife: 0.15, color: '#fef3c7', size: 3,
              });
            }
            from = next; remaining--;
          }
        }
        p.life = 0;
      } else {
        p.pos.x += (dx / dist) * step;
        p.pos.y += (dz / dist) * step;
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.life > 0);
    this.enemies = this.enemies.filter((e) => !e.dead);

    // Particles (3D-ish with gravity)
    for (const pt of this.particles) {
      pt.life -= dt;
      pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.z += pt.vz * dt;
      pt.vy -= 5 * dt;
      if (pt.y < 0) { pt.y = 0; pt.vy = -pt.vy * 0.3; pt.vx *= 0.6; pt.vz *= 0.6; }
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    for (const f of this.floats) { f.life -= dt; f.y += f.vy * dt * 3; f.vy *= 0.98; }
    this.floats = this.floats.filter((f) => f.life > 0);

    // Kill-streak decay
    if (this.streakTimer > 0) { this.streakTimer -= dt; if (this.streakTimer <= 0) this.streak = 0; }
    // Ambient realm particles
    this.updateAmbient(dt);

    // BGM tension
    const t = Math.min(1, this.enemies.length / 15) * 0.5 + (this.waveActive ? 0.3 : 0) + (this.hp / this.maxHp < 0.3 ? 0.3 : 0);
    audio.setTension(t);
  }

  /** Remaining HP plus shield, minus damage already in flight. */
  private effectiveHp(e: Enemy): number {
    const rec = this.incoming.get(e.id);
    const pending = rec && rec.t > this.elapsed - 2 ? rec.dmg : 0;
    return Math.max(0, e.hp + (e.shield ?? 0) - pending);
  }

  private fire(t: Tower, target: Enemy, st: ReturnType<Game['towerStats']>) {
    // Crit chance: a lucky shot deals bonus damage with a distinct popup
    const crit = this.rng() < (TOWERS[t.kind].critChance ?? 0.08);
    const mult = crit ? 1.5 : 1;
    const dmg = st.damage * mult;
    // Record the shot so other towers do not pile onto a dying target
    const rec = this.incoming.get(target.id) ?? { dmg: 0, t: 0 };
    rec.dmg += dmg;
    rec.t = this.elapsed;
    this.incoming.set(target.id, rec);
    this.projectiles.push({
      id: this.nextId++, from: { x: t.x, y: t.z }, pos: { x: t.x, y: t.z },
      targetId: target.id, kind: t.kind,
      damage: dmg, speed: st.projectileSpeed,
      splash: st.splash, slow: st.slow, chain: st.chain,
      life: 3, y: 0.7, crit,
    });
    switch (t.kind) {
      case 'archer': audio.laser(); break;
      case 'mortar': audio.cannonFire(); break;
      case 'chill': audio.chillShot(); break;
      case 'prism': audio.prismShot(); break;
      case 'storm': audio.stormShot(); break;
    }
  }

  spawn(kind: EnemyKind, hpMult: number, progress = 0): Enemy {
    const d = ENEMIES[kind];
    const hp = Math.floor(d.hp * hpMult);
    const e: Enemy = {
      id: this.nextId++, kind,
      x: this.path.seg[0].start.x, z: this.path.seg[0].start.y,
      hp, maxHp: hp, progress, slowTimer: 0, slowAmount: 0, dead: false,
      lane: (this.rng() - 0.5) * 0.5,
      speedVar: 0.9 + this.rng() * 0.2,
      wobble: this.rng() * Math.PI * 2,
      shield: d.shield,
      shieldMax: d.shield,
      lastHurt: -99,
      healCd: this.rng() * 1.5,
    };
    this.enemies.push(e);
    return e;
  }

  private updateAmbient(dt: number) {
    const cfg = AMBIENT[this.stage.theme] ?? AMBIENT.meadow;
    while (this.ambient.length < cfg.count) this.ambient.push(this.newAmbient(cfg));
    const spanX = WORLD.xMax - WORLD.xMin, spanZ = WORLD.zMax - WORLD.zMin;
    for (const a of this.ambient) {
      if (cfg.kind === 'fall') {
        a.y -= a.vy * dt;
        a.x += (a.vx + Math.sin(this.elapsed * 0.8 + a.phase) * 0.3) * dt;
        if (a.y < 0) { a.y = 3; a.x = WORLD.xMin + this.rng() * spanX; a.z = WORLD.zMin + this.rng() * spanZ; }
      } else if (cfg.kind === 'rise') {
        a.y += a.vy * dt;
        a.x += Math.sin(this.elapsed * 0.6 + a.phase) * 0.2 * dt;
        if (a.y > 3) { a.y = 0; a.x = WORLD.xMin + this.rng() * spanX; a.z = WORLD.zMin + this.rng() * spanZ; }
      } else {
        a.x += a.vx * dt;
        if (a.x > WORLD.xMax) a.x = WORLD.xMin;
        else if (a.x < WORLD.xMin) a.x = WORLD.xMax;
        a.y += Math.sin(this.elapsed + a.phase) * 0.15 * dt;
      }
    }
  }

  private newAmbient(cfg: { kind: 'fall' | 'drift' | 'rise'; colors: string[]; count: number }): AmbientParticle {
    return {
      x: WORLD.xMin + this.rng() * (WORLD.xMax - WORLD.xMin),
      z: WORLD.zMin + this.rng() * (WORLD.zMax - WORLD.zMin),
      y: this.rng() * 3,
      vx: (this.rng() - 0.5) * 0.4,
      vy: 0.3 + this.rng() * 0.5,
      size: 1 + this.rng() * 2,
      color: cfg.colors[Math.floor(this.rng() * cfg.colors.length)],
      phase: this.rng() * Math.PI * 2,
    };
  }

  hitEnemy(e: Enemy, dmgIn: number, _kind: TowerKind, crit = false) {
    if (e.dead) return;
    let dmg = dmgIn;
    // Shields soak damage first and reset the regeneration delay
    if (e.shield !== undefined && e.shield > 0) {
      e.lastHurt = this.elapsed;
      const absorbed = Math.min(e.shield, dmg);
      e.shield -= absorbed;
      dmg -= absorbed;
      this.burst(e.x, 0.55, e.z, '#93c5fd', 4);
      if (dmg <= 0) { audio.enemyHit(); return; }
    }
    e.hp -= dmg;
    audio.enemyHit();
    this.burst(e.x, 0.3, e.z, ENEMIES[e.kind].color, 3);
    this.floats.push({ x: e.x, z: e.z, y: 0.7, text: crit ? `${Math.floor(dmg)}!` : `${Math.floor(dmg)}`, life: 0.7, color: crit ? '#ffffff' : '#fef3c7', vy: -0.5, size: crit ? 26 : undefined });
    if (e.hp <= 0) {
      e.dead = true; this.kills++;
      const def = ENEMIES[e.kind];
      this.gold += def.bounty; this.goldEarned += def.bounty;
      this.events.onGoldChange(this.gold);
      this.events.onLoot('gold', def.bounty);
      this.floats.push({ x: e.x, z: e.z, y: 0.5, text: `+${def.bounty}`, life: 1, color: '#fbbf24', vy: -0.6 });
      this.burst(e.x, 0.3, e.z, '#fbbf24', 8);
      // Kill-streak: reward aggressive defense with bonus gold + milestone popups
      this.streak++;
      this.streakTimer = 2.5;
      const cap = Math.min(this.streak, 20);
      const extra = Math.floor(def.bounty * 0.05 * cap);
      if (extra > 0) { this.gold += extra; this.goldEarned += extra; this.events.onGoldChange(this.gold); }
      if (this.streak === 3 || this.streak === 5 || this.streak === 8 || this.streak === 12 || this.streak === 20) {
        this.floats.push({ x: e.x, z: e.z, y: 1.25, text: `Combo x${this.streak}`, life: 1.1, color: '#fff2c2', vy: -0.55, size: 30 });
      }
      audio.gold();
      if (this.rng() < def.chestChance) {
        const rarities: ChestRarity[] = ['common', 'common', 'rare', 'epic', 'legendary'];
        const rar = rarities[Math.min(rarities.length - 1, Math.floor(this.rng() * rarities.length))];
        this.inventory.chests.push({ id: `c${Date.now()}${Math.random()}`, rarity: rar });
        this.chestsFound++; this.events.onLoot('chest');
        audio.chestDrop();
      }
      if (this.rng() < def.cardChance) {
        const kinds: PuzzleKind[] = ['sigil', 'oracle', 'riddle', 'echo', 'pulse', 'shift', 'gear'];
        const rarities: ChestRarity[] = ['common', 'common', 'rare', 'epic'];
        this.inventory.cards.push({ id: `k${Date.now()}${Math.random()}`, kind: kinds[Math.floor(this.rng() * kinds.length)], rarity: rarities[Math.floor(this.rng() * rarities.length)] });
        this.cardsFound++; this.events.onLoot('card');
        audio.cardDrop();
      }
      // MVP credit
      let closest: Tower | null = null; let cd = 3;
      for (const t of this.towers) {
        const d = Math.hypot(t.x - e.x, t.z - e.z);
        if (d < cd) { cd = d; closest = t; }
      }
      if (closest) {
        closest.kills++;
        if (!this.mvpId) this.mvpId = closest.id;
        else { const cur = this.towers.find((x) => x.id === this.mvpId); if (cur && closest.kills > cur.kills) this.mvpId = closest.id; }
      }
    }
  }
}

// ---------- Rendering ----------
export function renderWorld(ctx: CanvasRenderingContext2D, game: Game, cam: Camera, time: number) {
  const theme = THEMES[game.stage.theme];
  // Sky: realm gradient plus celestial body, star field and horizon haze
  drawSky(ctx, cam, theme, time);
  drawSkyline(ctx, cam, theme);
  if (theme.haze) drawHaze(ctx, cam, theme.haze);

  // 3D raised island plinth beneath the terrain so the board reads as a solid 2.5D diorama
  drawIslandPlinth(ctx, cam, theme.groundTile, theme.pathBorder);

  // Ground grid — per-tile brightness variation, subtle seams & placement feedback
  const step = 1;
  const seam = withAlpha('#0d1220', 0.14);
  for (let z = WORLD.zMin; z <= WORLD.zMax; z += step) {
    for (let x = WORLD.xMin; x <= WORLD.xMax; x += step) {
      const checker = ((Math.floor(x) + Math.floor(z)) % 2 === 0);
      const base = checker ? theme.ground : theme.groundTile;
      const c = shade(base, (tileHash(x, z) - 0.5) * 0.18);
      drawGroundQuad(ctx, cam, x, z, step, step, c, seam);
      if (tileHash(x + 0.5, z + 0.5) > 0.8) drawGroundDetail(ctx, cam, x, z, base);
    }
  }

  // Subtle buildable-tile highlight near cursor while placing a tower
  if (game.selectedKind) {
    for (let z = WORLD.zMin; z <= WORLD.zMax; z += step) {
      for (let x = WORLD.xMin; x <= WORLD.xMax; x += step) {
        const cx = x + 0.5, cz = z + 0.5;
        if (Math.hypot(cx - game.hoverX, cz - game.hoverZ) <= 2.4) {
          const ok = game.canPlaceAt(cx, cz);
          drawGroundQuad(ctx, cam, x + 0.06, z + 0.06, 0.88, 0.88,
            ok ? 'rgba(74,222,128,0.18)' : 'rgba(239,68,68,0.14)',
            ok ? 'rgba(74,222,128,0.45)' : 'rgba(239,68,68,0.3)');
        }
      }
    }
  }

  // Path (thick ribbon on ground)
  drawPathRibbon(ctx, cam, game.stage.path, theme.path, theme.pathBorder);

  // Decor
  for (const d of game.stage.decorPositions) theme.decor(ctx, cam, d.x, d.z, d.seed);

  // Depth-sort: towers, enemies, projectiles, particles by (x + z)
  interface Item { depth: number; draw: () => void; }
  const items: Item[] = [];

  // Towers
  for (const t of game.towers) {
    const st = game.towerStats(t);
    items.push({
      depth: t.x + t.z,
      draw: () => TOWERS[t.kind].render(ctx, cam, t.x, t.z, t.angle, t.level, st.color, st.accent),
    });
    // Selected range indicator
    if (game.selectedTowerId === t.id) {
      items.push({ depth: t.x + t.z - 0.01, draw: () => drawRangeCircle(ctx, cam, t.x, t.z, st.range, st.color) });
    }
  }
  // Placement ghost
  if (game.selectedKind) {
    const canPlace = game.canPlaceAt(game.hoverX, game.hoverZ);
    const def = TOWERS[game.selectedKind];
    items.push({
      depth: game.hoverX + game.hoverZ - 0.02,
      draw: () => {
        drawRangeCircle(ctx, cam, game.hoverX, game.hoverZ, def.range, canPlace ? def.color : '#ef4444');
        ctx.globalAlpha = 0.65;
        def.render(ctx, cam, game.hoverX, game.hoverZ, 0, 1, canPlace ? def.color : '#ef4444', canPlace ? def.accent : '#fecaca');
        ctx.globalAlpha = 1;
      },
    });
  }

  // Enemies
  for (const e of game.enemies) {
    items.push({
      depth: e.x + e.z,
      draw: () => {
        const def = ENEMIES[e.kind];
        if (def.aura) drawAuraRing(ctx, cam, e.x, e.z, def.aura.radius, time, def.accent);
        def.render(ctx, cam, e.x, e.z, time, def.color, def.accent);
        if (e.shield !== undefined && e.shield > 0) {
          drawShieldArc(ctx, cam, e.x, e.z, def.size, e.shield / (e.shieldMax ?? 1));
        }
        // Health bar sized to the enemy, with a shield segment layered above
        const p = worldToScreen(cam, e.x, def.size * 2.2 + 0.4, e.z);
        const barW = Math.max(26, def.size * 64);
        drawHpBar(ctx, p.x, p.y, barW, 5, e.hp / e.maxHp);
        if (e.shield !== undefined && e.shield > 0) {
          drawHpBar(ctx, p.x, p.y - 8, barW, 3, e.shield / (e.shieldMax ?? 1), '#7dd3fc');
        }
      },
    });
  }

  // Citadel (target) at final waypoint
  const end = game.stage.path[game.stage.path.length - 1];
  items.push({
    depth: end.x + end.y + 0.5,
    draw: () => drawCitadel(ctx, cam, end.x, end.y, theme.accent, game.hp / game.maxHp, time),
  });

  // Spawn portal at start
  const start = game.stage.path[0];
  items.push({
    depth: start.x + start.y,
    draw: () => drawPortal(ctx, cam, Math.max(WORLD.xMin, start.x), start.y, time),
  });

  // Projectiles
  for (const p of game.projectiles) {
    items.push({
      depth: p.pos.x + p.pos.y,
      draw: () => drawProjectile(ctx, cam, p),
    });
  }

  // Sort by depth (back → front)
  items.sort((a, b) => a.depth - b.depth);
  for (const i of items) i.draw();

  // Particles (drawn on top)
  for (const pt of game.particles) {
    const a = Math.max(0, pt.life / pt.maxLife);
    const p = worldToScreen(cam, pt.x, pt.y, pt.z);
    ctx.globalAlpha = a;
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, pt.size * a * cam.zoom * 0.02, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Ambient realm particles
  for (const a of game.ambient) {
    const p = worldToScreen(cam, a.x, a.y, a.z);
    const r = (a.size * 0.5) * cam.zoom * 0.02 + 1;
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = a.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Float text
  for (const f of game.floats) {
    const p = worldToScreen(cam, f.x, f.y, f.z);
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life));
    const size = f.size ?? 22;
    drawText(ctx, f.text, { x: p.x, y: p.y, size, color: f.color, align: 'center', outline: '#0d1220', outlineWidth: 4, strokeWidth: 3 });
  }
  ctx.globalAlpha = 1;

  // Realm vignette frames the field and ties the HUD to the scene
  if (theme.vignette) drawVignette(ctx, cam, theme.vignette);
}

function drawSkyline(ctx: CanvasRenderingContext2D, cam: Camera, theme: any) {
  ctx.fillStyle = shade(theme.sky[1], 0.15);
  ctx.beginPath();
  const baseY = cam.screenH * 0.55;
  ctx.moveTo(0, cam.screenH);
  ctx.lineTo(0, baseY);
  for (let x = 0; x <= cam.screenW; x += 80) {
    const h = 30 + Math.sin(x * 0.01) * 20 + Math.cos(x * 0.03) * 12;
    ctx.lineTo(x, baseY - h);
  }
  ctx.lineTo(cam.screenW, cam.screenH);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shade(theme.sky[1], 0.05);
  ctx.beginPath();
  const baseY2 = cam.screenH * 0.62;
  ctx.moveTo(0, cam.screenH); ctx.lineTo(0, baseY2);
  for (let x = 0; x <= cam.screenW; x += 60) {
    const h = 40 + Math.sin(x * 0.02 + 1) * 25;
    ctx.lineTo(x, baseY2 - h);
  }
  ctx.lineTo(cam.screenW, cam.screenH);
  ctx.closePath(); ctx.fill();
}

function drawIslandPlinth(ctx: CanvasRenderingContext2D, cam: Camera, topColor: string, rimColor: string) {
  const x0 = WORLD.xMin, x1 = WORLD.xMax + 1;
  const z0 = WORLD.zMin, z1 = WORLD.zMax + 1;
  const depth = 0.62;

  const t01 = worldToScreen(cam, x0, 0, z1);
  const t11 = worldToScreen(cam, x1, 0, z1);
  const t10 = worldToScreen(cam, x1, 0, z0);

  const b01 = worldToScreen(cam, x0, -depth, z1);
  const b11 = worldToScreen(cam, x1, -depth, z1);
  const b10 = worldToScreen(cam, x1, -depth, z0);

  // Front-left cliff wall (along z = z1)
  ctx.fillStyle = shade(rimColor, -0.25);
  ctx.beginPath();
  ctx.moveTo(t01.x, t01.y); ctx.lineTo(t11.x, t11.y);
  ctx.lineTo(b11.x, b11.y); ctx.lineTo(b01.x, b01.y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#0d1220'; ctx.lineWidth = 2; ctx.stroke();

  // Front-right cliff wall (along x = x1)
  ctx.fillStyle = shade(rimColor, -0.42);
  ctx.beginPath();
  ctx.moveTo(t11.x, t11.y); ctx.lineTo(t10.x, t10.y);
  ctx.lineTo(b10.x, b10.y); ctx.lineTo(b11.x, b11.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Subtle top lip highlight
  ctx.strokeStyle = shade(topColor, 0.2);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(t01.x, t01.y); ctx.lineTo(t11.x, t11.y); ctx.lineTo(t10.x, t10.y);
  ctx.stroke();
}

function drawPathRibbon(ctx: CanvasRenderingContext2D, cam: Camera, path: Vec2[], color: string, border: string) {
  const width = 0.68;
  const curbWidth = 0.8;

  const drawLayer = (w: number, fill: string) => {
    ctx.fillStyle = fill;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      const dx = b.x - a.x, dz = b.y - a.y;
      const len = Math.hypot(dx, dz);
      if (len === 0) continue;
      const nx = -dz / len, nz = dx / len;
      const q0 = worldToScreen(cam, a.x + nx * w, 0.02, a.y + nz * w);
      const q1 = worldToScreen(cam, a.x - nx * w, 0.02, a.y - nz * w);
      const q2 = worldToScreen(cam, b.x - nx * w, 0.02, b.y - nz * w);
      const q3 = worldToScreen(cam, b.x + nx * w, 0.02, b.y + nz * w);
      ctx.beginPath();
      ctx.moveTo(q0.x, q0.y); ctx.lineTo(q3.x, q3.y); ctx.lineTo(q2.x, q2.y); ctx.lineTo(q1.x, q1.y);
      ctx.closePath();
      ctx.fill();
    }
    // Rounded joints at waypoints so corners never gap
    for (const pt of path) {
      const p = worldToScreen(cam, pt.x, 0.02, pt.y);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, w * cam.zoom * 0.96, w * cam.zoom * 0.52, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  drawLayer(curbWidth, border);
  drawLayer(width, color);

  // Paving stones & centerline
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    ctx.fillStyle = shade(color, -0.18);
    for (let k = 0; k < 4; k++) {
      const tt = (k + 0.5) / 4;
      const mx = a.x + (b.x - a.x) * tt + (tileHash(k, i) - 0.5) * width * 1.1;
      const mz = a.y + (b.y - a.y) * tt + (tileHash(i, k) - 0.5) * width * 1.1;
      const mp = worldToScreen(cam, mx, 0.03, mz);
      ctx.beginPath(); ctx.ellipse(mp.x, mp.y, Math.max(1.5, cam.zoom * 0.05), Math.max(1, cam.zoom * 0.03), 0, 0, Math.PI * 2); ctx.fill();
    }
    const mid0 = worldToScreen(cam, a.x, 0.03, a.y);
    const mid1 = worldToScreen(cam, b.x, 0.03, b.y);
    ctx.strokeStyle = shade(color, 0.22);
    ctx.setLineDash([7, 11]);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(mid0.x, mid0.y); ctx.lineTo(mid1.x, mid1.y); ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawCitadel(ctx: CanvasRenderingContext2D, cam: Camera, x: number, z: number, accent: string, hpPct: number, time: number) {
  drawGroundShadow(ctx, cam, x, z, 0.8);
  // Base platform
  drawBlock(ctx, cam, x - 0.7, 0, z - 0.7, 1.4, 0.2, 1.4, '#334155');
  // Rings of walls (2.5D castle)
  drawBlock(ctx, cam, x - 0.55, 0.2, z - 0.55, 1.1, 0.35, 1.1, '#64748b');
  // Center tower
  drawCylinder(ctx, cam, x, 0.55, z, 0.35, 0.9, '#e2e8f0');
  // Top rune (pulsing)
  const pulse = 0.9 + Math.sin(time * 3) * 0.1;
  drawSphere(ctx, cam, x, 1.45, z, 0.22 * pulse, accent);
  // 4 corner turrets
  const off = 0.42;
  for (const [dx, dz] of [[-off, -off], [off, -off], [-off, off], [off, off]]) {
    drawCylinder(ctx, cam, x + dx, 0.55, z + dz, 0.11, 0.55, '#94a3b8');
    drawSphere(ctx, cam, x + dx, 1.1, z + dz, 0.09, accent);
  }
  // HP ring above
  const top = worldToScreen(cam, x, 1.9, z);
  const r = 30;
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 8;
  ctx.beginPath(); ctx.arc(top.x, top.y, r, -Math.PI / 2, Math.PI * 3 / 2); ctx.stroke();
  ctx.strokeStyle = hpPct > 0.5 ? '#4ade80' : hpPct > 0.25 ? '#fbbf24' : '#ef4444';
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(top.x, top.y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hpPct); ctx.stroke();
}

function drawPortal(ctx: CanvasRenderingContext2D, cam: Camera, x: number, z: number, time: number) {
  drawGroundShadow(ctx, cam, x, z, 0.5);
  drawBlock(ctx, cam, x - 0.4, 0, z - 0.4, 0.8, 0.15, 0.8, '#1e293b');
  // Arch
  const base = worldToScreen(cam, x, 0.15, z);
  const top = worldToScreen(cam, x, 1.2, z);
  ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(base.x - 30, base.y);
  ctx.quadraticCurveTo(top.x, top.y - 20, base.x + 30, base.y);
  ctx.stroke();
  // Portal glow
  const cy = (base.y + top.y) / 2;
  const grad = ctx.createRadialGradient(base.x, cy, 4, base.x, cy, 32);
  grad.addColorStop(0, 'rgba(239,68,68,0.9)');
  grad.addColorStop(0.6, `rgba(239,68,68,${0.4 + Math.sin(time * 4) * 0.15})`);
  grad.addColorStop(1, 'rgba(239,68,68,0)');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.ellipse(base.x, cy, 26, 40, 0, 0, Math.PI * 2); ctx.fill();
}

function drawRangeCircle(ctx: CanvasRenderingContext2D, cam: Camera, x: number, z: number, r: number, color: string) {
  const segments = 32;
  ctx.strokeStyle = withAlpha(color, 0.7);
  ctx.fillStyle = withAlpha(color, 0.12);
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const px = x + Math.cos(a) * r; const pz = z + Math.sin(a) * r;
    const p = worldToScreen(cam, px, 0.05, pz);
    if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
}

function drawProjectile(ctx: CanvasRenderingContext2D, cam: Camera, p: Projectile) {
  const def = TOWERS[p.kind];
  const y = 0.7;
  const pos = worldToScreen(cam, p.pos.x, y, p.pos.y);
  const r = (p.kind === 'mortar' ? 7 : p.kind === 'storm' ? 6 : 5) * cam.zoom * 0.01 + 3;
  // Glow
  const grad = ctx.createRadialGradient(pos.x, pos.y, 1, pos.x, pos.y, r * 3);
  grad.addColorStop(0, def.accent);
  grad.addColorStop(1, withAlpha(def.color, 0));
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(pos.x, pos.y, r * 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = def.accent;
  ctx.strokeStyle = def.color;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}

function drawHpBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, pct: number, color?: string) {
  ctx.fillStyle = 'rgba(6,11,22,0.82)';
  roundedRect(ctx, x - w / 2 - 2, y - h / 2 - 2, w + 4, h + 4, 3); ctx.fill();
  ctx.fillStyle = 'rgba(148,163,184,0.35)';
  roundedRect(ctx, x - w / 2, y - h / 2, w, h, 2); ctx.fill();
  ctx.fillStyle = color ?? (pct > 0.5 ? '#4ade80' : pct > 0.25 ? '#fbbf24' : '#ef4444');
  roundedRect(ctx, x - w / 2, y - h / 2, w * pct, h, 2); ctx.fill();
}

// Pulsing ground ring that telegraphs a commander's speed aura
function drawAuraRing(ctx: CanvasRenderingContext2D, cam: Camera, x: number, z: number, radius: number, time: number, accent: string) {
  const pulse = 0.5 + 0.5 * Math.sin(time * 2.2);
  ctx.save();
  ctx.globalAlpha = 0.14 + pulse * 0.12;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  const segs = 40;
  ctx.beginPath();
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const p = worldToScreen(cam, x + Math.cos(a) * radius, 0.04, z + Math.sin(a) * radius);
    if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

// Arc of light showing remaining shield charge above an enemy
function drawShieldArc(ctx: CanvasRenderingContext2D, cam: Camera, x: number, z: number, size: number, pct: number) {
  const p = worldToScreen(cam, x, size * 1.5 + 0.5, z);
  const r = Math.max(10, size * cam.zoom * 0.55);
  ctx.save();
  ctx.strokeStyle = 'rgba(125,211,252,0.8)';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, -Math.PI * 0.85, -Math.PI * 0.15);
  ctx.stroke();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = '#e0f2fe';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r + 3, -Math.PI * 0.85, -Math.PI * 0.85 + Math.PI * 0.7 * pct);
  ctx.stroke();
  ctx.restore();
}

// Convert screen (mouse) to world XZ using camera
export function pickWorld(cam: Camera, sx: number, sy: number): { x: number; z: number } {
  return screenToWorldGround(cam, sx, sy);
}

// Camera helper
export function makeCamera(w: number, h: number): Camera {
  return { x: 0, y: 0, zoom: Math.min(w / 12, h / 8), screenW: w, screenH: h };
}

// Compute a target zoom that fits the world in the screen with padding
export function fitCamera(cam: Camera) {
  const worldW = WORLD.xMax - WORLD.xMin;
  const worldD = WORLD.zMax - WORLD.zMin;
  // World in iso projection spans approximately:
  const projW = (worldW + worldD) * 0.866;
  const projH = (worldW + worldD) * 0.5 + 2; // extra for citadel height
  const z1 = (cam.screenW - 60) / projW;
  const z2 = (cam.screenH - 220) / projH;
  cam.zoom = Math.min(z1, z2);
  cam.x = 0; cam.y = 0;
}

// UI-drawn panel with typeface title
export function drawTitledPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, title: string, color = '#1e293b') {
  drawPanel(ctx, x, y, w, h, color, 14, 5);
  if (title) {
    drawText(ctx, title, { x: x + w / 2, y: y + 24, size: 20, color: '#fbbf24', align: 'center', outline: '#0d1220', outlineWidth: 4 });
  }
}

/** Creates a scenic 2.5D showcase world for the Title Screen backdrop. */
export function createDioramaGame(): Game {
  const g = new Game({
    onGoldChange: () => {}, onHpChange: () => {}, onWaveChange: () => {},
    onLoot: () => {}, onStateChange: () => {}, onShake: () => {},
  });
  const stage = generateStage(1, 2, 4042);
  g.load(stage, { chests: [], cards: [], keys: 0 }, 500);
  const kinds: TowerKind[] = ['archer', 'prism', 'mortar', 'chill'];
  let ki = 0;
  for (let prog = 2.2; prog < g.path.total - 1.8 && ki < kinds.length; prog += 2.6) {
    const pt = alongPath(g.path, prog);
    for (const [dx, dz] of [[1.1, 1.1], [-1.1, -1.1], [1.2, -1.1], [-1.2, 1.1]]) {
      if (g.canPlaceAt(pt.x + dx, pt.z + dz)) {
        g.gold = 9999;
        g.place(kinds[ki++], pt.x + dx, pt.z + dz);
        break;
      }
    }
  }
  for (let i = 0; i < 90; i++) g.update(1 / 30);
  return g;
}

export { WORLD, measureText };


// ---------- Texture & ambient helpers ----------

interface AmbientParticle {
  x: number; z: number; y: number;
  vx: number; vy: number; size: number;
  color: string; phase: number;
}

const AMBIENT: Record<string, { kind: 'fall' | 'drift' | 'rise'; colors: string[]; count: number }> = {
  meadow: { kind: 'fall', colors: ['#83c24a', '#c9d64a', '#e0b34a'], count: 46 },
  desert: { kind: 'drift', colors: ['#ecd6a0', '#ddb272', '#f4e2b8'], count: 40 },
  tundra: { kind: 'fall', colors: ['#ffffff', '#eaf4ff'], count: 66 },
  ember:  { kind: 'rise', colors: ['#ffb347', '#ff7b3a', '#ffd27f'], count: 44 },
  astral: { kind: 'drift', colors: ['#c3b4ff', '#8fd0ff', '#ffffff'], count: 74 },
  abyss:  { kind: 'rise', colors: ['#5cc8f5', '#3a8fb0', '#8fe0ff'], count: 40 },
};

/** Deterministic 0..1 value from two numbers (stable between frames). */
function tileHash(x: number, z: number): number {
  const v = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

/** A few tiny surface details so tiles read as textured ground. */
function drawGroundDetail(ctx: CanvasRenderingContext2D, cam: Camera, x: number, z: number, base: string) {
  const c = shade(base, -0.28);
  ctx.fillStyle = c;
  for (let i = 0; i < 3; i++) {
    const rx = x + 0.12 + tileHash(x * 3 + i, z) * 0.7;
    const rz = z + 0.12 + tileHash(x, z * 3 + i) * 0.7;
    const p = worldToScreen(cam, rx, 0.01, rz);
    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, cam.zoom * 0.02), 0, Math.PI * 2); ctx.fill();
  }
}

