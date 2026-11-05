// Core Tower Defense engine — Canvas 2D, 60fps, grid + path + towers + enemies + projectiles.
import type {
  Tower, Enemy, Projectile, Particle, TowerKind, EnemyKind, ThemeKind, Vec2,
  StageDef, WaveDef, TowerDef, EnemyDef, Chest, Card,
} from './types';
import { audio } from './audio';

// ---- Deterministic PRNG (mulberry32) for seed-reproducible stages ----
export function mulberry32(seed: number) {
  let a = seed | 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Tower definitions ----
export const TOWERS: Record<TowerKind, TowerDef> = {
  arrow: { id: 'arrow', name: 'Archer', icon: '🏹', cost: 50, damage: 18, range: 140, fireRate: 1.6, projectileSpeed: 500, color: '#86efac', desc: 'Fast single-target. Reliable workhorse.' },
  cannon: { id: 'cannon', name: 'Cannon', icon: '💣', cost: 120, damage: 45, range: 120, fireRate: 0.6, projectileSpeed: 320, color: '#fca5a5', desc: 'Splash damage, slow fire. Mows groups.', splash: 50 },
  frost: { id: 'frost', name: 'Frost', icon: '❄️', cost: 90, damage: 8, range: 110, fireRate: 1.2, projectileSpeed: 380, color: '#7dd3fc', desc: 'Slows enemies, low damage.', slow: 0.5 },
  arcane: { id: 'arcane', name: 'Arcane', icon: '✨', cost: 180, damage: 32, range: 160, fireRate: 1.4, projectileSpeed: 600, color: '#c4b5fd', desc: 'Chains between targets.', chain: 3 },
  thunder: { id: 'thunder', name: 'Thunder', icon: '⚡', cost: 250, damage: 70, range: 180, fireRate: 0.8, projectileSpeed: 900, color: '#fde047', desc: 'Massive damage, piercing chain.', chain: 4 },
};

// ---- Enemy definitions ----
export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  goblin: { id: 'goblin', name: 'Goblin', hp: 55, speed: 55, gold: 8, color: '#84cc16', icon: '👺', size: 14, chestChance: 0.03, cardChance: 0.01 },
  orc:    { id: 'orc',    name: 'Orc',    hp: 140, speed: 40, gold: 16, color: '#65a30d', icon: '👹', size: 18, chestChance: 0.05, cardChance: 0.02 },
  wraith: { id: 'wraith', name: 'Wraith', hp: 80, speed: 85, gold: 20, color: '#a78bfa', icon: '👻', size: 15, chestChance: 0.06, cardChance: 0.04 },
  troll:  { id: 'troll',  name: 'Troll',  hp: 420, speed: 28, gold: 40, color: '#78350f', icon: '🧌', size: 24, chestChance: 0.12, cardChance: 0.05 },
  drake:  { id: 'drake',  name: 'Drake',  hp: 260, speed: 70, gold: 60, color: '#ef4444', icon: '🐲', size: 22, chestChance: 0.15, cardChance: 0.08 },
  shade:  { id: 'shade',  name: 'Shade',  hp: 180, speed: 110, gold: 35, color: '#1e293b', icon: '🦇', size: 16, chestChance: 0.08, cardChance: 0.06 },
};

// ---- Themes ----
export const THEMES: Record<ThemeKind, { name: string; bg: [string, string]; path: string; ground: string; accent: string; decor: string }> = {
  verdant:  { name: 'Verdant Marches', bg: ['#14532d', '#052e16'], path: '#a16207', ground: '#166534', accent: '#86efac', decor: '🌲' },
  desert:   { name: 'Searing Dunes',   bg: ['#7c2d12', '#431407'], path: '#fde68a', ground: '#b45309', accent: '#fbbf24', decor: '🌵' },
  frost:    { name: 'Frosthold Peaks', bg: ['#0c4a6e', '#082f49'], path: '#e0f2fe', ground: '#0369a1', accent: '#7dd3fc', decor: '❄️' },
  volcanic: { name: 'Ember Caldera',   bg: ['#7f1d1d', '#450a0a'], path: '#f97316', ground: '#991b1b', accent: '#fb923c', decor: '🔥' },
  astral:   { name: 'Astral Spires',   bg: ['#1e1b4b', '#0c0a2e'], path: '#c4b5fd', ground: '#4338ca', accent: '#a78bfa', decor: '✨' },
  abyssal:  { name: 'Abyssal Depths',  bg: ['#020617', '#000000'], path: '#475569', ground: '#0f172a', accent: '#38bdf8', decor: '🌀' },
};

