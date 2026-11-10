import { Crowd, NavMeshQuery, Raw, exportTileCache, importTileCache, init, type CrowdAgent, type NavMesh, type Obstacle, type TileCache } from 'recast-navigation';
import { createDefaultTileCacheMeshProcess, generateTileCache } from 'recast-navigation/generators';
import { EXTERIOR_SPACE, spaceOf } from './cells';
import { ITEMS } from './items';
import type { Actor, Point } from './simulation';

let recastInitialization: Promise<void> | undefined;
const baseNavigationCache = new Map<number, Uint8Array>();
export function initializeRecast() {
  if (!recastInitialization) recastInitialization = init().catch((error) => { recastInitialization = undefined; throw error; });
  return recastInitialization;
}

/** The playable world is flat in the authoritative physics model. */
export function buildBaseNavigation(limit: number) {
  const cached = baseNavigationCache.get(limit);
  if (cached) return cached;
  const positions = [-limit, 0, -limit, limit, 0, -limit, limit, 0, limit, -limit, 0, limit];
  const indices = [0, 2, 1, 0, 3, 2];
  const meshProcess = createDefaultTileCacheMeshProcess();
  const result = generateTileCache(positions, indices, {
    cs: 0.5, ch: 0.2, tileSize: 32, walkableRadius: 1, walkableHeight: 9, walkableClimb: 1,
    maxObstacles: 512, expectedLayersPerTile: 1, tileCacheMeshProcess: meshProcess,
  });
  if (!result.success) { Raw.destroy(meshProcess.raw); throw new Error(result.error); }
  const data = exportTileCache(result.navMesh, result.tileCache);
  result.tileCache.destroy();
  result.navMesh.destroy();
  Raw.destroy(meshProcess.raw);
  baseNavigationCache.set(limit, data);
  return data;
}

interface ObstacleEntry { obstacle: Obstacle; x: number; y: number; z: number; radius: number; height: number; facing: number }
interface AgentEntry { actor: Actor; agent: CrowdAgent; target?: Point; requestedAt: number; steeredAt: number; speed: number }

class NavigationSpace {
  readonly navMesh: NavMesh;
  readonly tileCache: TileCache;
  readonly query: NavMeshQuery;
  readonly crowd: Crowd;
  readonly obstacles = new Map<string, ObstacleEntry>();
  readonly agents = new Map<string, AgentEntry>();
  private readonly allocator: ReturnType<typeof importTileCache>['allocator'];
  private readonly compressor: ReturnType<typeof importTileCache>['compressor'];
  private readonly meshProcess = createDefaultTileCacheMeshProcess();
  private pendingTiles = false;
  pathQueries = 0;

  constructor(readonly id: string, data: Uint8Array, actors: Actor[]) {
    const imported = importTileCache(data, this.meshProcess);
    this.navMesh = imported.navMesh; this.tileCache = imported.tileCache;
    this.allocator = imported.allocator; this.compressor = imported.compressor;
    this.query = new NavMeshQuery(this.navMesh, { maxNodes: 4096 });
    this.query.defaultQueryHalfExtents = { x: 6, y: 4, z: 6 };
    this.crowd = new Crowd(this.navMesh, { maxAgents: 256, maxAgentRadius: 1.2 });
    this.crowd.navMeshQuery.defaultQueryHalfExtents = { x: 6, y: 4, z: 6 };
    for (let i = 0; i < 1000 && this.syncObstacles(actors, 24); i++) { /* drain the initial obstacle queue */ }
  }

  private isObstacle(a: Actor) {
    if (!a.alive || spaceOf(a) !== this.id || a.carriedBy) return false;
    if (a.kind === 'item') return !!a.itemType && ITEMS[a.itemType].mass >= 3 && !!a.sleeping && a.y < 0.6;
    return a.solid && a.kind !== 'player' && a.kind !== 'villager' && a.kind !== 'foe'
      && a.height > 0.25 && a.y < 1.8 && a.y + a.height > 0;
  }

