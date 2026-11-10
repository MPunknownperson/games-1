import type * as Rapier from '@dimforge/rapier3d-simd-compat';
import { EXTERIOR_SPACE, spaceOf } from './cells';
import { ITEMS } from './items';
import type { Actor } from './simulation';

export type PhysicsBackend = 'simd' | 'deterministic';
type RapierModule = typeof import('@dimforge/rapier3d-simd-compat');
const FIXED_STEP = 1 / 60;
const STATIC_GROUP = 0x00010006, KNOCKBACK_GROUP = 0x00020001, RAGDOLL_GROUP = 0x00040001;
const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };
const modules = new Map<PhysicsBackend, Promise<RapierModule>>();

async function loadRapier(backend: PhysicsBackend) {
  let promise = modules.get(backend);
  if (!promise) {
    promise = (backend === 'simd' ? import('@dimforge/rapier3d-simd-compat') : import('@dimforge/rapier3d-deterministic-compat'))
      .then(async (module) => { await module.init(); return module as unknown as RapierModule; });
    modules.set(backend, promise);
  }
  try { return await promise; } catch (error) { modules.delete(backend); throw error; }
}

interface StaticCollider { id: string; handle: number; x: number; y: number; z: number; radius: number; height: number }
interface PhysicsSpace { id: string; offset: number; ground: number; colliders: StaticCollider[] }
interface Knockback { id: string; space: string; handle: number; remaining: number; height: number }
export type RagdollPartName = 'torso' | 'head' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg' | 'creature';
interface RagdollPart { name: RagdollPartName; handle: number; size: [number, number, number] }
interface Ragdoll { id: string; space: string; remaining: number; parts: RagdollPart[] }
export interface RagdollPose {
  id: string;
  parts: { name: RagdollPartName; size: [number, number, number]; position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number } }[];
}
export interface PhysicsSnapshot {
  version: 1; backend: PhysicsBackend; engineVersion: string; tick: number; accumulator: number; syncTimer: number; lastRevision: number;
  bytes: Uint8Array; sensor: number; spaces: PhysicsSpace[]; knockbacks: Knockback[]; ragdolls: Ragdoll[];
}

/** Rapier owns impulses, swing sensors, and temporary ragdolls; the game owns actor state. */
export class GamePhysics {
  private world: Rapier.World;
  private spaces = new Map<string, PhysicsSpace>();
  private knockbacks = new Map<string, Knockback>();
  private ragdolls = new Map<string, Ragdoll>();
  private sensor: number;
  private accumulator = 0;
  private syncTimer = 0;
  private lastRevision = -1;
  tick = 0;

  private constructor(private readonly rapier: RapierModule, readonly backend: PhysicsBackend) {
    this.world = new rapier.World({ x: 0, y: -20, z: 0 });
    this.world.timestep = FIXED_STEP;
    this.sensor = this.world.createCollider(rapier.ColliderDesc.ball(1).setSensor(true).setEnabled(false)).handle;
  }

  static async create(preferred: PhysicsBackend = 'simd') {
    try { return new GamePhysics(await loadRapier(preferred), preferred); }
    catch (error) {
      if (preferred === 'deterministic') throw error;
      return new GamePhysics(await loadRapier('deterministic'), 'deterministic');
    }
  }

  private ensureSpace(id: string) {
    let space = this.spaces.get(id);
    if (space) return space;
    const offset = this.spaces.size * 400;
    const limit = id === EXTERIOR_SPACE ? 95 : 7;
    const ground = this.world.createCollider(this.rapier.ColliderDesc.cuboid(limit, 0.1, limit)
      .setTranslation(offset, -0.1, 0).setCollisionGroups(STATIC_GROUP)).handle;
    space = { id, offset, ground, colliders: [] };
    this.spaces.set(id, space);
    return space;
  }

