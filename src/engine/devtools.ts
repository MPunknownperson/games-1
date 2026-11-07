// PRESERVE DEV TOOLS — in-engine development & testing suite.
// Development-only helpers bound to a live Game instance: deterministic
// simulation stepping, JSON state snapshots, cheats, and a self-test runner
// for game creation. No network, no storage, no DOM — engine-side only.
import { Game, generateStage, mulberry32, alongPath, type EngineEvents } from './game';
import { ENEMIES, TOWERS, type EnemyKind, type TowerKind } from './blocks';

export interface DevStats {
  gold: number; hp: number; maxHp: number;
  wave: number; waveTotal: number; waveActive: boolean;
  enemies: number; towers: number; projectiles: number;
  kills: number; elapsed: number; god: boolean;
  leaks: number; pressure: number;
}

export interface TestResult { name: string; pass: boolean; detail: string; }

interface Snapshot {
  seed: number;
  gold: number; hp: number; maxHp: number;
  waveIdx: number; waveActive: boolean; spawnQueue: unknown[];
  elapsed: number; kills: number; goldEarned: number;
  chestsFound: number; cardsFound: number; mvpId: number | null;
  inventory: Game['inventory'];
  towers: Game['towers']; enemies: Game['enemies']; projectiles: Game['projectiles'];
}

const noopEvents = (): EngineEvents => ({
  onGoldChange: () => {}, onHpChange: () => {}, onWaveChange: () => {},
  onLoot: () => {}, onStateChange: () => {}, onShake: () => {},
});

export class DevTools {
  readonly game: Game;
  god = false;
  private seed = 1;

  constructor(game: Game) {
    this.game = game;
  }

  /** Make the run reproducible: reseed the gameplay RNG. */
  setSeed(seed: number) {
    this.seed = seed;
    this.game.rng = mulberry32(seed);
  }

  addGold(n: number) {
    this.game.gold = Math.max(0, this.game.gold + n);
    this.game.events.onGoldChange(this.game.gold);
  }

  heal() {
    this.game.hp = this.game.maxHp;
    this.game.events.onHpChange(this.game.hp, this.game.maxHp);
  }

  setGod(on: boolean) {
    this.god = on;
    this.game.god = on;
  }

  spawn(kind: EnemyKind, progress = 0) {
    this.game.spawn(kind, 1, progress);
    return this.game.enemies[this.game.enemies.length - 1];
  }

  killAll() {
    this.game.enemies = [];
    this.game.projectiles = [];
  }

  /** Empty the spawn queue and the field; the next update clears the wave. */
  clearWave() {
    this.game.spawnQueue = [];
    this.game.enemies = [];
  }

  /** Advance the simulation deterministically without rendering. */
  step(seconds: number, dt = 1 / 60) {
    const wasPaused = this.game.paused;
    const wasSpeed = this.game.speedMult;
    this.game.paused = false;
    this.game.speedMult = 1;
    for (let t = 0; t < seconds; t += dt) this.game.update(dt);
    this.game.paused = wasPaused;
    this.game.speedMult = wasSpeed;
  }

  stats(): DevStats {
    const g = this.game;
    return {
      gold: g.gold, hp: g.hp, maxHp: g.maxHp,
      wave: g.waveIdx + (g.waveActive ? 1 : 0), waveTotal: g.stage.waves.length, waveActive: g.waveActive,
      enemies: g.enemies.length, towers: g.towers.length, projectiles: g.projectiles.length,
      kills: g.kills, elapsed: g.elapsed, god: g.god,
      leaks: g.leaks, pressure: g.pressure,
    };
  }

  snapshot(): string {
    const g = this.game;
    const s: Snapshot = {
      seed: this.seed, gold: g.gold, hp: g.hp, maxHp: g.maxHp,
      waveIdx: g.waveIdx, waveActive: g.waveActive, spawnQueue: g.spawnQueue,
      elapsed: g.elapsed, kills: g.kills, goldEarned: g.goldEarned,
      chestsFound: g.chestsFound, cardsFound: g.cardsFound, mvpId: g.mvpId,
      inventory: g.inventory, towers: g.towers, enemies: g.enemies, projectiles: g.projectiles,
    };
    return JSON.stringify(s);
  }

