import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { acceleratedRaycast, MeshBVH } from 'three-mesh-bvh';
import { WorldNavigation } from '../src/world/navigation';
import { WorldSpatialIndex } from '../src/world/spatialIndex';
import { SandboxWorld, type Actor, type ActorKind } from '../src/world/simulation';

function actor(id: string, kind: ActorKind, x: number, z: number, extra: Partial<Actor> = {}): Actor {
  return { id, kind, name: id, x, z, y: 0, vx: 0, vy: 0, vz: 0, radius: 0.45, height: 1.8,
    solid: false, alive: true, hp: 100, maxHp: 100, faction: 'neutral', facing: 0, variant: 0, ...extra };
}

test('instanced object BVH refits moved bodies and blocks melee through solids', () => {
  const index = new WorldSpatialIndex();
  const attacker = actor('attacker', 'player', 0, 0);
  const target = actor('target', 'foe', 0, 2.4);
  const wall = actor('wall', 'tree', 0, 1.1, { solid: true, radius: 0.3, height: 4 });
  const actors = [attacker, target, wall];
  index.sync(actors, 'exterior');
  assert.ok(index.nearby('exterior', attacker, 2.4).some((a) => a.id === target.id));
  assert.equal(index.clearLine('exterior', attacker, target), false);
  wall.x = 5;
  index.sync(actors, 'exterior');
  assert.equal(index.clearLine('exterior', attacker, target), true);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 30);
  camera.position.set(0, 1, -4); camera.lookAt(0, 1, 0); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  assert.ok(index.visible('exterior', frustum).has(target.id));
  index.dispose();

  const world = new SandboxWorld(101);
  const player = world.player, foe = world.actors.find((a) => a.kind === 'foe')!, tree = world.actors.find((a) => a.kind === 'tree')!;
  player.x = 0; player.z = 0; player.y = 0; player.facing = 0;
  foe.x = 0; foe.z = 2.2; foe.y = 0; foe.hp = foe.maxHp;
  tree.x = 0; tree.z = 1.1; tree.radius = 0.3; tree.height = 4; tree.solid = true; tree.alive = true;
  world.actors = [player, foe, tree];
  const strike = (world as unknown as { playerStrike(step: number): void }).playerStrike.bind(world);
  const health = foe.hp;
  strike(1);
  assert.equal(foe.hp, health, 'a solid tree did not block the strike');
  tree.x = 5;
  strike(1);
  assert.ok(foe.hp < health, 'a moved blocker remained in the BVH');
  world.disposeNavigation();
});

test('Recast routes around obstacles and updates a moved or removed crate', async () => {
  const walker = actor('walker', 'villager', -8, 0);
  const tree = actor('tree', 'tree', 0, 0, { solid: true, radius: 2, height: 4 });
  const actors = [walker, tree];
  const navigation = await WorldNavigation.create(actors, 12);
  try {
    const blocked = navigation.findPath({ x: -8, z: 0 }, { x: 8, z: 0 });
    assert.ok(blocked.length > 2 && blocked.some((p) => Math.abs(p.z) > 1), `path did not avoid the tree: ${JSON.stringify(blocked)}`);
    tree.alive = false;
    for (let i = 0; i < 10; i++) navigation.update(0.05, actors, 'exterior');
    const cleared = navigation.findPath({ x: -8, z: 0 }, { x: 8, z: 0 });
    assert.ok(cleared.length <= 2 || cleared.every((p) => Math.abs(p.z) < 0.6), `removed obstacle still blocked the route: ${JSON.stringify(cleared)}`);
    const crate = actor('crate', 'item', 0, 0, { itemType: 'crate', radius: 1.2, height: 1, sleeping: true });
    actors.push(crate);
    for (let i = 0; i < 10; i++) navigation.update(0.05, actors, 'exterior');
    const cratePath = navigation.findPath({ x: -8, z: 0 }, { x: 8, z: 0 });
    assert.ok(cratePath.length > 2, 'a stationary crate did not create a dynamic obstacle');
    crate.x = 7; crate.z = 7;
    for (let i = 0; i < 10; i++) navigation.update(0.05, actors, 'exterior');
    const moved = navigation.findPath({ x: -8, z: 0 }, { x: 8, z: 0 });
    assert.ok(moved.length <= 2 || moved.every((p) => Math.abs(p.z) < 0.6), 'the old crate obstacle was not removed');
    crate.carriedBy = 'walker';
    for (let i = 0; i < 10; i++) navigation.update(0.05, actors, 'exterior');
    assert.equal(navigation.info.obstacles, 0, 'a carried crate remained on the navmesh');
    const gate = actor('gate', 'barricade', 0, 0, { solid: true, radius: 1.2, height: 3 });
    actors.push(gate);
    for (let i = 0; i < 10; i++) navigation.update(0.05, actors, 'exterior');
    assert.ok(navigation.findPath({ x: -8, z: 0 }, { x: 8, z: 0 }).length > 2, 'a closed gate did not block navigation');
    gate.y = 3;
    for (let i = 0; i < 10; i++) navigation.update(0.05, actors, 'exterior');
    const open = navigation.findPath({ x: -8, z: 0 }, { x: 8, z: 0 });
    assert.ok(open.length <= 2 || open.every((p) => Math.abs(p.z) < 0.6), 'a raised gate still blocked navigation');
  } finally { navigation.dispose(); }
});