export const THEME_ORDER: ThemeKind[] = ['verdant', 'desert', 'frost', 'volcanic', 'astral', 'abyssal'];

// ---- Stage generation ----
export function generateStage(round: number, minor: number, seed: number): StageDef {
  const rng = mulberry32(seed + round * 1000 + minor * 17);
  const themeIdx = Math.floor((round - 1) / 2) % THEME_ORDER.length;
  const theme = THEME_ORDER[themeIdx];
  const isMajor = minor === 6;
  const path = generatePath(rng, minor, round);
  const waveCount = isMajor ? 5 : 3 + Math.min(2, Math.floor(round / 3));
  const waves: WaveDef[] = [];
  const diffMult = 1 + (round - 1) * 0.35 + (minor - 1) * 0.08;
  const enemyPool = buildEnemyPool(round);
  for (let w = 0; w < waveCount; w++) {
    const waveset: WaveDef['enemies'] = [];
    const baseCount = 5 + w * 2 + Math.floor(round * 1.2);
    for (const ek of enemyPool) {
      const count = Math.max(0, Math.floor(baseCount * (0.5 + rng()) * (ENEMIES[ek].hp < 120 ? 1 : 0.45)));
      if (count > 0) waveset.push({
        kind: ek,
        count,
        interval: Math.max(0.35, 0.9 - w * 0.07 - round * 0.02),
        delay: rng() * 1.5,
      });
    }
    if (isMajor && w === waveCount - 1) {
      // Boss wave
      waveset.push({ kind: 'drake', count: 1 + Math.floor(round / 3), interval: 1.8, delay: 2 });
    }
    waves.push({ enemies: waveset });
  }
  // Scale enemy HP by multiplier — stored in Enemy via engine
  const maxHp = 20 + round * 10 + (isMajor ? 40 : 0);
  return {
    round, minor, theme, waves, path,
    targetHp: maxHp,
    startGold: 150 + round * 10,
  };
  void diffMult;
}

function buildEnemyPool(round: number): EnemyKind[] {
  const p: EnemyKind[] = ['goblin'];
  if (round >= 1) p.push('goblin');
  if (round >= 2) p.push('orc');
  if (round >= 3) p.push('wraith');
  if (round >= 4) p.push('shade');
  if (round >= 5) p.push('troll');
  if (round >= 6) p.push('drake');
  return Array.from(new Set(p));
}

function generatePath(rng: () => number, minor: number, round: number): Vec2[] {
  // Waypoints on a 1280x720 virtual canvas; scaled at render time.
  const W = 1280, H = 720;
  const points: Vec2[] = [];
  const variations = 3 + Math.min(3, Math.floor((round + minor) / 2));
  points.push({ x: -30, y: 100 + Math.floor(rng() * 200) });
  for (let i = 0; i < variations; i++) {
    const x = (W / (variations + 1)) * (i + 1) + (rng() * 120 - 60);
    const y = 120 + rng() * (H - 300);
    points.push({ x, y });
  }
  points.push({ x: W - 120, y: H - 120 });
  return points;
}

// ---- Path math ----
export function buildPathSegments(points: Vec2[]): { seg: { start: Vec2; end: Vec2; length: number }[]; total: number } {
  const seg: { start: Vec2; end: Vec2; length: number }[] = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const s = points[i], e = points[i + 1];
    const dx = e.x - s.x, dy = e.y - s.y;
    const len = Math.hypot(dx, dy);
    seg.push({ start: s, end: e, length: len });
    total += len;
  }
  return { seg, total };
}

export function positionAlong(path: ReturnType<typeof buildPathSegments>, dist: number): { pos: Vec2; angle: number; done: boolean } {
  let remaining = dist;
  for (const s of path.seg) {
    if (remaining <= s.length) {
      const t = remaining / s.length;
      return {
        pos: { x: s.start.x + (s.end.x - s.start.x) * t, y: s.start.y + (s.end.y - s.start.y) * t },
        angle: Math.atan2(s.end.y - s.start.y, s.end.x - s.start.x),
        done: false,
      };
    }
    remaining -= s.length;
  }
  const last = path.seg[path.seg.length - 1];
  return { pos: { ...last.end }, angle: Math.atan2(last.end.y - last.start.y, last.end.x - last.start.x), done: true };
}