  syncObstacles(actors: Actor[], budget = 12) {
    if (this.pendingTiles) {
      const result = this.tileCache.update(this.navMesh);
      this.pendingTiles = !result.upToDate;
      if (this.pendingTiles) return true;
    }
    const desired = new Map(actors.filter((actor) => this.isObstacle(actor)).map((actor) => [actor.id, actor]));
    let changes = 0, more = false;
    for (const [id, entry] of this.obstacles) {
      const actor = desired.get(id);
      const changed = !actor || Math.hypot(actor.x - entry.x, actor.z - entry.z) > 0.35
        || Math.abs(actor.y - entry.y) > 0.25
        || Math.abs(actor.radius - entry.radius) > 0.05 || Math.abs(actor.height - entry.height) > 0.1
        || Math.abs(actor.facing - entry.facing) > 0.25;
      if (!changed) continue;
      if (changes >= budget) { more = true; continue; }
      if (this.tileCache.removeObstacle(entry.obstacle).success) { this.obstacles.delete(id); changes++; }
    }
    for (const [id, actor] of desired) {
      if (this.obstacles.has(id)) continue;
      if (changes >= budget) { more = true; continue; }
      const height = Math.max(1.2, actor.height);
      const radius = actor.radius + 0.45;
      const result = this.tileCache.addBoxObstacle(
        { x: actor.x, y: actor.y + height / 2 - 0.1, z: actor.z },
        { x: radius, y: height / 2 + 0.1, z: radius }, actor.facing,
      );
      if (result.success) {
        this.obstacles.set(id, { obstacle: result.obstacle, x: actor.x, y: actor.y, z: actor.z, radius: actor.radius, height: actor.height, facing: actor.facing });
        changes++;
      } else more = true;
    }
    if (changes) {
      const result = this.tileCache.update(this.navMesh);
      this.pendingTiles = !result.upToDate;
      for (const entry of this.agents.values()) entry.requestedAt = -Infinity;
    }
    return more || this.pendingTiles;
  }

  private ensureAgent(actor: Actor, now: number) {
    let entry = this.agents.get(actor.id);
    if (entry) { entry.actor = actor; return entry; }
    if (this.agents.size >= 256) return undefined;
    const position = { x: actor.x, y: 0, z: actor.z };
    const nearest = this.query.findClosestPoint(position);
    if (!nearest.success || !nearest.polyRef || Math.hypot(nearest.point.x - actor.x, nearest.point.z - actor.z) > 1.6) return undefined;
    try {
      const agent = this.crowd.addAgent(nearest.point, {
        radius: Math.max(0.2, Math.min(1.2, actor.radius)), height: Math.max(1, actor.height),
        maxSpeed: 3, maxAcceleration: 12, collisionQueryRange: 3, pathOptimizationRange: 12,
        separationWeight: 2, updateFlags: 7,
      });
      if (agent.agentIndex < 0) return undefined;
      entry = { actor, agent, requestedAt: -Infinity, steeredAt: now, speed: 3 };
      this.agents.set(actor.id, entry);
      return entry;
    } catch { return undefined; }
  }

  update(dt: number, actors: Actor[], now: number) {
    this.syncObstacles(actors);
    const active = new Map(actors.filter((a) => a.alive && a.hp > 0 && spaceOf(a) === this.id
      && (a.kind === 'villager' || a.kind === 'foe')).map((a) => [a.id, a]));
    for (const [id, entry] of this.agents) {
      const actor = active.get(id);
      if (!actor) { this.crowd.removeAgent(entry.agent); this.agents.delete(id); continue; }
      entry.actor = actor;
      const position = entry.agent.position();
      if (Math.hypot(position.x - actor.x, position.z - actor.z) > 1.5) {
        const nearest = this.query.findClosestPoint({ x: actor.x, y: 0, z: actor.z });
        if (nearest.success && nearest.polyRef && Math.hypot(nearest.point.x - actor.x, nearest.point.z - actor.z) < 1.6) {
          entry.agent.teleport(nearest.point);
          entry.requestedAt = -Infinity;
        }
      }
      if (entry.target && now - entry.steeredAt > 0.45) { entry.agent.resetMoveTarget(); entry.target = undefined; }
    }
    for (const actor of active.values()) if (!this.agents.has(actor.id)) this.ensureAgent(actor, now);
    if (dt > 0) this.crowd.update(dt);
  }

