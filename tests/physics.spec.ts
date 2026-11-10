import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GamePhysics, PhysicsRollbackBuffer, RollbackTimeline } from '../src/world/physics';
import { SandboxWorld, type Actor, type ActorKind } from '../src/world/simulation';

function actor(id: string, kind: ActorKind, x: number, z: number, extra: Partial<Actor> = {}): Actor {
  return { id, kind, name: id, x, z, y: 0, vx: 0, vy: 0, vz: 0, radius: 0.45, height: 1.8,
    solid: false, alive: true, hp: 100, maxHp: 100, faction: 'neutral', facing: 0, variant: 0, ...extra };
}
const move = (a: Actor, dx: number, dz: number) => { a.x += dx; a.z += dz; };

test('Rapier swing sensor intersects nearby bodies without treating itself as a solid', async () => {
  const physics = await GamePhysics.create('deterministic');
  try {
    const player = actor('player', 'player', 0, 0);
    const near = actor('near', 'foe', 0, 2.6);
    const far = actor('far', 'foe', 0, 4);
    const otherSpace = actor('inside', 'foe', 0, 1, { spaceId: 'interior:house' });
    assert.deepEqual(physics.swingCandidates(player, 2.4, [near, far, otherSpace]).map((a) => a.id), ['near']);
  } finally { physics.dispose(); }
});

test('fixed-step Rapier impulses move actors and respect physical obstacles', async () => {
  const physics = await GamePhysics.create('deterministic');
  try {
    const target = actor('target', 'foe', 0, 0);
    const wall = actor('wall', 'tree', 0, 2, { solid: true, radius: 0.5, height: 3 });
    const actors = [target, wall];
    physics.syncSpace('exterior', actors);
    physics.knockback(target, 0, 8);
    for (let i = 0; i < 60; i++) physics.step(1 / 60, actors, 'exterior', 0, move);
    assert.ok(target.z > 0.1 && target.z < 1.4, `unexpected knockback position ${target.z}`);
    assert.equal(physics.info.tick, 60);
  } finally { physics.dispose(); }
});

test('jointed ragdolls respond to impulses and are removed after their lifetime', async () => {
  const physics = await GamePhysics.create('deterministic');
  try {
    const victim = actor('victim', 'villager', 0, 0, { alive: false, hp: 0 });
    physics.spawnRagdoll(victim, [victim]);
    const initial = physics.poses('exterior')[0];
    assert.equal(initial.parts.length, 6);
    physics.knockback(victim, 5, 0);
    for (let i = 0; i < 90; i++) physics.step(1 / 60, [victim], 'exterior', 0, move);
    const fallen = physics.poses('exterior')[0];
    assert.ok(fallen.parts.some((part, i) => Math.abs(part.position.x - initial.parts[i].position.x) > 0.1));
    assert.ok(fallen.parts.every((part) => Number.isFinite(part.position.x + part.position.y + part.position.z) && part.position.y > -0.5));
    for (let i = 0; i < 400; i++) physics.step(1 / 60, [victim], 'exterior', 0, move);
    assert.equal(physics.hasRagdoll(victim.id), false);
  } finally { physics.dispose(); }
});

test('physics snapshots restore and replay fixed-step impulses on the deterministic backend', async () => {
  const physics = await GamePhysics.create('deterministic');
  const simd = await GamePhysics.create('simd');
  try {
    const target = actor('target', 'foe', 0, 0);
    const actors = [target];
    physics.syncSpace('exterior', actors);
    physics.knockback(target, 4, 1);
    for (let i = 0; i < 12; i++) physics.step(1 / 60, actors, 'exterior', 0, move);
    const checkpoint = { x: target.x, z: target.z };
    const buffer = new PhysicsRollbackBuffer(3);
    buffer.save(12, physics);
    const snapshot = physics.capture();
    if (simd.backend !== snapshot.backend) assert.throws(() => simd.restore(snapshot), /backend or version/);
    for (let i = 0; i < 30; i++) physics.step(1 / 60, actors, 'exterior', 0, move);
    const first = { x: target.x, z: target.z, tick: physics.info.tick };
    target.x = checkpoint.x; target.z = checkpoint.z;
    assert.equal(buffer.restore(12, physics), true);
    for (let i = 0; i < 30; i++) physics.step(1 / 60, actors, 'exterior', 0, move);
    assert.deepEqual({ x: target.x, z: target.z, tick: physics.info.tick }, first);
    assert.equal(buffer.restore(999, physics), false);
  } finally { physics.dispose(); simd.dispose(); }
});

test('live combat uses Rapier hit sensors and creates a visible ragdoll state', async () => {
  const world = new SandboxWorld(101);
  assert.equal(await world.initializePhysics('deterministic'), true);
  try {
    const player = world.player, foe = world.actors.find((a) => a.kind === 'foe' && a.foeKind === 'brute')!;
    player.x = 0; player.y = 0; player.z = 0; player.facing = 0;
    foe.x = 0; foe.y = 0; foe.z = 2; foe.hp = 1; foe.alive = true;
    world.actors = [player, foe];
    (world as unknown as { playerStrike(step: number): void }).playerStrike(1);
    assert.equal(foe.alive, false);
    assert.equal(world.hasRagdoll(foe.id), true);
    const before = world.ragdollPoses()[0].parts[0].position;
    for (let i = 0; i < 30; i++) world.update(1 / 60);
    const after = world.ragdollPoses()[0].parts[0].position;
    assert.ok(Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z) > 0.05);
    assert.ok(world.capturePhysicsSnapshot()?.bytes.length);
  } finally { world.disposePhysics(); }
});

test('rollback timeline restores caller state and replays recorded fixed-step inputs', async () => {
  const physics = await GamePhysics.create('deterministic');
  try {
    const target = actor('replay-target', 'foe', 0, 0), actors = [target];
    physics.syncSpace('exterior', actors);
    const timeline = new RollbackTimeline<{ x: number; z: number }, { x: number; z: number }>(64);
    timeline.capture(0, physics, { x: target.x, z: target.z });
    const step = (input: { x: number; z: number }) => {
      if (input.x || input.z) physics.knockback(target, input.x, input.z);
      physics.step(1 / 60, actors, 'exterior', 0, move);
    };
    for (let frame = 0; frame < 40; frame++) {
      const input = frame === 0 ? { x: 4, z: 1 } : frame === 14 ? { x: -1, z: 2 } : { x: 0, z: 0 };
      timeline.recordInput(frame, input);
      step(input);
    }
    const expected = { x: target.x, z: target.z, tick: physics.tick, bytes: physics.capture().bytes };
    assert.equal(timeline.rewindAndReplay(0, 40, physics, (state) => { target.x = state.x; target.z = state.z; }, step), true);
    assert.deepEqual({ x: target.x, z: target.z, tick: physics.tick, bytes: physics.capture().bytes }, expected);
    assert.equal(timeline.rewindAndReplay(0, 41, physics, () => {}, step), false, 'missing input was silently replayed');
  } finally { physics.dispose(); }
});