// ---- Game Engine Class ----
export interface EngineEvents {
  onGoldChange: (g: number) => void;
  onTargetHpChange: (hp: number, maxHp: number) => void;
  onWaveChange: (wave: number, total: number) => void;
  onStateChange: (state: 'idle' | 'wave' | 'victory' | 'defeat') => void;
  onLoot: (type: 'gold' | 'chest' | 'card', amount?: number) => void;
  onEnemyKilled: () => void;
  onScreenShake: (amount: number) => void;
}

export class GameEngine {
  width = 1280;
  height = 720;
  stage!: StageDef;
  path!: ReturnType<typeof buildPathSegments>;
  towers: Tower[] = [];
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  particles: Particle[] = [];
  gold = 0;
  targetHp = 0;
  maxTargetHp = 0;
  waveIdx = 0;
  waveActive = false;
  waveSpawnQueue: { kind: EnemyKind; spawnAt: number; hpMult: number }[] = [];
  elapsed = 0;
  nextEnemyId = 1;
  nextProjId = 1;
  nextTowerId = 1;
  selectedTowerKind: TowerKind | null = null;
  selectedTowerId: number | null = null;
  mouse: Vec2 = { x: 0, y: 0 };
  paused = false;
  speedMult = 1;
  enemiesKilled = 0;
  goldEarnedThisStage = 0;
  mvpTowerId: number | null = null;
  floatTexts: { x: number; y: number; text: string; life: number; color: string; vy: number }[] = [];
  chestsCollected = 0;
  cardsCollected = 0;
  events: EngineEvents;
  inventory: { chests: Chest[]; cards: Card[]; keys: number } = { chests: [], cards: [], keys: 0 };
  rng!: () => number;

  constructor(events: EngineEvents) {
    this.events = events;
  }

  loadStage(stage: StageDef, inventory: { chests: Chest[]; cards: Card[]; keys: number }, carryGold?: number) {
    this.stage = stage;
    this.path = buildPathSegments(stage.path);
    this.towers = [];
    this.enemies = [];
    this.projectiles = [];
    this.particles = [];
    this.gold = carryGold ?? stage.startGold;
    this.targetHp = stage.targetHp;
    this.maxTargetHp = stage.targetHp;
    this.waveIdx = 0;
    this.waveActive = false;
    this.waveSpawnQueue = [];
    this.elapsed = 0;
    this.enemiesKilled = 0;
    this.goldEarnedThisStage = carryGold ? 0 : 0;
    this.mvpTowerId = null;
    this.floatTexts = [];
    this.chestsCollected = 0;
    this.cardsCollected = 0;
    this.inventory = { chests: [...inventory.chests], cards: [...inventory.cards], keys: inventory.keys };
    this.rng = mulberry32(Date.now() & 0xffffffff);
    this.events.onGoldChange(this.gold);
    this.events.onTargetHpChange(this.targetHp, this.maxTargetHp);
    this.events.onWaveChange(0, this.stage.waves.length);
    this.events.onStateChange('idle');
  }

  startNextWave() {
    if (this.waveIdx >= this.stage.waves.length) return;
    if (this.waveActive) return;
    const wave = this.stage.waves[this.waveIdx];
    const diffMult = 1 + (this.stage.round - 1) * 0.3 + (this.stage.minor - 1) * 0.06;
    let t = 0;
    this.waveSpawnQueue = [];
    for (const group of wave.enemies) {
      let gt = group.delay ?? 0;
      for (let i = 0; i < group.count; i++) {
        this.waveSpawnQueue.push({ kind: group.kind, spawnAt: this.elapsed + gt, hpMult: diffMult });
        gt += group.interval;
      }
      t = Math.max(t, gt);
    }
    this.waveActive = true;
    this.events.onWaveChange(this.waveIdx + 1, this.stage.waves.length);
    this.events.onStateChange('wave');
    audio.waveStart();
  }