  private isStaticObstacle(actor: Actor, space: string) {
    if (!actor.alive || actor.carriedBy || spaceOf(actor) !== space) return false;
    if (actor.kind === 'item') return !!actor.itemType && ITEMS[actor.itemType].mass >= 3 && !!actor.sleeping && actor.y < 0.6;
    return actor.solid && actor.kind !== 'player' && actor.kind !== 'villager' && actor.kind !== 'foe';
  }

  syncSpace(id: string, actors: Actor[]) {
    const space = this.ensureSpace(id);
    const desired = actors.filter((a) => this.isStaticObstacle(a, id)).sort((a, b) => a.id.localeCompare(b.id));
    const byId = new Map(desired.map((actor) => [actor.id, actor]));
    for (const entry of space.colliders) if (!byId.has(entry.id)) this.world.removeCollider(this.world.getCollider(entry.handle), true);
    space.colliders = space.colliders.filter((entry) => byId.has(entry.id));
    const existing = new Map(space.colliders.map((entry) => [entry.id, entry]));
    for (const actor of desired) {
      let entry = existing.get(actor.id);
      const radius = Math.max(0.05, actor.radius), height = Math.max(0.1, actor.height);
      if (!entry) {
        const collider = this.world.createCollider(this.rapier.ColliderDesc.cylinder(height / 2, radius)
          .setTranslation(actor.x + space.offset, actor.y + height / 2, actor.z).setCollisionGroups(STATIC_GROUP));
        entry = { id: actor.id, handle: collider.handle, x: actor.x, y: actor.y, z: actor.z, radius, height };
        space.colliders.push(entry);
      } else if (entry.x !== actor.x || entry.y !== actor.y || entry.z !== actor.z || entry.radius !== radius || entry.height !== height) {
        const collider = this.world.getCollider(entry.handle);
        if (entry.radius !== radius || entry.height !== height) collider.setShape(new this.rapier.Cylinder(height / 2, radius));
        collider.setTranslation({ x: actor.x + space.offset, y: actor.y + height / 2, z: actor.z });
        Object.assign(entry, { x: actor.x, y: actor.y, z: actor.z, radius, height });
      }
    }
  }

  swingCandidates(attacker: Actor, range: number, candidates: Actor[]) {
    const space = this.ensureSpace(spaceOf(attacker));
    const sensor = this.world.getCollider(this.sensor);
    sensor.setShape(new this.rapier.Ball(range));
    sensor.setTranslation({ x: attacker.x + space.offset, y: attacker.y + Math.min(1, attacker.height / 2), z: attacker.z });
    return candidates.filter((target) => spaceOf(target) === space.id && target.alive && sensor.intersectsShape(
      new this.rapier.Cylinder(Math.max(0.05, target.height / 2), Math.max(0.05, target.radius)),
      { x: target.x + space.offset, y: target.y + Math.max(0.05, target.height / 2), z: target.z }, IDENTITY,
    ));
  }

  knockback(actor: Actor, x: number, z: number) {
    const ragdoll = this.ragdolls.get(actor.id);
    if (ragdoll) {
      for (const part of ragdoll.parts) this.world.getRigidBody(part.handle).applyImpulse({ x: x * 0.22, y: 0.08, z: z * 0.22 }, true);
      return;
    }
    if (!actor.alive || actor.hp <= 0) return;
    const space = this.ensureSpace(spaceOf(actor));
    let entry = this.knockbacks.get(actor.id);
    if (entry && entry.space !== space.id) { this.removeKnockback(actor.id); entry = undefined; }
    if (!entry) {
      const height = Math.max(0.6, actor.height);
      const radius = Math.min(Math.max(0.15, actor.radius), height / 2 - 0.05);
      const body = this.world.createRigidBody(this.rapier.RigidBodyDesc.dynamic()
        .setTranslation(actor.x + space.offset, actor.y + height / 2, actor.z).setGravityScale(0)
        .lockRotations().setLinearDamping(5).setCcdEnabled(true));
      this.world.createCollider(this.rapier.ColliderDesc.capsule(Math.max(0.05, height / 2 - radius), radius)
        .setMass(1).setCollisionGroups(KNOCKBACK_GROUP), body);
      body.recomputeMassPropertiesFromColliders();
      entry = { id: actor.id, space: space.id, handle: body.handle, remaining: 0.8, height };
      this.knockbacks.set(actor.id, entry);
    }
    entry.remaining = 0.8;
    this.world.getRigidBody(entry.handle).applyImpulse({ x, y: 0, z }, true);
  }