test('crowd guidance moves multiple agents around a blocking obstacle', async () => {
  const agents = [actor('a', 'foe', -8, -0.7), actor('b', 'foe', -8, 0.7)];
  const obstacle = actor('blocker', 'tree', 0, 0, { solid: true, radius: 1.6, height: 4 });
  const actors = [...agents, obstacle];
  const navigation = await WorldNavigation.create(actors, 12);
  try {
    const target = { x: 8, z: 0 };
    for (let tick = 0; tick < 240; tick++) {
      navigation.update(0.05, actors, 'exterior');
      for (const a of agents) {
        if (Math.hypot(a.x - target.x, a.z - target.z) < 0.8) { navigation.stop(a); continue; }
        const direction = navigation.guide(a, target, 2.5);
        if (!direction) continue;
        const length = Math.hypot(direction.x, direction.z);
        a.x += direction.x / length * 0.125;
        a.z += direction.z / length * 0.125;
      }
    }
    assert.equal(navigation.info.agents, 2);
    assert.ok(navigation.info.pathQueries > 0);
    assert.ok(agents.every((a) => a.x > 4), `crowd failed to navigate around obstacle: ${JSON.stringify(agents.map(({ x, z }) => ({ x, z })))}`);
  } finally { navigation.dispose(); }
});

test('the live world uses Recast guidance while preserving NPC jobs', async () => {
  const world = new SandboxWorld(5);
  assert.equal(await world.initializeNavigation(), true);
  try {
    const iona = world.npc('Iona')!;
    world.player.x = iona.work!.x; world.player.z = iona.work!.z;
    iona.x = iona.work!.x - 6; iona.z = iona.work!.z; iona.utility = undefined; iona.decideIn = 0;
    iona.needs!.hunger = 0; iona.needs!.social = 0; iona.needs!.fun = 0; iona.needs!.energy = 0.9;
    world.elapsed = (10 - 8) * 30;
    for (let i = 0; i < 400; i++) world.update(0.05);
    const distance = Math.hypot(iona.x - iona.work!.x, iona.z - iona.work!.z);
    assert.ok(distance > 0.9 && distance < 3, `worker ended ${distance.toFixed(2)} from her station`);
    assert.equal(iona.activity, 'Masonry');
    assert.equal(world.navigationStatus, 'ready');
    assert.ok((world.navigationInfo?.agents ?? 0) > 0 && (world.navigationInfo?.pathQueries ?? 0) > 0);
  } finally { world.disposeNavigation(); }
});

test('navigation failure preserves playable steering and can be retried', async () => {
  const world = new SandboxWorld(33);
  assert.equal(await world.initializeNavigation(async () => { throw new Error('WASM unavailable'); }), false);
  assert.equal(world.navigationStatus, 'fallback');
  const before = world.player.z;
  world.input = { x: 0, z: 1, sprint: false };
  for (let i = 0; i < 10; i++) world.update(0.05);
  assert.notEqual(world.player.z, before, 'fallback steering froze the player');
  assert.equal(await world.initializeNavigation(), true);
  assert.equal(world.navigationStatus, 'ready');
  world.disposeNavigation();
});

test('Detour crowd supports a larger group of moving enemies', async () => {
  const agents = Array.from({ length: 80 }, (_, i) => actor(`foe-${i}`, 'foe', -9 + (i % 10) * 0.8, -8 + Math.floor(i / 10) * 0.8, { radius: 0.3 }));
  const navigation = await WorldNavigation.create(agents, 12);
  try {
    const started = performance.now();
    for (let tick = 0; tick < 20; tick++) {
      navigation.update(0.05, agents, 'exterior');
      for (const a of agents) {
        const direction = navigation.guide(a, { x: 8, z: 8 }, 2);
        if (!direction) continue;
        const length = Math.hypot(direction.x, direction.z);
        if (length > 0) { a.x += direction.x / length * 0.1; a.z += direction.z / length * 0.1; }
      }
    }
    assert.equal(navigation.info.agents, agents.length);
    assert.ok(agents.every((a) => Number.isFinite(a.x + a.z)));
    console.log(`  80-agent navigation update: ${((performance.now() - started) / 20).toFixed(3)} ms per step`);
  } finally { navigation.dispose(); }
});

test('triangle BVH preserves nearest ray hits on a high-polygon mesh', () => {
  const geometry = new THREE.PlaneGeometry(100, 100, 1000, 500);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.updateMatrixWorld();
  const raycaster = new THREE.Raycaster(new THREE.Vector3(1.2, 2.3, 10), new THREE.Vector3(0, 0, -1));
  const reference = raycaster.intersectObject(mesh)[0];
  geometry.boundsTree = new MeshBVH(geometry);
  mesh.raycast = acceleratedRaycast;
  raycaster.firstHitOnly = true;
  const warmup = raycaster.intersectObject(mesh)[0];
  assert.ok(reference && warmup && Math.abs(reference.distance - warmup.distance) < 1e-6);
  const started = performance.now();
  for (let i = 0; i < 200; i++) raycaster.intersectObject(mesh);
  console.log(`  BVH ray average: ${((performance.now() - started) / 200).toFixed(3)} ms on 1,000,000 triangles`);
  geometry.dispose(); (mesh.material as THREE.Material).dispose();
});