  canPlaceAt(x: number, y: number): boolean {
    // Not too close to path
    for (const s of this.path.seg) {
      const d = distToSegment({ x, y }, s.start, s.end);
      if (d < 36) return false;
    }
    // Not overlapping other towers
    for (const t of this.towers) {
      if (Math.hypot(t.pos.x - x, t.pos.y - y) < 36) return false;
    }
    // Within bounds
    if (x < 30 || x > this.width - 30 || y < 60 || y > this.height - 30) return false;
    return true;
  }

  placeTower(kind: TowerKind, x: number, y: number): boolean {
    const def = TOWERS[kind];
    if (this.gold < def.cost) { audio.error(); return false; }
    if (!this.canPlaceAt(x, y)) { audio.error(); return false; }
    this.towers.push({
      id: this.nextTowerId++,
      kind, pos: { x, y }, level: 1, cooldown: 0, kills: 0, angle: 0,
    });
    this.gold -= def.cost;
    this.events.onGoldChange(this.gold);
    audio.towerPlace();
    this.spawnParticles(x, y, def.color, 10, 2);
    return true;
  }

  upgradeCost(t: Tower): number {
    return Math.floor(TOWERS[t.kind].cost * (0.6 + t.level * 0.5));
  }

  upgradeTower(id: number): boolean {
    const t = this.towers.find((tt) => tt.id === id);
    if (!t) return false;
    if (t.level >= 4) return false;
    const cost = this.upgradeCost(t);
    if (this.gold < cost) { audio.error(); return false; }
    this.gold -= cost;
    t.level++;
    this.events.onGoldChange(this.gold);
    audio.upgrade();
    this.spawnParticles(t.pos.x, t.pos.y, '#fde047', 16, 3);
    return true;
  }

  sellTower(id: number): number {
    const idx = this.towers.findIndex((t) => t.id === id);
    if (idx < 0) return 0;
    const t = this.towers[idx];
    let spent = TOWERS[t.kind].cost;
    for (let i = 1; i < t.level; i++) spent += Math.floor(TOWERS[t.kind].cost * (0.6 + i * 0.5));
    const refund = Math.floor(spent * 0.65);
    this.gold += refund;
    this.towers.splice(idx, 1);
    this.events.onGoldChange(this.gold);
    audio.click();
    this.spawnParticles(t.pos.x, t.pos.y, '#fbbf24', 10, 2);
    this.floatTexts.push({ x: t.pos.x, y: t.pos.y, text: `+${refund}`, life: 1, color: '#fbbf24', vy: -30 });
    return refund;
  }

  towerStats(t: Tower) {
    const def = TOWERS[t.kind];
    const mult = 1 + (t.level - 1) * 0.35;
    return {
      damage: def.damage * mult,
      range: def.range * (1 + (t.level - 1) * 0.12),
      fireRate: def.fireRate * (1 + (t.level - 1) * 0.15),
      splash: def.splash ? def.splash * (1 + (t.level - 1) * 0.2) : undefined,
      slow: def.slow,
      chain: def.chain,
      projectileSpeed: def.projectileSpeed,
      color: def.color,
    };
  }