  private removeKnockback(id: string) {
    const entry = this.knockbacks.get(id);
    if (!entry) return;
    this.world.removeRigidBody(this.world.getRigidBody(entry.handle));
    this.knockbacks.delete(id);
  }

  spawnRagdoll(actor: Actor, actors: Actor[]) {
    this.removeKnockback(actor.id);
    this.removeRagdoll(actor.id);
    const space = this.ensureSpace(spaceOf(actor));
    this.syncSpace(space.id, actors);
    while (this.ragdolls.size >= 8) this.removeRagdoll(this.ragdolls.keys().next().value!);
    const humanoid = actor.kind !== 'foe' || actor.foeKind === 'brute' || actor.foeKind === 'stalker';
    const definitions: { name: RagdollPartName; x: number; y: number; size: [number, number, number] }[] = humanoid ? [
      { name: 'torso', x: 0, y: 1.14, size: [0.44, 0.62, 0.28] },
      { name: 'head', x: 0, y: 1.75, size: [0.26, 0.28, 0.26] },
      { name: 'leftArm', x: 0.33, y: 1.19, size: [0.13, 0.55, 0.14] },
      { name: 'rightArm', x: -0.33, y: 1.19, size: [0.13, 0.55, 0.14] },
      { name: 'leftLeg', x: 0.12, y: 0.43, size: [0.16, 0.82, 0.18] },
      { name: 'rightLeg', x: -0.12, y: 0.43, size: [0.16, 0.82, 0.18] },
    ] : [{ name: 'creature', x: 0, y: actor.height / 2, size: [actor.radius * 1.6, actor.height, actor.radius * 1.6] }];
    const sin = Math.sin(actor.facing), cos = Math.cos(actor.facing);
    const rotation = { x: 0, y: Math.sin(actor.facing / 2), z: 0, w: Math.cos(actor.facing / 2) };
    const parts: RagdollPart[] = [];
    for (const definition of definitions) {
      const body = this.world.createRigidBody(this.rapier.RigidBodyDesc.dynamic()
        .setTranslation(actor.x + space.offset + definition.x * cos, actor.y + definition.y, actor.z - definition.x * sin)
        .setRotation(rotation).setLinvel(actor.vx, Math.max(0, actor.vy), actor.vz).setLinearDamping(0.8).setAngularDamping(1.1));
      const [x, y, z] = definition.size;
      this.world.createCollider(this.rapier.ColliderDesc.cuboid(x / 2, y / 2, z / 2).setMass(0.5)
        .setFriction(0.8).setCollisionGroups(RAGDOLL_GROUP), body);
      body.recomputeMassPropertiesFromColliders();
      parts.push({ name: definition.name, handle: body.handle, size: definition.size });
    }
    if (humanoid) {
      const torso = this.world.getRigidBody(parts[0].handle);
      const anchors = [
        [{ x: 0, y: 0.31, z: 0 }, { x: 0, y: -0.14, z: 0 }],
        [{ x: 0.22, y: 0.2, z: 0 }, { x: 0, y: 0.25, z: 0 }],
        [{ x: -0.22, y: 0.2, z: 0 }, { x: 0, y: 0.25, z: 0 }],
        [{ x: 0.12, y: -0.31, z: 0 }, { x: 0, y: 0.4, z: 0 }],
        [{ x: -0.12, y: -0.31, z: 0 }, { x: 0, y: 0.4, z: 0 }],
      ] as const;
      anchors.forEach(([parent, child], i) => this.world.createImpulseJoint(
        this.rapier.JointData.spherical(parent, child), torso, this.world.getRigidBody(parts[i + 1].handle), true,
      ));
    }
    this.ragdolls.set(actor.id, { id: actor.id, space: space.id, remaining: 8, parts });
  }