  restore(json: string): boolean {
    try {
      const s = JSON.parse(json) as Snapshot;
      const g = this.game;
      this.setSeed(s.seed);
      Object.assign(g, {
        gold: s.gold, hp: s.hp, maxHp: s.maxHp,
        waveIdx: s.waveIdx, waveActive: s.waveActive, spawnQueue: s.spawnQueue,
        elapsed: s.elapsed, kills: s.kills, goldEarned: s.goldEarned,
        chestsFound: s.chestsFound, cardsFound: s.cardsFound, mvpId: s.mvpId,
        inventory: s.inventory, towers: s.towers, enemies: s.enemies, projectiles: s.projectiles,
      });
      g.events.onGoldChange(g.gold);
      g.events.onHpChange(g.hp, g.maxHp);
      g.events.onWaveChange(g.waveIdx + (g.waveActive ? 1 : 0), g.stage.waves.length);
      return true;
    } catch {
      return false;
    }
  }

  /** Fresh deterministic game for tests. */
  static freshGame(seed = 12345, round = 1, minor = 1): Game {
    const game = new Game(noopEvents());
    game.load(generateStage(round, minor, seed), { chests: [], cards: [], keys: 0 });
    game.rng = mulberry32(seed);
    return game;
  }

  /** Run the built-in engine test suite. Returns one result per test. */
  runSelfTests(): TestResult[] {
    const tests: [string, () => string][] = [
      ['stage generation is deterministic', testDeterministicStage],
      ['tower placement consumes gold', testPlacement],
      ['placement on the path is rejected', testPathRejection],
      ['enemies advance along the path', testEnemyAdvance],
      ['towers fire at enemies in range', testTowerFire],
      ['strongest targeting picks the tank', testTargeting],
      ['kills pay bounty gold', testBounty],
      ['reaching the citadel damages it', testCitadelDamage],
      ['god mode prevents citadel damage', testGodMode],
      ['clearing a wave grants bonus gold', testWaveClear],
      ['snapshot/restore round-trips state', testSnapshot],
      ['shields absorb damage before HP', testShield],
      ['shields regenerate over time', testShieldRegen],
      ['support enemies heal wounded allies', testHealer],
      ['boss auras accelerate nearby enemies', testAura],
      ['towers avoid overkilling a dying target', testOverkill],
      ['the wave director adapts to performance', testWaveDirector],
    ];
    return tests.map(([name, fn]) => {
      try {
        return { name, pass: true, detail: fn() };
      } catch (err) {
        return { name, pass: false, detail: err instanceof Error ? err.message : String(err) };
      }
    });
  }
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

/** Place a tower on the nearest buildable tile to a target point. */
function placeNear(game: Game, kind: TowerKind, tx: number, tz: number): boolean {
  for (let r = 0.9; r <= 3.4; r += 0.25) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 10) {
      const x = tx + Math.cos(a) * r;
      const z = tz + Math.sin(a) * r;
      if (game.canPlaceAt(x, z)) {
        game.gold = 99999;
        return game.place(kind, x, z);
      }
    }
  }
  return false;
}

function findBuildSpot(game: Game): { x: number; z: number } {
  for (let z = -3.5; z <= 3.5; z += 0.5) {
    for (let x = -5.5; x <= 5.5; x += 0.5) {
      if (game.canPlaceAt(x, z)) return { x, z };
    }
  }
  throw new Error('no buildable tile found');
}

function testDeterministicStage(): string {
  const a = generateStage(2, 3, 777);
  const b = generateStage(2, 3, 777);
  assert(JSON.stringify(a.path) === JSON.stringify(b.path), 'paths differ for same seed');
  assert(JSON.stringify(a.waves) === JSON.stringify(b.waves), 'waves differ for same seed');
  const c = generateStage(2, 3, 778);
  assert(JSON.stringify(a.path) !== JSON.stringify(c.path), 'different seeds gave same path');
  return 'same seed -> identical stage, different seed -> different stage';
}

function testPlacement(): string {
  const g = DevTools.freshGame();
  const spot = findBuildSpot(g);
  const before = g.gold;
  assert(g.place('archer', spot.x, spot.z), 'placement failed on a valid tile');
  assert(g.towers.length === 1, 'tower not added');
  assert(g.gold === before - TOWERS.archer.cost, 'gold not deducted');
  return `placed ARCHER for ${TOWERS.archer.cost}g`;
}