  spawnParticles(x: number, y: number, color: string, count: number, size: number) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 140;
      this.particles.push({
        pos: { x, y },
        vel: { x: Math.cos(a) * sp, y: Math.sin(a) * sp },
        life: 0.4 + Math.random() * 0.5,
        maxLife: 0.9,
        color,
        size: size * (0.6 + Math.random() * 0.8),
        gravity: 80,
      });
    }
  }

  addFloatText(x: number, y: number, text: string, color: string) {
    this.floatTexts.push({ x, y, text, life: 1, color, vy: -40 });
  }

  update(dtIn: number) {
    if (this.paused) return;
    const dt = dtIn * this.speedMult;
    this.elapsed += dt;

    // Spawn from queue
    if (this.waveActive) {
      const toSpawn = this.waveSpawnQueue.filter((q) => q.spawnAt <= this.elapsed);
      this.waveSpawnQueue = this.waveSpawnQueue.filter((q) => q.spawnAt > this.elapsed);
      for (const q of toSpawn) this.spawnEnemy(q.kind, q.hpMult);
      // End wave check
      if (this.waveSpawnQueue.length === 0 && this.enemies.length === 0) {
        this.waveActive = false;
        this.waveIdx++;
        if (this.waveIdx >= this.stage.waves.length) {
          this.events.onStateChange('victory');
        } else {
          this.events.onStateChange('idle');
          this.gold += 25 + this.stage.round * 2;
          this.goldEarnedThisStage += 25 + this.stage.round * 2;
          this.events.onGoldChange(this.gold);
          this.addFloatText(this.width / 2, 120, `Wave Bonus +${25 + this.stage.round * 2}g`, '#fbbf24');
        }
      }
    }

    // Update enemies
    for (const e of this.enemies) {
      if (e.dead) continue;
      let speed = ENEMIES[e.kind].speed;
      if (e.slowTimer > 0) {
        speed *= 1 - e.slowAmount;
        e.slowTimer -= dt;
      }
      e.progress += speed * dt;
      const pp = positionAlong(this.path, e.progress);
      e.pos.x = pp.pos.x;
      e.pos.y = pp.pos.y;
      if (pp.done) {
        // Hit target
        e.dead = true;
        const dmg = Math.ceil(5 + ENEMIES[e.kind].hp / 25);
        this.targetHp = Math.max(0, this.targetHp - dmg);
        this.events.onTargetHpChange(this.targetHp, this.maxTargetHp);
        audio.targetHit();
        this.events.onScreenShake(10);
        this.spawnParticles(pp.pos.x, pp.pos.y, '#ef4444', 16, 3);
        this.addFloatText(this.width - 120, this.height - 120, `-${dmg}`, '#ef4444');
        if (this.targetHp <= 0) {
          this.events.onStateChange('defeat');
        }
      }
    }

    // Towers
    for (const t of this.towers) {
      t.cooldown -= dt;
      const stats = this.towerStats(t);
      // find target
      let best: Enemy | null = null;
      let bestProgress = -1;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.pos.x - t.pos.x, e.pos.y - t.pos.y);
        if (d <= stats.range && e.progress > bestProgress) {
          best = e; bestProgress = e.progress;
        }
      }
      if (best) {
        t.angle = Math.atan2(best.pos.y - t.pos.y, best.pos.x - t.pos.x);
        if (t.cooldown <= 0) {
          t.cooldown = 1 / stats.fireRate;
          this.fireProjectile(t, best, stats);
        }
      }
    }

    // Projectiles
    for (const p of this.projectiles) {
      p.life -= dt;
      const target = this.enemies.find((e) => e.id === p.targetId && !e.dead);
      if (!target) { p.life = 0; continue; }
      const dx = target.pos.x - p.pos.x;
      const dy = target.pos.y - p.pos.y;
      const dist = Math.hypot(dx, dy);
      const move = p.speed * dt;
      if (dist <= move + 6) {
        // Hit!
        this.hitEnemy(target, p.damage, p.kind);
        if (p.splash) {
          for (const e of this.enemies) {
            if (e.dead || e.id === target.id) continue;
            if (Math.hypot(e.pos.x - target.pos.x, e.pos.y - target.pos.y) <= p.splash) {
              this.hitEnemy(e, p.damage * 0.6, p.kind);
            }
          }
          this.spawnParticles(target.pos.x, target.pos.y, '#f97316', 18, 4);
          audio.cannonImpact();
        }
        if (p.slow) {
          target.slowTimer = 2.5;
          target.slowAmount = p.slow;
        }
        if (p.chain && p.chain > 0) {
          let from = target;
          let remaining = p.chain;
          const hit = new Set<number>([target.id]);
          while (remaining > 0) {
            let next: Enemy | null = null;
            let nd = 200;
            for (const e of this.enemies) {
              if (e.dead || hit.has(e.id)) continue;
              const d = Math.hypot(e.pos.x - from.pos.x, e.pos.y - from.pos.y);
              if (d < nd) { nd = d; next = e; }
            }
            if (!next) break;
            hit.add(next.id);
            this.hitEnemy(next, p.damage * 0.7, p.kind);
            this.drawChainBolt(from.pos, next.pos);
            from = next;
            remaining--;
          }
        }
        p.life = 0;
      } else {
        p.pos.x += (dx / dist) * move;
        p.pos.y += (dy / dist) * move;
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.life > 0);
    this.enemies = this.enemies.filter((e) => !e.dead || e.pos.x < 0); // allow death anim? we remove immediately here
    this.enemies = this.enemies.filter((e) => !e.dead);

    // Particles
    for (const pt of this.particles) {
      pt.life -= dt;
      pt.pos.x += pt.vel.x * dt;
      pt.pos.y += pt.vel.y * dt;
      if (pt.gravity) pt.vel.y += pt.gravity * dt;
      pt.vel.x *= 0.92;
      pt.vel.y *= 0.98;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    // Float texts
    for (const f of this.floatTexts) {
      f.life -= dt;
      f.y += f.vy * dt;
      f.vy *= 0.95;
    }
    this.floatTexts = this.floatTexts.filter((f) => f.life > 0);

    // Tension for BGM
    const alive = this.enemies.length;
    const tension = Math.min(1, alive / 20) * 0.5 + (this.waveActive ? 0.3 : 0) + (this.targetHp / this.maxTargetHp < 0.3 ? 0.2 : 0);
    audio.setTension(tension);
  }

  private drawChainBolt(a: Vec2, b: Vec2) {
    // Visualize chain with particles (lightning)
    const steps = 6;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = a.x + (b.x - a.x) * t + (Math.random() - 0.5) * 8;
      const y = a.y + (b.y - a.y) * t + (Math.random() - 0.5) * 8;
      this.particles.push({
        pos: { x, y }, vel: { x: 0, y: 0 }, life: 0.15, maxLife: 0.15,
        color: '#fde047', size: 3,
      });
    }
  }

  private fireProjectile(t: Tower, target: Enemy, stats: ReturnType<GameEngine['towerStats']>) {
    const def = TOWERS[t.kind];
    this.projectiles.push({
      id: this.nextProjId++,
      from: { ...t.pos },
      pos: { ...t.pos },
      targetId: target.id,
      kind: t.kind,
      damage: stats.damage,
      speed: stats.projectileSpeed,
      splash: stats.splash,
      slow: stats.slow,
      chain: stats.chain,
      life: 2.5,
    });
    switch (t.kind) {
      case 'arrow': audio.laser(); break;
      case 'cannon': audio.cannonFire(); break;
      case 'frost': audio.frostShot(); break;
      case 'arcane': audio.arcaneShot(); break;
      case 'thunder': audio.thunderShot(); break;
    }
    void def;
  }

  private spawnEnemy(kind: EnemyKind, hpMult: number) {
    const def = ENEMIES[kind];
    const hp = Math.floor(def.hp * hpMult);
    this.enemies.push({
      id: this.nextEnemyId++,
      kind,
      pos: { ...this.path.seg[0].start },
      hp, maxHp: hp,
      pathIndex: 0,
      slowTimer: 0, slowAmount: 0,
      burnTimer: 0, dead: false, progress: 0,
    });
  }

  private hitEnemy(e: Enemy, dmg: number, kind: TowerKind) {
    if (e.dead) return;
    e.hp -= dmg;
    audio.enemyHit();
    this.spawnParticles(e.pos.x, e.pos.y, ENEMIES[e.kind].color, 4, 2);
    this.addFloatText(e.pos.x, e.pos.y - 10, `${Math.floor(dmg)}`, '#fef3c7');
    if (e.hp <= 0) {
      e.dead = true;
      this.enemiesKilled++;
      this.events.onEnemyKilled();
      const def = ENEMIES[e.kind];
      const goldDrop = def.gold;
      this.gold += goldDrop;
      this.goldEarnedThisStage += goldDrop;
      this.events.onGoldChange(this.gold);
      this.events.onLoot('gold', goldDrop);
      this.addFloatText(e.pos.x, e.pos.y, `+${goldDrop}g`, '#fbbf24');
      this.spawnParticles(e.pos.x, e.pos.y, '#fbbf24', 10, 3);
      audio.gold();

      // Loot rolls
      if (this.rng() < def.chestChance) {
        const rarities: Chest['rarity'][] = ['common', 'common', 'rare', 'epic', 'legendary'];
        const r = this.rng();
        const rarity = rarities[Math.min(rarities.length - 1, Math.floor(r * rarities.length))];
        this.inventory.chests.push({ id: `c_${Date.now()}_${Math.random()}`, rarity, opened: false });
        this.chestsCollected++;
        this.events.onLoot('chest');
        this.addFloatText(e.pos.x + 10, e.pos.y - 10, 'CHEST!', '#f59e0b');
        audio.chestDrop();
      }
      if (this.rng() < def.cardChance) {
        const kinds: Card['kind'][] = ['jigsaw', 'tarot', 'riddle', 'memory', 'timing', 'slider', 'dial'];
        const kindPick = kinds[Math.floor(this.rng() * kinds.length)];
        const rarities: Card['rarity'][] = ['common', 'common', 'rare', 'epic'];
        const rarity = rarities[Math.floor(this.rng() * rarities.length)];
        this.inventory.cards.push({ id: `crd_${Date.now()}_${Math.random()}`, kind: kindPick, solved: false, rarity });
        this.cardsCollected++;
        this.events.onLoot('card');
        this.addFloatText(e.pos.x - 10, e.pos.y - 20, 'CARD!', '#a78bfa');
        audio.cardDrop();
      }

      // Credit kill to nearest tower for MVP
      let closest: Tower | null = null; let cd = 200;
      for (const t of this.towers) {
        const d = Math.hypot(t.pos.x - e.pos.x, t.pos.y - e.pos.y);
        if (d < cd) { cd = d; closest = t; }
      }
      if (closest) {
        closest.kills++;
        if (!this.mvpTowerId) this.mvpTowerId = closest.id;
        else {
          const cur = this.towers.find((x) => x.id === this.mvpTowerId);
          if (cur && closest.kills > cur.kills) this.mvpTowerId = closest.id;
        }
      }
    }
    void kind;
  }
}