  removeRagdoll(id: string) {
    const ragdoll = this.ragdolls.get(id);
    if (!ragdoll) return;
    for (const part of ragdoll.parts) this.world.removeRigidBody(this.world.getRigidBody(part.handle));
    this.ragdolls.delete(id);
  }
  hasRagdoll(id: string) { return this.ragdolls.has(id); }

  step(dt: number, actors: Actor[], currentSpace: string, revision: number, move: (actor: Actor, dx: number, dz: number) => void) {
    this.syncTimer += dt;
    if (this.syncTimer >= 0.25 || revision !== this.lastRevision || !this.spaces.has(currentSpace)) {
      this.syncTimer = 0; this.lastRevision = revision;
      const spaces = new Set([currentSpace, ...[...this.knockbacks.values()].map((v) => v.space), ...[...this.ragdolls.values()].map((v) => v.space)]);
      for (const id of spaces) this.syncSpace(id, actors);
    }
    const byId = new Map(actors.map((actor) => [actor.id, actor]));
    const starts = new Map<string, { x: number; z: number }>();
    for (const entry of this.knockbacks.values()) {
      const actor = byId.get(entry.id), space = this.spaces.get(entry.space);
      if (!actor || !actor.alive || actor.hp <= 0 || !space || spaceOf(actor) !== entry.space) continue;
      const body = this.world.getRigidBody(entry.handle);
      body.setTranslation({ x: actor.x + space.offset, y: actor.y + entry.height / 2, z: actor.z }, true);
      starts.set(entry.id, { x: actor.x + space.offset, z: actor.z });
    }
    this.accumulator += Math.max(0, Math.min(dt, 0.25));
    while (this.accumulator + 1e-9 >= FIXED_STEP) { this.world.step(); this.accumulator -= FIXED_STEP; this.tick++; }
    for (const entry of [...this.knockbacks.values()]) {
      const actor = byId.get(entry.id), start = starts.get(entry.id);
      entry.remaining -= dt;
      if (!actor || !start || entry.remaining <= 0) { this.removeKnockback(entry.id); continue; }
      const body = this.world.getRigidBody(entry.handle), position = body.translation(), velocity = body.linvel();
      move(actor, position.x - start.x, position.z - start.z);
      if (Math.hypot(velocity.x, velocity.z) < 0.08) this.removeKnockback(entry.id);
    }
    for (const ragdoll of [...this.ragdolls.values()]) {
      ragdoll.remaining -= dt;
      if (ragdoll.remaining <= 0) this.removeRagdoll(ragdoll.id);
    }
  }

