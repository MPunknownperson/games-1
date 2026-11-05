export type GameState =
  | 'title'
  | 'map'
  | 'playing'
  | 'paused'
  | 'victory'
  | 'defeat'
  | 'puzzle'
  | 'chest'
  | 'ad-countdown'
  | 'ad-playing'
  | 'revive-offer';

export type PuzzleKind =
  | 'jigsaw'
  | 'tarot'
  | 'riddle'
  | 'memory'
  | 'timing'
  | 'slider'
  | 'dial';

export type TowerKind = 'arrow' | 'cannon' | 'frost' | 'arcane' | 'thunder';
export type EnemyKind = 'goblin' | 'orc' | 'wraith' | 'troll' | 'drake' | 'shade';
export type ThemeKind = 'verdant' | 'desert' | 'frost' | 'volcanic' | 'astral' | 'abyssal';

export interface Vec2 { x: number; y: number; }

export interface TowerDef {
  id: TowerKind;
  name: string;
  icon: string;
  cost: number;
  damage: number;
  range: number;
  fireRate: number; // shots per second
  projectileSpeed: number;
  color: string;
  desc: string;
  splash?: number;
  slow?: number;
  chain?: number;
}

export interface EnemyDef {
  id: EnemyKind;
  name: string;
  hp: number;
  speed: number;
  gold: number;
  color: string;
  icon: string;
  size: number;
  chestChance: number;
  cardChance: number;
}

export interface Tower {
  id: number;
  kind: TowerKind;
  pos: Vec2;
  level: number;
  cooldown: number;
  kills: number;
  angle: number;
  targetId?: number;
}

export interface Enemy {
  id: number;
  kind: EnemyKind;
  pos: Vec2;
  hp: number;
  maxHp: number;
  pathIndex: number;
  slowTimer: number;
  slowAmount: number;
  burnTimer: number;
  dead: boolean;
  progress: number; // distance along path for sorting
}

export interface Projectile {
  id: number;
  from: Vec2;
  pos: Vec2;
  targetId: number;
  kind: TowerKind;
  damage: number;
  speed: number;
  splash?: number;
  slow?: number;
  chain?: number;
  life: number;
}

export interface Particle {
  pos: Vec2;
  vel: Vec2;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  gravity?: number;
}

export interface Chest {
  id: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  opened: boolean;
}

export interface Card {
  id: string;
  kind: PuzzleKind;
  solved: boolean;
  rarity: 'common' | 'rare' | 'epic';
}

export interface PathSegment {
  start: Vec2;
  end: Vec2;
  length: number;
}

export interface StageDef {
  round: number;
  minor: number; // 1-5, then major (6)
  theme: ThemeKind;
  waves: WaveDef[];
  path: Vec2[];
  targetHp: number;
  startGold: number;
}

export interface WaveDef {
  enemies: { kind: EnemyKind; count: number; interval: number; delay?: number }[];
}

export interface ChestReward {
  type: 'gold' | 'tower' | 'stage-skip' | 'artifact' | 'upgrade-voucher';
  value: number | string;
  label: string;
  icon: string;
}

export interface SaveData {
  bestRound: number;
  totalGoldEarned: number;
  totalEnemiesKilled: number;
  unlockedTowers: TowerKind[];
  highScore: number;
  muteBgm: boolean;
  muteSfx: boolean;
  masterVolume: number;
  currentRun?: {
    round: number;
    minor: number;
    gold: number;
    targetHp: number;
    maxTargetHp: number;
    wave: number;
    inventory: { chests: Chest[]; cards: Card[]; keys: number };
    seed: number;
  };
}

export interface AdResult {
  completed: boolean;
  rewarded?: boolean;
}

export interface IPlatformSDK {
  name: string;
  init(): Promise<void>;
  gameplayStart(): void;
  gameplayStop(): void;
  happyTime(): void;
  reportScore(score: number): void;
  showRewardedAd(): Promise<AdResult>;
  showInterstitialAd(): Promise<AdResult>;
  loadingStart(): void;
  loadingProgress(pct: number): void;
  loadingEnd(): void;
}