function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

// ---- Rendering ----
export function renderEngine(ctx: CanvasRenderingContext2D, eng: GameEngine, theme: typeof THEMES[ThemeKind], time: number) {
  const W = eng.width, H = eng.height;
  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, theme.bg[0]);
  grad.addColorStop(1, theme.bg[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Decorative tile pattern (subtle)
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = theme.accent;
  for (let x = 0; x < W; x += 60) {
    for (let y = 0; y < H; y += 60) {
      ctx.fillRect(x, y, 1, 1);
    }
  }
  ctx.restore();

  // Draw ground zone
  ctx.strokeStyle = theme.path;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = theme.path;
  ctx.shadowBlur = 10;
  ctx.lineWidth = 44;
  ctx.beginPath();
  ctx.moveTo(eng.stage.path[0].x, eng.stage.path[0].y);
  for (let i = 1; i < eng.stage.path.length; i++) ctx.lineTo(eng.stage.path[i].x, eng.stage.path[i].y);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Path inner
  ctx.lineWidth = 38;
  ctx.strokeStyle = theme.ground;
  ctx.beginPath();
  ctx.moveTo(eng.stage.path[0].x, eng.stage.path[0].y);
  for (let i = 1; i < eng.stage.path.length; i++) ctx.lineTo(eng.stage.path[i].x, eng.stage.path[i].y);
  ctx.stroke();

  // Path dashed center line
  ctx.setLineDash([10, 14]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = theme.path;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.moveTo(eng.stage.path[0].x, eng.stage.path[0].y);
  for (let i = 1; i < eng.stage.path.length; i++) ctx.lineTo(eng.stage.path[i].x, eng.stage.path[i].y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  // Target (the thing to defend) at end
  const endPoint = eng.stage.path[eng.stage.path.length - 1];
  const tPct = eng.targetHp / eng.maxTargetHp;
  ctx.save();
  ctx.translate(endPoint.x, endPoint.y);
  const pulse = 1 + Math.sin(time * 3) * 0.05;
  ctx.scale(pulse, pulse);
  // Citadel
  ctx.fillStyle = theme.accent;
  ctx.beginPath();
  ctx.arc(0, 0, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0b0f1a';
  ctx.beginPath();
  ctx.arc(0, 0, 22, 0, Math.PI * 2);
  ctx.fill();
  // Rune
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-10, -8); ctx.lineTo(0, -14); ctx.lineTo(10, -8);
  ctx.moveTo(-10, 8); ctx.lineTo(0, 14); ctx.lineTo(10, 8);
  ctx.stroke();
  ctx.restore();

  // HP ring
  ctx.save();
  ctx.translate(endPoint.x, endPoint.y);
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(0, 0, 40, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = tPct > 0.5 ? '#4ade80' : tPct > 0.25 ? '#fbbf24' : '#ef4444';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, 40, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * tPct);
  ctx.stroke();
  ctx.restore();

  // Spawn point
  const startP = eng.stage.path[0];
  ctx.save();
  ctx.translate(Math.max(30, startP.x), startP.y);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.arc(0, 0, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ef4444';
  ctx.font = 'bold 22px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('☠', 0, 2);
  ctx.restore();

  // Tower pre-placement ghost
  if (eng.selectedTowerKind) {
    const def = TOWERS[eng.selectedTowerKind];
    const canPlace = eng.canPlaceAt(eng.mouse.x, eng.mouse.y);
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = canPlace ? def.color : '#ef4444';
    ctx.beginPath();
    ctx.arc(eng.mouse.x, eng.mouse.y, def.range, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = canPlace ? def.color : '#ef4444';
    ctx.beginPath();
    ctx.arc(eng.mouse.x, eng.mouse.y, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.icon, eng.mouse.x, eng.mouse.y);
    ctx.restore();
  }

  // Selected tower range
  if (eng.selectedTowerId !== null) {
    const t = eng.towers.find((x) => x.id === eng.selectedTowerId);
    if (t) {
      const stats = eng.towerStats(t);
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = TOWERS[t.kind].color;
      ctx.beginPath();
      ctx.arc(t.pos.x, t.pos.y, stats.range, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = TOWERS[t.kind].color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }

  // Towers
  for (const t of eng.towers) {
    const def = TOWERS[t.kind];
    ctx.save();
    ctx.translate(t.pos.x, t.pos.y);
    // Base
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 3;
    ctx.stroke();
    // Level pips
    for (let i = 0; i < t.level; i++) {
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(-9 + i * 6, -18, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    // Turret
    ctx.rotate(t.angle);
    ctx.fillStyle = def.color;
    ctx.fillRect(0, -4, 22 + t.level * 2, 8);
    ctx.restore();
    // Icon
    ctx.save();
    ctx.translate(t.pos.x, t.pos.y);
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.icon, 0, 1);
    ctx.restore();
  }

  // Enemies
  for (const e of eng.enemies) {
    const def = ENEMIES[e.kind];
    ctx.save();
    ctx.translate(e.pos.x, e.pos.y);
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(0, def.size * 0.8, def.size * 0.8, def.size * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    // Body
    ctx.fillStyle = def.color;
    if (e.slowTimer > 0) {
      ctx.strokeStyle = '#7dd3fc';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#7dd3fc';
      ctx.shadowBlur = 10;
    }
    ctx.beginPath();
    ctx.arc(0, 0, def.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    if (e.slowTimer > 0) ctx.stroke();
    // Icon
    ctx.font = `${def.size * 1.3}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.icon, 0, 1);
    // HP bar
    const barW = def.size * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(-barW / 2, -def.size - 10, barW, 5);
    const pct = e.hp / e.maxHp;
    ctx.fillStyle = pct > 0.5 ? '#4ade80' : pct > 0.25 ? '#fbbf24' : '#ef4444';
    ctx.fillRect(-barW / 2, -def.size - 10, barW * pct, 5);
    ctx.restore();
  }

  // Projectiles
  for (const p of eng.projectiles) {
    const def = TOWERS[p.kind];
    ctx.save();
    ctx.fillStyle = def.color;
    ctx.shadowColor = def.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    if (p.kind === 'cannon') {
      ctx.arc(p.pos.x, p.pos.y, 6, 0, Math.PI * 2);
    } else if (p.kind === 'frost') {
      ctx.arc(p.pos.x, p.pos.y, 4, 0, Math.PI * 2);
    } else if (p.kind === 'thunder' || p.kind === 'arcane') {
      ctx.arc(p.pos.x, p.pos.y, 4, 0, Math.PI * 2);
    } else {
      // arrow
      ctx.arc(p.pos.x, p.pos.y, 3, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.restore();
  }

  // Particles
  for (const pt of eng.particles) {
    const a = Math.max(0, pt.life / pt.maxLife);
    ctx.globalAlpha = a;
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.pos.x, pt.pos.y, pt.size * a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Floating texts
  for (const f of eng.floatTexts) {
    ctx.globalAlpha = Math.max(0, f.life);
    ctx.fillStyle = f.color;
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}
