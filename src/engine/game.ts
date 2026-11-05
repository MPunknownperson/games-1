// PRESERVE ENGINE — Game logic (world, combat, waves, entities).
// Uses ISO 2.5D world coords. All rendering done by /render.ts and /blocks.ts.
import { TOWERS, ENEMIES, THEMES, THEME_ORDER, type TowerKind, type EnemyKind, type ThemeKind } from './blocks';
import { drawBlock, drawCylinder, drawGroundQuad, drawGroundShadow, drawSphere, drawPanel, shade, withAlpha, worldToScreen, screenToWorldGround, roundedRect, type Camera } from './render';
import { drawText, measureText } from './typeface';
import { audio } from './audio';

export type PuzzleKind = 'sigil' | 'oracle' | 'riddle' | 'echo' | 'pulse' | 'shift' | 'gear';
export type ChestRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface Vec3 { x: number; y: number; z: number; }
export interface Vec2 { x: number; y: number; }
export interface Chest { id: string; rarity: ChestRarity; }
export interface Card { id: string; kind: PuzzleKind; rarity: ChestRarity; }

export interface Tower {
  id: number; kind: TowerKind;
  x: number; z: number;
  level: number; cooldown: number; kills: number; angle: number;
}
export interface Enemy {
  id: number; kind: EnemyKind;
  x: number; z: number;
  hp: number; maxHp: number;
  progress: number; // distance along path
  slowTimer: number; slowAmount: number;
  dead: boolean;
}
export interface Projectile {
  id: number; from: Vec2; pos: Vec2;
  targetId: number; kind: TowerKind;
  damage: number; speed: number;
  splash?: number; slow?: number; chain?: number;
  life: number; y: number; // world y (for arc)
  arcT?: number;
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
  nextId = 1;
  selectedKind: TowerKind | null = null;
  selectedTowerId: number | null = null;
  hoverX = 0; hoverZ = 0;
  kills = 0; goldEarned = 0; chestsFound = 0; cardsFound = 0;
  mvpId: number | null = null;
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
    const diffMult = 1 + (this.stage.round - 1) * 0.3 + (this.stage.minor - 1) * 0.06;
    this.spawnQueue = [];
    for (const entry of w.entries) {
      let t = entry.delay;
      for (let i = 0; i < entry.count; i++) {
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
          const bonus = 25 + this.stage.round * 3;
          this.gold += bonus; this.goldEarned += bonus;
          this.events.onGoldChange(this.gold);
          this.floats.push({ x: 0, z: 0, y: 3, text: `WAVE CLEAR +${bonus}`, life: 2, color: '#fbbf24', vy: -0.3 });
        }
      }
    }

    // Enemies
    for (const e of this.enemies) {
      if (e.dead) continue;
      let speed = ENEMIES[e.kind].speed;
      if (e.slowTimer > 0) { speed *= 1 - e.slowAmount; e.slowTimer -= dt; }
      e.progress += speed * dt;
      const p = alongPath(this.path, e.progress);
      e.x = p.x; e.z = p.z;
      if (p.done) {
        e.dead = true;
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

    // Towers
    for (const t of this.towers) {
      t.cooldown -= dt;
      const st = this.towerStats(t);
      let best: Enemy | null = null; let bp = -1;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - t.x, e.z - t.z);
        if (d <= st.range && e.progress > bp) { best = e; bp = e.progress; }
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
        this.hitEnemy(target, p.damage, p.kind);
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

    // BGM tension
    const t = Math.min(1, this.enemies.length / 15) * 0.5 + (this.waveActive ? 0.3 : 0) + (this.hp / this.maxHp < 0.3 ? 0.3 : 0);
    audio.setTension(t);
  }

  private fire(t: Tower, target: Enemy, st: ReturnType<Game['towerStats']>) {
    this.projectiles.push({
      id: this.nextId++, from: { x: t.x, y: t.z }, pos: { x: t.x, y: t.z },
      targetId: target.id, kind: t.kind,
      damage: st.damage, speed: st.projectileSpeed,
      splash: st.splash, slow: st.slow, chain: st.chain,
      life: 3, y: 0.7,
    });
    switch (t.kind) {
      case 'archer': audio.laser(); break;
      case 'mortar': audio.cannonFire(); break;
      case 'chill': audio.chillShot(); break;
      case 'prism': audio.prismShot(); break;
      case 'storm': audio.stormShot(); break;
    }
  }

  private spawn(kind: EnemyKind, hpMult: number) {
    const d = ENEMIES[kind];
    const hp = Math.floor(d.hp * hpMult);
    this.enemies.push({
      id: this.nextId++, kind,
      x: this.path.seg[0].start.x, z: this.path.seg[0].start.y,
      hp, maxHp: hp, progress: 0, slowTimer: 0, slowAmount: 0, dead: false,
    });
  }

  private hitEnemy(e: Enemy, dmg: number, _kind: TowerKind) {
    if (e.dead) return;
    e.hp -= dmg;
    audio.enemyHit();
    this.burst(e.x, 0.3, e.z, ENEMIES[e.kind].color, 3);
    this.floats.push({ x: e.x, z: e.z, y: 0.7, text: `${Math.floor(dmg)}`, life: 0.7, color: '#fef3c7', vy: -0.5 });
    if (e.hp <= 0) {
      e.dead = true; this.kills++;
      const def = ENEMIES[e.kind];
      this.gold += def.bounty; this.goldEarned += def.bounty;
      this.events.onGoldChange(this.gold);
      this.events.onLoot('gold', def.bounty);
      this.floats.push({ x: e.x, z: e.z, y: 0.5, text: `+${def.bounty}`, life: 1, color: '#fbbf24', vy: -0.6 });
      this.burst(e.x, 0.3, e.z, '#fbbf24', 8);
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
  // Sky
  const g = ctx.createLinearGradient(0, 0, 0, cam.screenH);
  g.addColorStop(0, theme.sky[0]);
  g.addColorStop(1, theme.sky[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cam.screenW, cam.screenH);

  // Distant hills (parallax silhouette)
  drawSkyline(ctx, cam, theme);

  // Ground grid
  const step = 1;
  for (let z = WORLD.zMin; z <= WORLD.zMax; z += step) {
    for (let x = WORLD.xMin; x <= WORLD.xMax; x += step) {
      const c = ((Math.floor(x) + Math.floor(z)) % 2 === 0) ? theme.ground : theme.groundTile;
      drawGroundQuad(ctx, cam, x, z, step, step, c);
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
        def.render(ctx, cam, e.x, e.z, time, def.color, def.accent);
        // HP bar
        const p = worldToScreen(cam, e.x, def.size * 2.2 + 0.4, e.z);
        const w = def.size * 60 * cam.zoom * 0.02;
        drawHpBar(ctx, p.x, p.y, Math.max(20, w * 20), 4, e.hp / e.maxHp);
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

  // Float text
  for (const f of game.floats) {
    const p = worldToScreen(cam, f.x, f.y, f.z);
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life));
    const size = 22;
    drawText(ctx, f.text, { x: p.x, y: p.y, size, color: f.color, align: 'center', outline: '#0d1220', outlineWidth: 4, strokeWidth: 3 });
  }
  ctx.globalAlpha = 1;
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

function drawPathRibbon(ctx: CanvasRenderingContext2D, cam: Camera, path: Vec2[], color: string, border: string) {
  const width = 0.7;
  // Draw as connected quads
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const dx = b.x - a.x, dz = b.y - a.y;
    const len = Math.hypot(dx, dz);
    if (len === 0) continue;
    // Perpendicular in world XZ plane
    const nx = -dz / len, nz = dx / len;
    const q0 = worldToScreen(cam, a.x + nx * width, 0.02, a.y + nz * width);
    const q1 = worldToScreen(cam, a.x - nx * width, 0.02, a.y - nz * width);
    const q2 = worldToScreen(cam, b.x - nx * width, 0.02, b.y - nz * width);
    const q3 = worldToScreen(cam, b.x + nx * width, 0.02, b.y + nz * width);
    // Border
    ctx.fillStyle = border;
    ctx.beginPath();
    const pad = 4;
    ctx.moveTo(q0.x - pad, q0.y - pad); ctx.lineTo(q3.x + pad, q3.y - pad);
    ctx.lineTo(q2.x + pad, q2.y + pad); ctx.lineTo(q1.x - pad, q1.y + pad); ctx.closePath();
    ctx.fill();
    // Main
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(q0.x, q0.y); ctx.lineTo(q3.x, q3.y); ctx.lineTo(q2.x, q2.y); ctx.lineTo(q1.x, q1.y); ctx.closePath();
    ctx.fill();
    // Dashed centerline
    const mid0 = worldToScreen(cam, a.x, 0.03, a.y);
    const mid1 = worldToScreen(cam, b.x, 0.03, b.y);
    ctx.strokeStyle = shade(color, 0.2);
    ctx.setLineDash([8, 10]);
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

function drawHpBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, pct: number) {
  ctx.fillStyle = '#0d1220';
  roundedRect(ctx, x - w / 2 - 2, y - h / 2 - 2, w + 4, h + 4, 3); ctx.fill();
  ctx.fillStyle = '#334155';
  roundedRect(ctx, x - w / 2, y - h / 2, w, h, 2); ctx.fill();
  ctx.fillStyle = pct > 0.5 ? '#4ade80' : pct > 0.25 ? '#fbbf24' : '#ef4444';
  roundedRect(ctx, x - w / 2, y - h / 2, w * pct, h, 2); ctx.fill();
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

export { WORLD, measureText };