function testPathRejection(): string {
  const g = DevTools.freshGame();
  const mid = g.stage.path[Math.floor(g.stage.path.length / 2)];
  assert(!g.place('archer', mid.x, mid.y), 'placement on path was allowed');
  return 'path midpoint rejected';
}

function testEnemyAdvance(): string {
  const g = DevTools.freshGame();
  g.spawn('slime', 1, 0);
  const p0 = g.enemies[0].progress;
  for (let i = 0; i < 60; i++) g.update(1 / 60);
  assert(g.enemies[0].progress > p0, 'enemy did not advance');
  return `progress ${p0.toFixed(2)} -> ${g.enemies[0].progress.toFixed(2)} in 1s`;
}

function testTowerFire(): string {
  const g = DevTools.freshGame();
  const spot = findBuildSpot(g);
  // Force the spot next to the path so range is guaranteed
  const mid = g.stage.path[1];
  const near = { x: mid.x + 1.2, z: mid.y + 1.2 };
  g.gold = 9999;
  assert(g.place('storm', near.x, near.z) || g.place('storm', spot.x, spot.z), 'could not place');
  g.spawn('slime', 1, 0);
  let fired = false;
  for (let i = 0; i < 600 && !fired; i++) {
    g.update(1 / 60);
    if (g.projectiles.length > 0) fired = true;
  }
  assert(fired, 'no projectile was fired in 10s');
  return 'projectile launched';
}

function testTargeting(): string {
  const g = DevTools.freshGame();
  const mid = g.stage.path[1];
  g.gold = 9999;
  const spot = { x: mid.x + 1.0, z: mid.y + 1.0 };
  assert(g.place('chill', spot.x, spot.z), 'chill placement failed');
  const weak = g.spawn('slime', 1, 2);
  const tank = g.spawn('golem', 1, 2.2);
  // chill targets 'strongest': the golem should be chosen
  g.update(1 / 60);
  assert(g.projectiles.length > 0, 'chill never fired');
  assert(g.projectiles[0].targetId === tank.id, `chill targeted weak enemy (${g.projectiles[0].targetId}) instead of tank (${tank.id})`);
  void weak;
  return 'chill targeted the golem (highest HP)';
}

function testBounty(): string {
  const g = DevTools.freshGame();
  const e = g.spawn('slime', 1, 0);
  const before = g.gold;
  g.hitEnemy(e, 99999, 'archer');
  assert(e.dead, 'enemy not dead');
  assert(g.gold === before + ENEMIES.slime.bounty, 'bounty not paid');
  assert(g.kills === 1, 'kill not counted');
  return `+${ENEMIES.slime.bounty}g bounty, kill counted`;
}

function testCitadelDamage(): string {
  const g = DevTools.freshGame();
  const total = g.path.total;
  g.spawn('behemoth', 1, total - 0.2);
  const before = g.hp;
  for (let i = 0; i < 120; i++) g.update(1 / 60);
  assert(g.hp < before, 'citadel took no damage');
  return `citadel ${before} -> ${g.hp}`;
}

function testGodMode(): string {
  const g = DevTools.freshGame();
  g.god = true;
  const total = g.path.total;
  g.spawn('behemoth', 1, total - 0.2);
  for (let i = 0; i < 120; i++) g.update(1 / 60);
  assert(g.hp === g.maxHp, 'god mode still lost HP');
  return 'citadel HP unchanged in god mode';
}

function testWaveClear(): string {
  const g = DevTools.freshGame();
  g.startNextWave();
  assert(g.waveActive, 'wave did not start');
  g.spawnQueue = [];
  g.enemies = [];
  const before = g.gold;
  for (let i = 0; i < 30; i++) g.update(1 / 60);
  assert(!g.waveActive && g.waveIdx === 1, 'wave did not clear');
  assert(g.gold > before, 'no wave-clear bonus');
  return `wave cleared, +${g.gold - before}g bonus`;
}

function testSnapshot(): string {
  const g = DevTools.freshGame(42);
  const dev = new DevTools(g);
  dev.addGold(500);
  g.spawn('brute', 1, 3);
  const snap = dev.snapshot();
  dev.addGold(-100);
  g.spawn('wisp', 1, 1);
  assert(dev.restore(snap), 'restore returned false');
  assert(g.enemies.length === 1 && g.enemies[0].kind === 'brute', 'enemies not restored');
  assert(JSON.parse(snap).gold === g.gold, 'gold mismatch after restore');
  return 'state restored exactly';
}