  path(from: Point, to: Point) {
    this.pathQueries++;
    const result = this.query.computePath({ x: from.x, y: 0, z: from.z }, { x: to.x, y: 0, z: to.z });
    return result.success ? result.path.map(({ x, z }) => ({ x, z })) : [];
  }

  guide(actor: Actor, target: Point, speed: number, now: number): Point | undefined {
    const entry = this.ensureAgent(actor, now);
    if (!entry) return undefined;
    entry.steeredAt = now;
    if (Math.abs(entry.speed - speed) > 0.15) {
      entry.agent.updateParameters({ maxSpeed: Math.max(0.1, speed) });
      entry.speed = speed;
    }
    const changed = !entry.target || Math.hypot(target.x - entry.target.x, target.z - entry.target.z) > 1;
    const request = changed && now - entry.requestedAt > 0.25 || now - entry.requestedAt > 2;
    if (request) {
      if (!entry.agent.requestMoveTarget({ x: target.x, y: 0, z: target.z })) return undefined;
      entry.target = { x: target.x, z: target.z };
      entry.requestedAt = now;
    }
    if (!request && entry.target) {
      const velocity = entry.agent.desiredVelocityObstacleAdjusted();
      if (Math.hypot(velocity.x, velocity.z) > 0.05) return { x: velocity.x, z: velocity.z };
    }
    const path = this.path(actor, target);
    const waypoint = path.find((point) => Math.hypot(point.x - actor.x, point.z - actor.z) > 0.4);
    return waypoint ? { x: waypoint.x - actor.x, z: waypoint.z - actor.z } : undefined;
  }

  stop(actor: Actor) {
    const entry = this.agents.get(actor.id);
    if (entry?.target) { entry.agent.resetMoveTarget(); entry.target = undefined; }
  }

  dispose() {
    this.crowd.destroy();
    this.query.destroy();
    this.tileCache.destroy();
    this.navMesh.destroy();
    Raw.destroy(this.allocator);
    Raw.destroy(this.compressor);
    Raw.destroy(this.meshProcess.raw);
  }
}

/** Detour supplies paths and local crowd avoidance; the simulation remains position authority. */
export class WorldNavigation {
  private spaces = new Map<string, NavigationSpace>();
  private time = 0;
  private constructor(private exteriorData: Uint8Array, private interiorData: Uint8Array, private actors: Actor[]) {
    this.ensureSpace(EXTERIOR_SPACE);
  }

  static async fromData(actors: Actor[], exteriorData: Uint8Array, interiorData: Uint8Array) {
    await initializeRecast();
    return new WorldNavigation(exteriorData, interiorData, actors);
  }

  static async create(actors: Actor[], limit = 90) {
    await initializeRecast();
    return new WorldNavigation(buildBaseNavigation(limit), buildBaseNavigation(7), actors);
  }

  private ensureSpace(id: string) {
    let space = this.spaces.get(id);
    if (!space) {
      space = new NavigationSpace(id, id === EXTERIOR_SPACE ? this.exteriorData : this.interiorData, this.actors);
      this.spaces.set(id, space);
    }
    return space;
  }

  update(dt: number, actors: Actor[], currentSpace: string) {
    this.actors = actors;
    this.time += dt;
    this.ensureSpace(currentSpace);
    for (const space of this.spaces.values()) space.update(dt, actors, this.time);
  }

  guide(actor: Actor, target: Point, speed: number) { return this.ensureSpace(spaceOf(actor)).guide(actor, target, speed, this.time); }
  stop(actor: Actor) { this.spaces.get(spaceOf(actor))?.stop(actor); }
  findPath(from: Point, to: Point, space = EXTERIOR_SPACE) { return this.ensureSpace(space).path(from, to); }
  get info() { return { spaces: this.spaces.size, agents: [...this.spaces.values()].reduce((n, s) => n + s.agents.size, 0),
    obstacles: [...this.spaces.values()].reduce((n, s) => n + s.obstacles.size, 0),
    pathQueries: [...this.spaces.values()].reduce((n, s) => n + s.pathQueries, 0) }; }
  dispose() { for (const space of this.spaces.values()) space.dispose(); this.spaces.clear(); }
}