  poses(spaceId: string): RagdollPose[] {
    const space = this.spaces.get(spaceId);
    if (!space) return [];
    return [...this.ragdolls.values()].filter((ragdoll) => ragdoll.space === spaceId).map((ragdoll) => ({
      id: ragdoll.id, parts: ragdoll.parts.map((part) => {
        const body = this.world.getRigidBody(part.handle), position = body.translation(), rotation = body.rotation();
        return { name: part.name, size: part.size, position: { x: position.x - space.offset, y: position.y, z: position.z },
          rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w } };
      }),
    }));
  }

  capture(): PhysicsSnapshot {
    return { version: 1, backend: this.backend, engineVersion: this.rapier.version(), tick: this.tick, accumulator: this.accumulator,
      syncTimer: this.syncTimer, lastRevision: this.lastRevision,
      bytes: this.world.takeSnapshot(), sensor: this.sensor, spaces: structuredClone([...this.spaces.values()]),
      knockbacks: structuredClone([...this.knockbacks.values()]), ragdolls: structuredClone([...this.ragdolls.values()]) };
  }

  restore(snapshot: PhysicsSnapshot) {
    if (snapshot.version !== 1 || snapshot.backend !== this.backend || snapshot.engineVersion !== this.rapier.version()) {
      throw new Error('Physics snapshot backend or version does not match');
    }
    const restored = this.rapier.World.restoreSnapshot(snapshot.bytes);
    this.world.free();
    this.world = restored;
    this.sensor = snapshot.sensor; this.tick = snapshot.tick; this.accumulator = snapshot.accumulator;
    this.spaces = new Map(structuredClone(snapshot.spaces).map((space) => [space.id, space]));
    this.knockbacks = new Map(structuredClone(snapshot.knockbacks).map((entry) => [entry.id, entry]));
    this.ragdolls = new Map(structuredClone(snapshot.ragdolls).map((entry) => [entry.id, entry]));
    this.lastRevision = snapshot.lastRevision; this.syncTimer = snapshot.syncTimer;
  }

  get info() { return { backend: this.backend, tick: this.tick, ragdolls: this.ragdolls.size, knockbacks: this.knockbacks.size }; }
  dispose() { this.world.free(); this.spaces.clear(); this.knockbacks.clear(); this.ragdolls.clear(); }
}

/** Bounded physics-only checkpoint storage for a future input/rollback transport. */
export class PhysicsRollbackBuffer {
  private frames = new Map<number, PhysicsSnapshot>();
  constructor(private readonly capacity = 120) { if (!Number.isInteger(capacity) || capacity < 1) throw new Error('Rollback capacity must be positive'); }
  save(frame: number, physics: GamePhysics) {
    this.frames.set(frame, physics.capture());
    while (this.frames.size > this.capacity) this.frames.delete(Math.min(...this.frames.keys()));
  }
  restore(frame: number, physics: GamePhysics) {
    const snapshot = this.frames.get(frame);
    if (!snapshot) return false;
    physics.restore(snapshot);
    return true;
  }
  clear() { this.frames.clear(); }
}

/** Stores caller-owned game state and inputs alongside deterministic physics checkpoints. */
export class RollbackTimeline<State, Input> {
  private frames = new Map<number, { physics: PhysicsSnapshot; state: State }>();
  private inputs = new Map<number, Input>();
  constructor(private readonly capacity = 120) { if (!Number.isInteger(capacity) || capacity < 1) throw new Error('Rollback capacity must be positive'); }

  capture(frame: number, physics: GamePhysics, state: State) {
    if (physics.backend !== 'deterministic') throw new Error('Rollback replay requires the deterministic Rapier backend');
    this.frames.set(frame, { physics: physics.capture(), state: structuredClone(state) });
    while (this.frames.size > this.capacity) this.frames.delete(Math.min(...this.frames.keys()));
    const oldest = this.frames.size ? Math.min(...this.frames.keys()) : undefined;
    if (oldest !== undefined) for (const tick of this.inputs.keys()) if (tick < oldest) this.inputs.delete(tick);
  }

  recordInput(frame: number, input: Input) {
    this.inputs.set(frame, structuredClone(input));
    while (this.inputs.size > this.capacity) this.inputs.delete(Math.min(...this.inputs.keys()));
  }

  rewindAndReplay(from: number, to: number, physics: GamePhysics, restoreState: (state: State) => void, step: (input: Input, frame: number) => void) {
    const checkpoint = this.frames.get(from);
    if (!checkpoint || to < from || physics.backend !== 'deterministic') return false;
    for (let frame = from; frame < to; frame++) if (!this.inputs.has(frame)) return false;
    physics.restore(checkpoint.physics);
    restoreState(structuredClone(checkpoint.state));
    for (let frame = from; frame < to; frame++) step(structuredClone(this.inputs.get(frame)!), frame);
    return true;
  }

  clear() { this.frames.clear(); this.inputs.clear(); }
}