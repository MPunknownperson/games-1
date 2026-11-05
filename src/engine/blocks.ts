// PRESERVE BLOCKS — modular visual/behavior blocks for all game entities.
// Each block is a data structure describing appearance + gameplay stats.
// Blocks compose into towers, enemies, decor, projectiles, chests, etc.

import { drawBlock, drawCylinder, drawSphere, drawPyramid, drawGroundShadow, shade, worldToScreen, type Camera } from './render';

// ---------------- Tower Blocks ----------------
export type TowerKind = 'archer' | 'mortar' | 'chill' | 'prism' | 'storm';

export interface TowerBlock {
  id: TowerKind;
  name: string;
  cost: number;
  damage: number;
  range: number;
  fireRate: number; // shots per second
  projectileSpeed: number;
  color: string;
  accent: string;
  desc: string;
  splash?: number;
  slow?: number;
  chain?: number;
  // 2.5D visual "block": stack of primitives
  render: TowerRenderer;
}

export type TowerRenderer = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  x: number, z: number,
  angle: number,
  level: number,
  color: string,
  accent: string,
) => void;

const towerArcher: TowerRenderer = (ctx, cam, x, z, angle, level, color, accent) => {
  // Base pedestal
  drawGroundShadow(ctx, cam, x, z, 0.55);
  drawBlock(ctx, cam, x - 0.35, 0, z - 0.35, 0.7, 0.15, 0.7, shade(color, -0.2));
  // Column
  drawCylinder(ctx, cam, x, 0.15, z, 0.2, 0.4 + level * 0.08, color);
  // Turret (dome)
  drawSphere(ctx, cam, x, 0.55 + level * 0.08, z, 0.28, accent);
  // Bow arm (rotates)
  const y = 0.7 + level * 0.08;
  const p = worldToScreen(cam, x, y, z);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(angle);
  ctx.strokeStyle = shade(color, -0.3);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 12 + level * 2, -Math.PI / 3, Math.PI / 3);
  ctx.stroke();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-6 - level, -10 - level); ctx.lineTo(-6 - level, 10 + level);
  ctx.stroke();
  ctx.restore();
};

