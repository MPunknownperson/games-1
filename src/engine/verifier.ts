// Rule-based verification and auto-repair for live world state, used by the diagnostics tools and on load.
import type { SandboxWorld, Stock } from '../world/simulation';

export interface VerificationIssue { rule: string; detail: string }
export interface RepairReport { fixes: string[]; remaining: VerificationIssue[] }

const finite = Number.isFinite;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const STOCK_KEYS: (keyof Stock)[] = ['gold', 'wood', 'stone', 'essence'];

export function verifyWorld(world: SandboxWorld, limit: number): VerificationIssue[] {
  const issues: VerificationIssue[] = [];
  const ids = new Set<string>();
  const living = new Set(world.actors.filter((a) => a.alive).map((a) => a.id));
  for (const a of world.actors) {
    if (ids.has(a.id)) issues.push({ rule: 'unique-id', detail: `Duplicate actor ${a.id}` });
    ids.add(a.id);
    if (!finite(a.x) || !finite(a.z) || Math.abs(a.x) > limit || Math.abs(a.z) > limit) issues.push({ rule: 'position', detail: `${a.name} has an invalid position` });
    if (!finite(a.y) || a.y < -0.5 || a.y > 60) issues.push({ rule: 'height', detail: `${a.name} is floating or buried` });
    if (!finite(a.vx) || !finite(a.vy) || !finite(a.vz)) issues.push({ rule: 'velocity', detail: `${a.name} has an invalid velocity` });
    if (!finite(a.hp) || !finite(a.maxHp) || a.maxHp <= 0 || a.hp < 0 || a.hp > a.maxHp) issues.push({ rule: 'health', detail: `${a.name} has invalid health` });
    if (!finite(a.radius) || a.radius <= 0) issues.push({ rule: 'collider', detail: `${a.name} has an invalid collider` });
    if (a.kind === 'item' && !a.itemType) issues.push({ rule: 'item-type', detail: `${a.name} has no item definition` });
    if (a.carriedBy && !living.has(a.carriedBy)) issues.push({ rule: 'orphan-carry', detail: `${a.name} is held by no one` });
  }
  for (const id of ['guardian', 'citadel']) if (!ids.has(id)) issues.push({ rule: 'essential-actor', detail: `Missing ${id}` });
  for (const key of STOCK_KEYS) if (!finite(world.stock[key]) || world.stock[key] < 0) issues.push({ rule: 'stock', detail: `${key} is invalid` });
  for (const [type, count] of Object.entries(world.pack)) if (!finite(count) || (count ?? 0) < 0) issues.push({ rule: 'pack', detail: `${type} count is invalid` });
  if (!finite(world.elapsed) || world.elapsed < 0) issues.push({ rule: 'clock', detail: 'World time is invalid' });
  if (!finite(world.nextId) || world.nextId < 1) issues.push({ rule: 'next-id', detail: 'Actor ID counter is invalid' });
  if (!finite(world.bounty) || world.bounty < 0) issues.push({ rule: 'bounty', detail: 'Bounty is invalid' });
  return issues;
}

export function repairWorld(world: SandboxWorld, limit: number): RepairReport {
  const fixes: string[] = [];
  if (!finite(world.nextId) || world.nextId < 1) { world.nextId = world.actors.length + 1000; fixes.push('Reset actor ID counter'); }
  const allIds = new Set(world.actors.map((a) => a.id));
  const seen = new Set<string>();
  for (const a of world.actors) {
    if (seen.has(a.id)) {
      let id = `a${world.nextId++}`;
      while (allIds.has(id)) id = `a${world.nextId++}`;
      a.id = id; allIds.add(id); fixes.push('Reassigned a duplicate actor ID');
    }
    seen.add(a.id);
  }
  const living = new Set(world.actors.filter((a) => a.alive).map((a) => a.id));
  for (const a of world.actors) {
    if (!finite(a.x) || !finite(a.z) || Math.abs(a.x) > limit || Math.abs(a.z) > limit) {
      a.x = clamp(finite(a.x) ? a.x : 0, -limit + 1, limit - 1);
      a.z = clamp(finite(a.z) ? a.z : 0, -limit + 1, limit - 1);
      fixes.push(`Repositioned ${a.name}`);
    }
    if (!finite(a.y) || a.y < -0.5 || a.y > 60) { a.y = 0; a.sleeping = false; fixes.push(`Set ${a.name} back on the ground`); }
    if (!finite(a.vx) || !finite(a.vy) || !finite(a.vz)) { a.vx = a.vy = a.vz = 0; fixes.push(`Stopped ${a.name}`); }
    if (!finite(a.maxHp) || a.maxHp <= 0) { a.maxHp = 100; fixes.push(`Restored ${a.name} maximum health`); }
    if (!finite(a.hp) || a.hp < 0 || a.hp > a.maxHp) { a.hp = clamp(finite(a.hp) ? a.hp : a.maxHp, 0, a.maxHp); fixes.push(`Repaired ${a.name} health`); }
    if (!finite(a.radius) || a.radius <= 0) { a.radius = 0.5; fixes.push(`Repaired ${a.name} collider`); }
    if (a.carriedBy && !living.has(a.carriedBy)) { a.carriedBy = undefined; a.sleeping = false; fixes.push(`Dropped ${a.name}, which was held by no one`); }
  }
  const before = world.actors.length;
  world.actors = world.actors.filter((a) => a.kind !== 'item' || !!a.itemType);
  if (world.actors.length !== before) fixes.push('Removed items with no definition');
  for (const key of STOCK_KEYS) if (!finite(world.stock[key]) || world.stock[key] < 0) { world.stock[key] = 0; fixes.push(`Repaired ${key}`); }
  for (const [type, count] of Object.entries(world.pack)) {
    if (!finite(count) || (count ?? 0) <= 0) { delete world.pack[type as keyof typeof world.pack]; fixes.push(`Repaired ${type} in the pack`); }
  }
  if (!finite(world.elapsed) || world.elapsed < 0) { world.elapsed = 0; fixes.push('Reset world clock'); }
  if (!finite(world.bounty) || world.bounty < 0) { world.bounty = 0; fixes.push('Reset bounty'); }
  return { fixes, remaining: verifyWorld(world, limit) };
}