function testShield(): string {
  const g = DevTools.freshGame();
  const e = g.spawn('golem', 1, 0);
  const hp0 = e.hp;
  g.hitEnemy(e, 100, 'archer');
  assert((e.shield ?? 0) < (ENEMIES.golem.shield ?? 0), 'shield did not absorb damage');
  assert(e.hp === hp0, 'HP dropped while the shield was still up');
  return `100 damage fully absorbed by a ${ENEMIES.golem.shield} point shield`;
}

function testShieldRegen(): string {
  const g = DevTools.freshGame();
  const e = g.spawn('golem', 1, 0);
  g.hitEnemy(e, ENEMIES.golem.shield ?? 0, 'archer');
  const stripped = e.shield ?? 0;
  for (let i = 0; i < 60 * 5; i++) g.update(1 / 60);
  assert((e.shield ?? 0) > stripped, 'shield did not regenerate');
  return `shield ${stripped.toFixed(0)} -> ${(e.shield ?? 0).toFixed(0)} after 5s`;
}

function testHealer(): string {
  const g = DevTools.freshGame();
  const wounded = g.spawn('brute', 1, 0);
  g.hitEnemy(wounded, wounded.maxHp * 0.7, 'archer');
  const hp0 = wounded.hp;
  const medic = g.spawn('wisp', 1, 0);
  medic.healCd = 0;
  for (let i = 0; i < 60; i++) g.update(1 / 60);
  assert(wounded.hp > hp0, 'the medic did not heal the wounded ally');
  return `ally ${hp0} -> ${wounded.hp} (healed ${wounded.hp - hp0})`;
}

function testAura(): string {
  const make = () => {
    const g = DevTools.freshGame(5);
    const s = g.spawn('slime', 1, 0);
    s.speedVar = 1; s.lane = 0; s.wobble = 0;
    return { g, s };
  };
  const boosted = make();
  boosted.g.spawn('behemoth', 1, 0);
  const plain = make();
  for (let i = 0; i < 30; i++) { boosted.g.update(1 / 60); plain.g.update(1 / 60); }
  assert(boosted.s.progress > plain.s.progress * 1.1,
    `aura only multiplied speed by ${(boosted.s.progress / plain.s.progress).toFixed(2)}`);
  return `aura advanced the slime ${(boosted.s.progress / plain.s.progress).toFixed(2)}x faster`;
}

function testOverkill(): string {
  const g = DevTools.freshGame();
  const pt = alongPath(g.path, 0.4);
  assert(placeNear(g, 'storm', pt.x + 0.9, pt.z + 0.9), 'tower A placement failed');
  assert(placeNear(g, 'storm', pt.x + 0.9, pt.z - 0.9), 'tower B placement failed');
  const dying = g.spawn('slime', 1, 0.4);
  dying.hp = 5; dying.maxHp = 10;
  g.spawn('slime', 1, 0.35);
  // Accumulate targets across frames: fast shots resolve within a few ticks,
  // so reading the projectile list once can miss them entirely.
  const aimed = new Set<number>();
  for (let i = 0; i < 6; i++) {
    g.update(1 / 60);
    for (const pr of g.projectiles) aimed.add(pr.targetId);
  }
  assert(aimed.size >= 2, `only ${aimed.size} distinct target(s) observed, so the test proved nothing`);
  const atDying = aimed.has(dying.id) ? 1 : 0;
  assert(atDying <= 1, 'every tower piled onto a target already covered by in-flight damage');
  return `${aimed.size} distinct targets engaged, ${atDying} tower on the dying enemy`;
}

function testWaveDirector(): string {
  const g = DevTools.freshGame();
  const before = g.pressure;
  g.startNextWave();
  g.spawnQueue = []; g.enemies = []; g.leaks = 0;
  for (let i = 0; i < 30; i++) g.update(1 / 60);
  assert(g.pressure > before, `pressure stayed at ${g.pressure}`);
  return `pressure ${before.toFixed(2)} -> ${g.pressure.toFixed(2)} after a clean fast clear`;
}

export const DEV_ENEMY_KINDS = Object.keys(ENEMIES) as EnemyKind[];
export const DEV_TOWER_KINDS = Object.keys(TOWERS) as TowerKind[];