const towerMortar: TowerRenderer = (ctx, cam, x, z, angle, level, color, accent) => {
  drawGroundShadow(ctx, cam, x, z, 0.6);
  // Wide base
  drawBlock(ctx, cam, x - 0.4, 0, z - 0.4, 0.8, 0.25, 0.8, shade(color, -0.15));
  // Cannon body
  drawCylinder(ctx, cam, x, 0.25, z, 0.28, 0.35, color);
  // Ball on top pointing along angle
  const y = 0.6;
  const p = worldToScreen(cam, x, y, z);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(angle);
  // Barrel
  ctx.fillStyle = shade(color, -0.4);
  ctx.beginPath();
  ctx.rect(0, -7 - level, 30 + level * 4, 14 + level * 2);
  ctx.fill();
  ctx.strokeStyle = '#0d1220';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Muzzle
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(30 + level * 4, 0, 4 + level, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
};

const towerChill: TowerRenderer = (ctx, cam, x, z, angle, level, color, accent) => {
  drawGroundShadow(ctx, cam, x, z, 0.55);
  drawBlock(ctx, cam, x - 0.32, 0, z - 0.32, 0.64, 0.12, 0.64, shade(color, -0.2));
  // Crystal pillar (pyramid)
  drawPyramid(ctx, cam, x, 0.12, z, 0.5, 0.5, 0.5 + level * 0.1, color);
  // Floating orb on top
  const y = 0.7 + level * 0.1;
  drawSphere(ctx, cam, x, y, z, 0.18 + level * 0.02, accent);
  void angle;
};

const towerPrism: TowerRenderer = (ctx, cam, x, z, angle, level, color, accent) => {
  drawGroundShadow(ctx, cam, x, z, 0.55);
  drawBlock(ctx, cam, x - 0.35, 0, z - 0.35, 0.7, 0.15, 0.7, shade(color, -0.2));
  // Column
  drawCylinder(ctx, cam, x, 0.15, z, 0.15, 0.4, color);
  // Rotating prism
  const y = 0.6;
  const p = worldToScreen(cam, x, y, z);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(angle);
  const r = 15 + level * 2;
  ctx.fillStyle = accent;
  ctx.strokeStyle = '#0d1220';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Inner core
  ctx.fillStyle = shade(color, 0.35);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

const towerStorm: TowerRenderer = (ctx, cam, x, z, angle, level, color, accent) => {
  drawGroundShadow(ctx, cam, x, z, 0.6);
  drawBlock(ctx, cam, x - 0.4, 0, z - 0.4, 0.8, 0.2, 0.8, shade(color, -0.2));
  // Twin pillars
  drawBlock(ctx, cam, x - 0.35, 0.2, z - 0.1, 0.15, 0.55, 0.2, color);
  drawBlock(ctx, cam, x + 0.2, 0.2, z - 0.1, 0.15, 0.55, 0.2, color);
  // Coil ball
  const y = 0.85 + level * 0.05;
  drawSphere(ctx, cam, x, y, z, 0.22 + level * 0.03, accent);
  // Arc discharge
  const p = worldToScreen(cam, x, y, z);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.strokeStyle = shade(accent, 0.3);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + angle;
    const r = 12 + Math.sin(a * 3) * 3;
    if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
};

export const TOWERS: Record<TowerKind, TowerBlock> = {
  archer: { id: 'archer', name: 'ARCHER', cost: 50, damage: 18, range: 3.4, fireRate: 1.6, projectileSpeed: 12, color: '#4ade80', accent: '#a7f3d0', desc: 'RAPID SINGLE TARGET', render: towerArcher },
  mortar: { id: 'mortar', name: 'MORTAR', cost: 120, damage: 45, range: 3.0, fireRate: 0.6, projectileSpeed: 8, color: '#f87171', accent: '#fecaca', desc: 'SPLASH DAMAGE', splash: 1.3, render: towerMortar },
  chill: { id: 'chill', name: 'CHILL', cost: 90, damage: 8, range: 2.6, fireRate: 1.2, projectileSpeed: 10, color: '#38bdf8', accent: '#bae6fd', desc: 'SLOWS ENEMIES', slow: 0.5, render: towerChill },
  prism: { id: 'prism', name: 'PRISM', cost: 180, damage: 32, range: 3.8, fireRate: 1.4, projectileSpeed: 14, color: '#a78bfa', accent: '#ddd6fe', desc: 'CHAINS BETWEEN FOES', chain: 3, render: towerPrism },
  storm: { id: 'storm', name: 'STORM', cost: 250, damage: 70, range: 4.4, fireRate: 0.8, projectileSpeed: 20, color: '#fbbf24', accent: '#fef3c7', desc: 'MASSIVE PIERCING BOLT', chain: 4, render: towerStorm },
};

// ---------------- Enemy Blocks ----------------
export type EnemyKind = 'slime' | 'brute' | 'wisp' | 'golem' | 'runner' | 'behemoth';

export type EnemyRenderer = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  x: number, z: number,
  time: number,
  color: string,
  accent: string,
) => void;

export interface EnemyBlock {
  id: EnemyKind;
  name: string;
  hp: number;
  speed: number;
  bounty: number;
  color: string;
  accent: string;
  size: number;
  chestChance: number;
  cardChance: number;
  render: EnemyRenderer;
}

const enemySlime: EnemyRenderer = (ctx, cam, x, z, t, color, accent) => {
  const bob = Math.sin(t * 4) * 0.05;
  drawGroundShadow(ctx, cam, x, z, 0.35);
  // Body
  drawSphere(ctx, cam, x, 0 + bob, z, 0.32, color);
  // Eyes
  const p = worldToScreen(cam, x, 0.4 + bob, z);
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(p.x - 6, p.y, 4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(p.x + 6, p.y, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0d1220';
  ctx.beginPath(); ctx.arc(p.x - 6, p.y, 2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(p.x + 6, p.y, 2, 0, Math.PI * 2); ctx.fill();
  void accent;
};

const enemyBrute: EnemyRenderer = (ctx, cam, x, z, t, color, accent) => {
  drawGroundShadow(ctx, cam, x, z, 0.42);
  // Legs
  const stride = Math.sin(t * 6) * 0.05;
  drawBlock(ctx, cam, x - 0.18, 0, z - 0.1 + stride, 0.14, 0.25, 0.14, shade(color, -0.2));
  drawBlock(ctx, cam, x + 0.04, 0, z - 0.1 - stride, 0.14, 0.25, 0.14, shade(color, -0.2));
  // Body
  drawBlock(ctx, cam, x - 0.22, 0.25, z - 0.18, 0.44, 0.35, 0.36, color);
  // Head
  drawSphere(ctx, cam, x, 0.6, z, 0.18, accent);
  // Eyes
  const p = worldToScreen(cam, x, 0.7, z);
  ctx.fillStyle = '#0d1220';
  ctx.fillRect(p.x - 8, p.y - 2, 5, 3);
  ctx.fillRect(p.x + 3, p.y - 2, 5, 3);
};

const enemyWisp: EnemyRenderer = (ctx, cam, x, z, t, color, accent) => {
  const y = 0.4 + Math.sin(t * 3) * 0.1;
  drawGroundShadow(ctx, cam, x, z, 0.25, 0.2);
  // Tail streaks
  for (let i = 3; i >= 1; i--) {
    const p = worldToScreen(cam, x, y - i * 0.08, z);
    ctx.fillStyle = shade(color, 0.1 - i * 0.1);
    ctx.globalAlpha = 0.3 / i;
    ctx.beginPath();
    ctx.arc(p.x, p.y + i * 6, 8 + i * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Core
  drawSphere(ctx, cam, x, y, z, 0.2, accent);
  // Inner glow
  const p = worldToScreen(cam, x, y + 0.2, z);
  ctx.fillStyle = shade(color, 0.5);
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
};

const enemyGolem: EnemyRenderer = (ctx, cam, x, z, t, color, accent) => {
  drawGroundShadow(ctx, cam, x, z, 0.55);
  const stride = Math.sin(t * 3) * 0.03;
  // Legs (stone chunks)
  drawBlock(ctx, cam, x - 0.28, 0, z - 0.15 + stride, 0.2, 0.3, 0.2, shade(color, -0.2));
  drawBlock(ctx, cam, x + 0.08, 0, z - 0.15 - stride, 0.2, 0.3, 0.2, shade(color, -0.2));
  // Body
  drawBlock(ctx, cam, x - 0.35, 0.3, z - 0.28, 0.7, 0.45, 0.56, color);
  // Head
  drawBlock(ctx, cam, x - 0.2, 0.75, z - 0.2, 0.4, 0.35, 0.4, shade(color, -0.05));
  // Eyes (glowing)
  const p = worldToScreen(cam, x, 0.9, z);
  ctx.fillStyle = accent;
  ctx.beginPath(); ctx.arc(p.x - 8, p.y, 4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(p.x + 8, p.y, 4, 0, Math.PI * 2); ctx.fill();
};

const enemyRunner: EnemyRenderer = (ctx, cam, x, z, t, color, accent) => {
  drawGroundShadow(ctx, cam, x, z, 0.28);
  const stride = Math.sin(t * 12) * 0.15;
  // Body (elongated)
  drawBlock(ctx, cam, x - 0.28, 0.18, z - 0.1, 0.56, 0.14, 0.2, color);
  // Legs
  drawBlock(ctx, cam, x - 0.2, 0, z + stride, 0.08, 0.2, 0.08, shade(color, -0.3));
  drawBlock(ctx, cam, x + 0.12, 0, z - stride, 0.08, 0.2, 0.08, shade(color, -0.3));
  // Head
  drawSphere(ctx, cam, x + 0.2, 0.28, z, 0.12, accent);
  // Eye
  const p = worldToScreen(cam, x + 0.2, 0.4, z);
  ctx.fillStyle = '#0d1220';
  ctx.beginPath(); ctx.arc(p.x + 2, p.y, 2, 0, Math.PI * 2); ctx.fill();
};

const enemyBehemoth: EnemyRenderer = (ctx, cam, x, z, t, color, accent) => {
  drawGroundShadow(ctx, cam, x, z, 0.75);
  const stride = Math.sin(t * 2) * 0.04;
  // Legs
  drawBlock(ctx, cam, x - 0.4, 0, z - 0.2 + stride, 0.28, 0.4, 0.28, shade(color, -0.25));
  drawBlock(ctx, cam, x + 0.12, 0, z - 0.2 - stride, 0.28, 0.4, 0.28, shade(color, -0.25));
  // Body
  drawBlock(ctx, cam, x - 0.5, 0.4, z - 0.35, 1.0, 0.55, 0.7, color);
  // Head
  drawBlock(ctx, cam, x - 0.25, 0.95, z - 0.22, 0.5, 0.4, 0.45, shade(color, -0.05));
  // Horns
  drawPyramid(ctx, cam, x - 0.15, 1.32, z - 0.05, 0.1, 0.1, 0.2, accent);
  drawPyramid(ctx, cam, x + 0.15, 1.32, z - 0.05, 0.1, 0.1, 0.2, accent);
  // Eyes
  const p = worldToScreen(cam, x, 1.15, z);
  ctx.fillStyle = '#fca5a5';
  ctx.beginPath(); ctx.arc(p.x - 10, p.y, 4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(p.x + 10, p.y, 4, 0, Math.PI * 2); ctx.fill();
};

export const ENEMIES: Record<EnemyKind, EnemyBlock> = {
  slime:    { id: 'slime',    name: 'SLIME',    hp: 55,  speed: 1.1, bounty: 8,  color: '#4ade80', accent: '#dcfce7', size: 0.35, chestChance: 0.03, cardChance: 0.02, render: enemySlime },
  brute:    { id: 'brute',    name: 'BRUTE',    hp: 140, speed: 0.8, bounty: 16, color: '#65a30d', accent: '#bef264', size: 0.42, chestChance: 0.05, cardChance: 0.03, render: enemyBrute },
  wisp:     { id: 'wisp',     name: 'WISP',     hp: 80,  speed: 1.7, bounty: 20, color: '#a78bfa', accent: '#ede9fe', size: 0.28, chestChance: 0.06, cardChance: 0.05, render: enemyWisp },
  golem:    { id: 'golem',    name: 'GOLEM',    hp: 420, speed: 0.55, bounty: 40, color: '#78716c', accent: '#fbbf24', size: 0.55, chestChance: 0.12, cardChance: 0.06, render: enemyGolem },
  runner:   { id: 'runner',   name: 'RUNNER',   hp: 180, speed: 2.2, bounty: 35, color: '#f97316', accent: '#fed7aa', size: 0.3, chestChance: 0.08, cardChance: 0.06, render: enemyRunner },
  behemoth: { id: 'behemoth', name: 'BEHEMOTH', hp: 900, speed: 0.7, bounty: 100, color: '#7f1d1d', accent: '#fca5a5', size: 0.8, chestChance: 0.35, cardChance: 0.15, render: enemyBehemoth },
};

// ---------------- Theme Blocks ----------------
export type ThemeKind = 'meadow' | 'desert' | 'tundra' | 'ember' | 'astral' | 'abyss';

export interface ThemeBlock {
  id: ThemeKind;
  name: string;
  sky: [string, string];
  ground: string;
  groundTile: string;
  path: string;
  pathBorder: string;
  accent: string;
  decor: (ctx: CanvasRenderingContext2D, cam: Camera, x: number, z: number, seed: number) => void;
}

const decorTree = (ctx: CanvasRenderingContext2D, cam: Camera, x: number, z: number, seed: number) => {
  const trunk = '#78350f';
  const foliage = ['#166534', '#15803d', '#4d7c0f'][Math.abs(Math.floor(seed * 3)) % 3];
  drawGroundShadow(ctx, cam, x, z, 0.35);
  drawBlock(ctx, cam, x - 0.06, 0, z - 0.06, 0.12, 0.35, 0.12, trunk);
  drawSphere(ctx, cam, x, 0.35, z, 0.28 + (seed % 0.08), foliage);
  drawSphere(ctx, cam, x + 0.08, 0.55, z, 0.18, foliage);
};
const decorCactus = (ctx: CanvasRenderingContext2D, cam: Camera, x: number, z: number, seed: number) => {
  const c = '#4d7c0f';
  drawGroundShadow(ctx, cam, x, z, 0.25);
  drawCylinder(ctx, cam, x, 0, z, 0.1, 0.5 + (seed % 0.2), c);
  drawCylinder(ctx, cam, x - 0.16, 0.15, z, 0.06, 0.2, c);
  drawCylinder(ctx, cam, x + 0.16, 0.2, z, 0.06, 0.18, c);
};
const decorIce = (ctx: CanvasRenderingContext2D, cam: Camera, x: number, z: number, seed: number) => {
  drawGroundShadow(ctx, cam, x, z, 0.3, 0.2);
  drawPyramid(ctx, cam, x, 0, z, 0.32, 0.32, 0.5 + (seed % 0.2), '#bae6fd');
  drawPyramid(ctx, cam, x + 0.18, 0, z + 0.05, 0.18, 0.18, 0.28, '#7dd3fc');
};
const decorRock = (ctx: CanvasRenderingContext2D, cam: Camera, x: number, z: number, seed: number) => {
  drawGroundShadow(ctx, cam, x, z, 0.3);
  drawSphere(ctx, cam, x, 0, z, 0.22 + (seed % 0.08), '#57534e');
};
const decorCrystal = (ctx: CanvasRenderingContext2D, cam: Camera, x: number, z: number, seed: number) => {
  drawGroundShadow(ctx, cam, x, z, 0.28);
  drawPyramid(ctx, cam, x, 0, z, 0.2, 0.2, 0.6 + (seed % 0.2), '#c4b5fd');
};
const decorSpire = (ctx: CanvasRenderingContext2D, cam: Camera, x: number, z: number, seed: number) => {
  drawGroundShadow(ctx, cam, x, z, 0.3);
  drawPyramid(ctx, cam, x, 0, z, 0.28, 0.28, 0.8 + (seed % 0.3), '#1e293b');
};

export const THEMES: Record<ThemeKind, ThemeBlock> = {
  meadow: { id: 'meadow', name: 'FIRST MEADOW',    sky: ['#7dd3fc', '#0369a1'], ground: '#4ade80', groundTile: '#22c55e', path: '#a16207', pathBorder: '#78350f', accent: '#facc15', decor: decorTree },
  desert: { id: 'desert', name: 'BONE DUNES',      sky: ['#fbbf24', '#c2410c'], ground: '#f59e0b', groundTile: '#d97706', path: '#78350f', pathBorder: '#451a03', accent: '#fef3c7', decor: decorCactus },
  tundra: { id: 'tundra', name: 'WHITEHOLD',       sky: ['#e0f2fe', '#0369a1'], ground: '#e0f2fe', groundTile: '#bae6fd', path: '#64748b', pathBorder: '#334155', accent: '#7dd3fc', decor: decorIce },
  ember:  { id: 'ember',  name: 'EMBER HOLLOW',    sky: ['#fca5a5', '#7f1d1d'], ground: '#7f1d1d', groundTile: '#991b1b', path: '#f97316', pathBorder: '#c2410c', accent: '#fbbf24', decor: decorRock },
  astral: { id: 'astral', name: 'ASTRAL REACH',    sky: ['#312e81', '#0c0a2e'], ground: '#4338ca', groundTile: '#3730a3', path: '#c4b5fd', pathBorder: '#7c3aed', accent: '#a78bfa', decor: decorCrystal },
  abyss:  { id: 'abyss',  name: 'THE LONG QUIET',  sky: ['#0f172a', '#000000'], ground: '#1e293b', groundTile: '#0f172a', path: '#475569', pathBorder: '#1e293b', accent: '#38bdf8', decor: decorSpire },
};

export const THEME_ORDER: ThemeKind[] = ['meadow', 'desert', 'tundra', 'ember', 'astral', 'abyss'];
