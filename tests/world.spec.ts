import assert from 'node:assert/strict';
import { SandboxWorld, PLAYER_ID, type Actor } from '../src/world/simulation';
import { DUNGEON_SITES, RADIANT_SITES } from '../src/world/narrative';
import { activePackage } from '../src/world/packages';
import { animateRig, buildRig } from '../src/world/rig';
import { planTactic } from '../src/world/tactics';
import { canRetaliate, foePatrolPoint, FOE_BEHAVIORS, PROFESSION_DUTIES, roleResponse } from '../src/world/roles';
import { brainFor, PROFESSION_BRAINS } from '../src/world/brains';
import { parseCollision, parseVisual } from '../src/world/cellArchive';
import { isPrecombinedStatic } from '../src/world/renderBatches';
import { TERRAIN_LOD_LEVELS, selectTerrainTiles, terrainHeight, terrainTileGeometry } from '../src/world/terrainLod';
import { GLOBAL_WATER_HEIGHT, WATER_BODIES, waterGeometry } from '../src/world/waterLod';
import { isOccluded, occlusionPlanes } from '../src/world/occlusion';
import { screenDoorMaterial, setScreenDoorFade } from '../src/world/screenDoor';
import * as THREE from 'three';
import { canSee, chooseGoal } from '../src/world/vivid';
import { BASE_OBJECTS } from '../src/world/content';
import { ENGINE_UNITS_PER_CELL, WORLD_UNITS_PER_CELL, cellKey, exteriorCell, interiorSpace, uExteriorCellBuffer } from '../src/world/cells';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);
const tick = (w: SandboxWorld, seconds: number) => { for (let i = 0; i < seconds * 20; i++) w.update(0.05); };
/** Stand the guardian just in front of an actor, facing it. */
const face = (w: SandboxWorld, a: Actor, gap = 0.25) => {
  const p = w.player;
  p.x = a.x; p.z = a.z + a.radius + p.radius + gap; p.facing = Math.PI; p.vx = p.vz = 0; p.action = undefined;
};
const save = (w: SandboxWorld) => new SandboxWorld(w.seed, JSON.parse(JSON.stringify(w.snapshot())));

test('the valley is large, seeded and populated with physical objects', () => {
  const a = new SandboxWorld(123), b = new SandboxWorld(123);
  assert.deepEqual(a.actors.map((x) => [x.kind, x.x, x.z]), b.actors.map((x) => [x.kind, x.x, x.z]));
  assert.ok(a.actors.length > 250, `only ${a.actors.length} actors`);
  assert.equal(a.actors.filter((x) => x.kind === 'villager').length, 14);
  assert.ok(a.actors.filter((x) => x.kind === 'item').length >= 60);
  assert.ok(a.actors.some((x) => Math.abs(x.x) > 60));
});

test('the main quest runs through dialogue, gathering, building, the stones and a defence', () => {
  const w = new SandboxWorld(9);
  face(w, w.npc('Mara')!);
  assert.equal(w.interact(), true);
  w.choose('light-meet');
  w.closeDialogue();
  assert.equal(w.questStage('light'), 'supply');
  const tree = w.actors.find((a) => a.kind === 'tree' && Math.hypot(a.x, a.z) < 25)!;
  const logsBefore = w.actors.filter((a) => a.itemType === 'log').length;
  face(w, tree);
  w.interact();
  tick(w, 1.5);
  assert.equal(w.actors.filter((a) => a.itemType === 'log').length, logsBefore + 1, 'chopping drops a log');
  const log = w.actors.find((a) => a.itemType === 'log')!;
  tick(w, 2);
  face(w, log, 0.05);
  w.interact();
  assert.equal(w.stock.wood, 2);
  w.stock.wood = 6; w.stock.stone = 4;
  tick(w, 0.6);
  assert.equal(w.questStage('light'), 'build');
  assert.equal(w.build('archer', { x: 6, z: -10 }), true);
  tick(w, 0.6);
  assert.equal(w.questStage('light'), 'stones');
  for (const rune of w.actors.filter((a) => a.kind === 'rune')) {
    face(w, rune);
    for (let i = 0; i < 3 && rune.currentRune !== rune.targetRune; i++) w.interact();
  }
  tick(w, 0.6);
  assert.equal(w.questStage('light'), 'defend');
  assert.equal(w.stock.essence, 1);
  face(w, w.actors.find((a) => a.kind === 'bell')!);
  w.interact();
  assert.equal(w.waveActive, true);
  w.spawnQueue = 0;
  for (const f of w.actors) if (f.intent === 'raid') f.alive = false;
  tick(w, 0.6);
  assert.equal(w.questStage('light'), 'report');
  face(w, w.npc('Mara')!);
  w.interact();
  const gold = w.stock.gold;
  w.choose('light-report');
  assert.equal(w.quests.light.status, 'done');
  assert.equal(w.stock.gold, gold + 75);
});

test('objects carried elsewhere stay exactly where they were left, across saves', () => {
  const w = new SandboxWorld(5);
  const crate = w.actors.find((a) => a.itemType === 'crate' && a.x === 4)!;
  face(w, crate);
  w.secondary();
  tick(w, 0.4);
  assert.equal(crate.carriedBy, w.player.id);
  w.input = { x: 1, z: 0, sprint: false };
  tick(w, 2.5);
  w.input = { x: 0, z: 0, sprint: false };
  tick(w, 0.3);
  w.secondary();
  tick(w, 3);
  assert.equal(crate.carriedBy, undefined);
  assert.equal(crate.sleeping, true);
  const left = { x: crate.x, y: crate.y, z: crate.z };
  const again = save(w);
  const restored = again.byId(crate.id)!;
  assert.deepEqual({ x: restored.x, y: restored.y, z: restored.z }, left);
  tick(again, 5);
  assert.deepEqual({ x: restored.x, y: restored.y, z: restored.z }, left);
});

test('narrative: older saves gain new dungeon sites and family links without losing progress', () => {
  const w = new SandboxWorld(6);
  const old = w.snapshot();
  old.actors = structuredClone(w.actors).filter((a) => !a.spaceId && a.kind !== 'dungeon' && !(a.kind === 'item' && a.itemType === 'candle' && (a.owner === 'Tobin' || a.owner === 'Bran')));
  old.changeForms = undefined; old.spawned = undefined;
  old.visitedLocations = undefined; old.metNpcIds = undefined;
  old.flags.keepProgress = true;
  const restored = new SandboxWorld(w.seed, old);
  assert.equal(restored.flags.keepProgress, true);
  assert.equal(restored.actors.filter((a) => a.kind === 'dungeon').length, DUNGEON_SITES.length);
  assert.ok(restored.npc('Tobin')!.familyId && restored.npc('Bran')!.familyId);
  assert.ok(restored.actors.some((a) => a.itemType === 'candle' && a.owner === 'Tobin'));
  assert.ok(restored.actors.some((a) => a.kind === 'portal' && a.spaceId?.startsWith('interior:')), 'missing interiors were not migrated');
});

test('cell stream loads a centered 5x5 grid and keeps distant references indexed', () => {
  const w = new SandboxWorld(12);
  assert.equal(ENGINE_UNITS_PER_CELL, 4096);
  assert.equal(WORLD_UNITS_PER_CELL, 57.6);
  assert.deepEqual(exteriorCell({ x: -1, z: 58 }), { x: -1, z: 1 });
  assert.equal(w.streamer.loadedCells.size, 25);
  assert.equal(uExteriorCellBuffer, 36);
  assert.equal(w.streamer.bufferedCells.size, 36);
  assert.ok([...w.streamer.loadedCells].every((key) => w.streamer.bufferedCells.has(key)));
  const item = w.spawnItem('stoneChunk', -70, -70, 1);
  item.sleeping = false; item.vx = 3;
  w.uGridsToLoad = 1;
  w.player.x = 80; w.player.z = 80;
  w.update(0.05);
  assert.deepEqual([...w.streamer.loadedCells], ['exterior:1:1']);
  assert.equal(w.isActorLoaded(item), false);
  assert.equal(item.y, 1, 'unloaded physics changed the object');
  assert.ok(w.streamer.actorsInCell(cellKey(item)).includes(item), 'the reference was lost from its cell');
  w.player.x = -70; w.player.z = -70;
  w.update(0.05);
  assert.equal(w.isActorLoaded(item), true);
  assert.ok(item.y < 1, 'loaded physics did not resume');
  assert.equal(save(w).uGridsToLoad, 1);
});

test('the buffered window slides ahead of travel while retaining every active cell', () => {
  const w = new SandboxWorld(14);
  w.player.x = 2; w.player.z = 3; w.player.vz = -2;
  w.update(0.05);
  assert.ok(w.streamer.bufferedCells.has('exterior:0:-3'), 'northbound cells were not preselected');
  assert.ok(!w.streamer.bufferedCells.has('exterior:0:3'));
  w.player.z = 54; w.player.vz = 2;
  w.update(0.05);
  assert.ok(w.streamer.bufferedCells.has('exterior:0:3'), 'southbound cells were not preselected');
  assert.ok([...w.streamer.loadedCells].every((key) => w.streamer.bufferedCells.has(key)));
  assert.equal(w.streamer.bufferedCells.size, 36);
  assert.equal(save(w).uExteriorCellBuffer, 36);
});

test('collision heightfields and full-detail reference manifests are available for cells', () => {
  const w = new SandboxWorld(15);
  const refs = w.streamer.actorsInCell('exterior:0:0').map((a) => ({
    id: a.id, kind: a.kind, x: a.x, z: a.z, radius: a.radius, height: a.height, solid: a.solid, alive: a.alive,
  }));
  const collision = parseCollision(refs);
  assert.equal(collision.heights.length, 81);
  assert.ok([...collision.heights].every((h) => h === 0));
  assert.ok(collision.bodies.length >= 4 && collision.bodies.length % 4 === 0);
  const visuals = parseVisual(refs);
  assert.deepEqual(visuals.fullDetailIds, refs.filter((ref) => ref.alive || ref.kind === 'tree').map((ref) => ref.id));
  const tree = refs.find((ref) => ref.kind === 'tree')!;
  assert.deepEqual(parseVisual([{ ...tree, alive: false }]).fullDetailIds, [tree.id], 'a felled tree lost its stump reference');
});

test('static batches include stable stone but exclude movable items and persistent landmarks', () => {
  const w = new SandboxWorld(18);
  const house = w.actors.find((a) => a.kind === 'house')!;
  const ore = w.actors.find((a) => a.kind === 'ore')!;
  const item = w.actors.find((a) => a.kind === 'item')!;
  assert.equal(isPrecombinedStatic(house), true);
  assert.equal(isPrecombinedStatic(w.actors.find((a) => a.kind === 'ruin')!), true);
  assert.equal(isPrecombinedStatic(ore), true, 'immovable stone was not precombined with its cell');
  ore.alive = false;
  assert.equal(isPrecombinedStatic(ore), false, 'a depleted node remained in the next batch');
  assert.equal(isPrecombinedStatic(item), false, 'a movable object was baked into a cell');
  assert.equal(w.citadel.neverFade, true);
  assert.equal(isPrecombinedStatic(w.citadel), false);
  const restored = save(w);
  assert.equal(restored.citadel.neverFade, true);
});

test('terrain stays at full detail with continuous skirted boundaries across camera movement', () => {
  assert.deepEqual(TERRAIN_LOD_LEVELS, [4, 8, 16, 32]);
  const tiles = selectTerrainTiles({ x: 80, z: 80 });
  assert.equal(tiles.reduce((area, tile) => area + tile.size * tile.size, 0), 512 * 512);
  assert.equal(tiles.length, 64);
  assert.ok(tiles.every((tile) => tile.level === 32));
  assert.deepEqual(tiles, selectTerrainTiles({ x: -80, z: -80 }), 'moving the camera rebuilt or simplified the terrain');
  assert.equal(terrainHeight(0, 0), 0);
  const far = { x: 128, z: 128, size: 64, level: 8 as const };
  const geometry = terrainTileGeometry(far);
  assert.ok(geometry.attributes.position.count > (far.level + 1) ** 2, 'the terrain had no seam skirts');
  assert.ok([...geometry.attributes.position.array].every(Number.isFinite));
  assert.equal(terrainHeight(far.x + far.size, far.z), terrainHeight(192, 128));
  geometry.dispose();
  const flat = terrainTileGeometry({ x: 0, z: 0, size: 64, level: 32 });
  assert.equal(flat.getAttribute('position'), undefined, 'a second flat mesh overdraws the playable terrain');
  flat.dispose();
});

test('high and low water meshes share one shoreline height and a stable global level', () => {
  assert.equal(WATER_BODIES.length, 1);
  const high = waterGeometry(WATER_BODIES[0].radius, 96, 4);
  const low = waterGeometry(WATER_BODIES[0].radius, 24, 1);
  assert.ok(high.attributes.position.count > low.attributes.position.count);
  for (const geometry of [high, low]) {
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) assert.ok(Math.abs(position.getY(i) - GLOBAL_WATER_HEIGHT) < 1e-6);
  }
  assert.equal(high.attributes.position.getX(high.attributes.position.count - 96), low.attributes.position.getX(1));
  high.dispose(); low.dispose();
});

test('occlusion planes cull only fully hidden decor, not visible actors or landmarks', () => {
  const camera = { x: 0, y: 1.7, z: 0 };
  const planes = [{ id: 'house', x: 0, z: 7, radius: 3, height: 6 }];
  const stone = { id: 'stone', x: 0, z: 21, radius: 0.3, height: 1 };
  assert.equal(isOccluded(camera, stone, planes), true);
  assert.equal(isOccluded(camera, { ...stone, x: 8 }, planes), false);
  assert.equal(isOccluded(camera, { ...stone, z: 4 }, planes), false);
  assert.equal(isOccluded(camera, { ...stone, kind: 'villager' }, planes), false);
  assert.equal(isOccluded(camera, { ...stone, neverFade: true }, planes), false);
  assert.ok(occlusionPlanes(camera, new SandboxWorld(20).actors).some((plane) => plane.id === 'citadel'));
});

test('ordered screen-door fades use a stable Bayer pattern instead of temporal alpha noise', () => {
  const source = new THREE.MeshBasicMaterial();
  const material = screenDoorMaterial(source);
  const shader = { uniforms: {} as Record<string, { value: number }>, fragmentShader: 'void main() {\n#include <alphatest_fragment>\n}' };
  material.onBeforeCompile(shader as Parameters<typeof material.onBeforeCompile>[0], {} as THREE.WebGLRenderer);
  assert.match(shader.fragmentShader, /float bayer/);
  assert.equal(material.alphaHash, false);
  setScreenDoorFade(material, 0.375);
  assert.equal(shader.uniforms.uScreenDoorFade.value, 0.375);
  material.dispose(); source.dispose();
});

test('crossing into an uncached cell keeps terrain and solid collision authoritative', () => {
  const w = new SandboxWorld(16);
  const door = w.actors.find((a) => a.kind === 'dungeon')!;
  w.uGridsToLoad = 1;
  w.player.x = door.x;
  w.player.z = door.z + door.radius + w.player.radius + 0.25;
  w.player.y = 0;
  w.input = { x: 0, z: -1, sprint: false };
  tick(w, 1.5);
  assert.ok(w.player.z >= door.z + door.radius + w.player.radius - 0.12, 'the unloaded doorway lost collision');
  assert.equal(w.player.y, 0, 'the guardian fell through the pending terrain');
});

test('base objects, reference IDs and change forms reproduce moved, removed and spawned objects', () => {
  const w = new SandboxWorld(32);
  const apples = w.actors.filter((a) => a.itemType === 'apple').slice(0, 2);
  assert.equal(apples[0].baseId, apples[1].baseId);
  assert.equal(BASE_OBJECTS.get(apples[0].baseId!)?.value, 2);
  const original = w.baseReferences.get(apples[0].id)!;
  assert.equal(original.transform.x, apples[0].x);
  const untouched = w.snapshot();
  assert.equal(untouched.actors, undefined);
  assert.equal(Object.keys(untouched.changeForms ?? {}).length, 0);
  assert.equal(untouched.spawned?.length, 0);
  assert.ok(JSON.stringify(untouched).length < JSON.stringify(w.actors).length / 3);

  apples[0].x += 3; apples[0].y = 1.2; apples[0].facing += 0.4;
  w.actors = w.actors.filter((a) => a !== apples[1]);
  const newItem = w.spawnItem('apple', 28, -22);
  w.elapsed += 10 * 24 * 30;
  const delta = w.snapshot();
  assert.equal(delta.changeForms?.[apples[0].id]?.fields?.x, apples[0].x);
  assert.equal(delta.changeForms?.[apples[1].id]?.deleted, true);
  assert.ok(delta.spawned?.some((a) => a.id === newItem.id));
  assert.equal(w.reference(apples[0].id)?.transform.x, apples[0].x);
  assert.equal(w.baseReferences.get(apples[0].id)?.transform.x, original.transform.x);
  const restored = save(w);
  assert.equal(restored.byId(apples[0].id)?.x, apples[0].x);
  assert.equal(restored.byId(apples[0].id)?.y, 1.2);
  assert.equal(restored.byId(apples[1].id), undefined);
  assert.ok(restored.byId(newItem.id));
  const candle = restored.actors.find((a) => a.itemType === 'candle' && a.owner === 'Tobin')!;
  restored.actors = restored.actors.filter((a) => a !== candle);
  assert.equal(save(restored).actors.some((a) => a.itemType === 'candle' && a.owner === 'Tobin'), false,
    'migration recreated a stolen default object');
});

test('interior cells isolate physics and retain their object state through exits and saves', () => {
  const w = new SandboxWorld(46);
  const tavern = w.tavern!;
  const outside = { x: w.player.x, z: w.player.z };
  assert.equal(w.enterInterior(tavern), true);
  const room = interiorSpace(tavern.id);
  assert.equal(w.currentSpace, room);
  assert.deepEqual([...w.streamer.loadedCells], [room]);
  assert.ok(w.streamer.loadedActors().every((a) => a.spaceId === room));
  const jug = w.actors.find((a) => a.spaceId === room && a.itemType === 'jug')!;
  const exterior = w.spawnItem('apple', jug.x, jug.z);
  face(w, jug, 0.02);
  assert.equal(w.focus()?.id, jug.id, 'an exterior object occluded the interior item');
  w.interact();
  assert.equal(w.pack.jug, 1);
  assert.equal(w.actors.includes(jug), false);
  assert.equal(w.actors.includes(exterior), true);
  const foe = w.actors.find((a) => a.kind === 'foe')!;
  foe.x = w.player.x; foe.z = w.player.z + 2;
  w.player.spells!.push('bolt');
  assert.equal(w.castBolt(w.player, foe), false, 'a spell crossed worldspace boundaries');
  const restored = save(w);
  assert.equal(restored.currentSpace, room);
  assert.ok(!restored.byId(jug.id));
  assert.equal(restored.leaveInterior(), true);
  assert.equal(restored.currentSpace, 'exterior');
  assert.deepEqual({ x: restored.player.x, z: restored.player.z }, outside);
  assert.equal(restored.enterInterior(restored.tavern!), true);
  assert.ok(!restored.byId(jug.id), 'the taken jug reappeared when the room was revisited');
  assert.ok(restored.actors.some((a) => a.spaceId === room && a.kind === 'counter'));
});

test('exterior schedules and raids keep progressing while the guardian is in another worldspace', () => {
  const w = new SandboxWorld(48);
  const npc = w.npc('Bran')!;
  assert.equal(w.enterInterior(w.tavern!), true);
  const hunger = npc.needs!.hunger;
  w.startWave();
  const queue = w.spawnQueue;
  tick(w, 4);
  assert.ok(npc.needs!.hunger > hunger, 'the exterior NPC stopped living while unloaded');
  assert.ok(w.spawnQueue < queue, 'the raid stopped spawning outside');
  assert.equal(w.currentSpace.startsWith('interior:'), true);
});

test('a looted room keeps its scattered contents when you return', () => {
  const w = new SandboxWorld(5);
  w.flags.test = 1;
  const shelf = w.actors.find((a) => a.name === 'Storehouse shelf')!;
  w.player.x = shelf.x; w.player.z = shelf.z + 1.5;
  for (const v of w.actors.filter((a) => a.kind === 'villager')) { v.x = 40; v.z = -40; v.goal = undefined; }
  const onShelf = w.actors.filter((a) => a.kind === 'item' && Math.hypot(a.x - shelf.x, a.z - shelf.z) < 0.8 && a.y > 0.5);
  assert.ok(onShelf.length >= 4);
  for (const it of onShelf) { it.vx = (it.x - shelf.x) * 6; it.vz = 4; it.vy = 1; it.sleeping = false; }
  tick(w, 4);
  assert.ok(onShelf.every((it) => it.sleeping), 'objects settle');
  assert.ok(onShelf.some((it) => it.y === 0), 'some fell to the floor');
  const layout = onShelf.map((it) => [it.id, it.x, it.y, it.z]);
  w.player.x = 70; w.player.z = 70;
  tick(w, 30);
  const back = save(w);
  assert.deepEqual(onShelf.map((it) => { const r = back.byId(it.id)!; return [r.id, r.x, r.y, r.z]; }), layout);
  w.dropFromPack('apple');
  assert.ok(w.actors.some((a) => a.itemType === 'apple' && Math.hypot(a.x - 70, a.z - 70) < 2), 'dropped pack items become world objects');
});

test('thrown objects fly, strike foes and shove other objects', () => {
  const w = new SandboxWorld(5);
  const p = w.player;
  p.x = 30; p.z = 30; p.facing = 0;
  const stone = w.spawnItem('stoneChunk', 30, 30.8);
  w.secondary();
  tick(w, 0.4);
  assert.equal(stone.carriedBy, p.id);
  const foe = w.actors.find((a) => a.kind === 'foe')!;
  foe.x = 30; foe.z = 33; foe.intent = 'forage';
  const hp = foe.hp;
  w.throwHeld();
  tick(w, 0.6);
  assert.ok(foe.hp < hp, 'the stone hurt the foe');
  const barrel = w.spawnItem('barrel', 30, 25);
  p.x = 30; p.z = 26.5; p.facing = Math.PI;
  w.input = { x: 0, z: -1, sprint: false };
  tick(w, 1);
  assert.ok(barrel.z < 25, 'walking into a barrel pushes it');
});

test('theft is a crime only when someone sees it', () => {
  const w = new SandboxWorld(5);
  const stall = w.actors.find((a) => a.kind === 'stall')!;
  const apple = w.actors.find((a) => a.itemType === 'apple' && a.owner === 'Tobin')!;
  w.player.x = apple.x; w.player.z = stall.z + 1.3; w.player.facing = Math.PI;
  face(w, apple, 0.02);
  w.interact();
  assert.ok(w.bounty > 0, 'Tobin saw the theft');
  assert.ok(w.npc('Tobin')!.memory!.rumors.includes('crime'));
  const w2 = new SandboxWorld(5);
  const ledger = w2.actors.find((a) => a.itemType === 'ledger')!;
  face(w2, ledger, 0.02);
  w2.interact();
  assert.equal(w2.bounty, 0);
  assert.equal(w2.pack.ledger, 1);
});

test('narrative: a bonded, encountered villager can trigger a tailored rescue quest', () => {
  const w = new SandboxWorld(83);
  const mara = w.npc('Mara')!, bran = w.npc('Bran')!;
  w.metNpcIds.push(mara.id, bran.id);
  w.adjustOpinion(mara, 30); w.adjustOpinion(bran, 24);
  w.player.skills!.stealth = 40;
  assert.equal(w.canGenerateRescue(mara), false, 'an unexplored site should not be an alias');
  const explored = DUNGEON_SITES[0];
  w.player.x = explored.point.x; w.player.z = explored.point.z;
  tick(w, 0.6);
  assert.equal(w.locationStatus(explored.id), 'cleared');
  assert.equal(w.canGenerateRescue(mara), true);
  assert.equal(w.generateRescueQuest(mara), true);
  const quest = w.quests.rescue!, data = quest.data!;
  assert.equal(data.kind, 'rescue');
  if (data.kind !== 'rescue') throw new Error('expected a rescue');
  assert.equal(data.captiveId, bran.id, "the quest ignored the player's relationship");
  assert.equal(data.siteId, explored.id, 'the alias was not matched from explored sites');
  assert.ok(w.visitedLocations.includes(data.siteId), 'the quest chose an unexplored site');
  assert.equal(w.locationStatus(data.siteId), 'occupied');
  assert.equal(data.aliases.personId, bran.id);
  assert.match(data.approach, /stealth/i, 'the objective did not use the player skill profile');
  assert.equal(bran.capturedFor, 'rescue');
  assert.equal(w.questTitle('rescue').includes(data.dungeonName), true);
  const restored = save(w);
  assert.deepEqual(restored.quests.rescue!.data, data, 'generated objective did not survive a save');
  assert.ok(restored.metNpcIds.includes(bran.id));

  const door = w.byId(data.dungeonActorId)!;
  w.player.x = door.x - 7; w.player.z = door.z;
  tick(w, 0.6);
  assert.equal(w.questStage('rescue'), 'free', 'reaching the chosen dungeon did not advance the quest');
  assert.ok(w.visitedLocations.includes(data.dungeonId), 'exploration history did not record the dungeon');
  face(w, bran, 0.02);
  w.interact();
  assert.ok(w.dialogueView()!.options.some((option) => option.id === 'rescue-free'));
  w.choose('rescue-free');
  assert.equal(w.questStage('rescue'), 'report');
  assert.equal(bran.followingPlayer, true);
  face(w, mara);
  w.interact(); w.choose('rescue-report');
  assert.equal(w.quests.rescue!.status, 'done');
  assert.equal(w.pack.familyLocket, 1);
  assert.equal(w.locationStatus(data.siteId), 'recovering');
  for (const guard of w.actors.filter((a) => a.questFor === 'rescue')) guard.alive = false;
  w.elapsed += 46; w.update(0.05);
  assert.equal(w.locationStatus(data.siteId), 'reset');
  assert.equal(w.generateRescueQuest(mara), true, 'the same relationship should be able to make new quests');
  assert.notEqual(w.tracked, 'rescue', 'a repeat quest must keep the old journal entry');
  assert.equal(w.quests.rescue.status, 'done');
});

test('radiant aliases reserve only explored cleared or reset sites and persist across saves', () => {
  const w = new SandboxWorld(41);
  const tobin = w.npc('Tobin')!;
  w.metNpcIds.push(tobin.id);
  assert.equal(w.generateRadiantQuest(tobin, 'retrieve'), undefined);
  const site = RADIANT_SITES.find((p) => p.kind === 'cave')!;
  w.player.x = site.point.x; w.player.z = site.point.z;
  tick(w, 0.6);
  assert.equal(w.locationStatus(site.id), 'cleared');
  const id = w.generateRadiantQuest(tobin, 'retrieve')!;
  const data = w.quests[id].data!;
  assert.equal(data.kind, 'retrieve');
  if (data.kind !== 'retrieve') throw new Error('expected retrieval');
  assert.equal(data.aliases.locationId, site.id);
  assert.equal(data.aliases.itemType, data.itemType);
  assert.equal(w.locationStatus(site.id), 'occupied');
  assert.equal(w.canGenerateRadiant(w.npc('Mara')!), false, 'another quest reserved the only explored site');
  const restored = save(w);
  assert.deepEqual(restored.quests[id].data, data);
  assert.equal(restored.siteStates[site.id].questId, id);
  assert.equal(restored.nextRadiantQuest, w.nextRadiantQuest);
  restored.quests[id].status = 'done';
  assert.equal(restored.locationStatus(site.id), 'recovering', 'an orphaned reservation never released its site');
});

test('radiant retrieval can be dropped and recovered, then the site resets for a new hunt', () => {
  const w = new SandboxWorld(52);
  const patron = w.npc('Tobin')!, hunter = w.npc('Alden')!;
  w.metNpcIds.push(patron.id, hunter.id);
  const site = DUNGEON_SITES[0];
  w.player.x = site.point.x; w.player.z = site.point.z;
  tick(w, 0.6);
  const id = w.generateRadiantQuest(patron, 'retrieve')!;
  const data = w.quests[id].data!;
  if (data.kind !== 'retrieve') throw new Error('expected retrieval');
  const item = w.byId(data.itemActorId)!;
  face(w, item, 0.02);
  w.interact();
  tick(w, 0.6);
  assert.equal(w.questStage(id), 'report');
  assert.equal(data.recovered, true);
  w.dropFromPack(data.itemType);
  assert.equal(w.questStage(id), 'recover');
  assert.equal(data.recovered, false);
  face(w, w.byId(data.itemActorId)!, 0.02);
  tick(w, 0.4);
  w.interact();
  tick(w, 0.6);
  assert.equal(w.questStage(id), 'report');
  assert.equal(w.finishRetrieveQuest(id, patron), true);
  assert.equal(w.quests[id].status, 'done');
  assert.equal(w.generateRadiantQuest(hunter, 'hunt'), undefined, 'the site was reused before recovery');
  for (const guard of w.actors.filter((a) => a.questFor === id)) guard.alive = false;
  w.elapsed += 46; w.update(0.05);
  assert.equal(w.locationStatus(site.id), 'reset');
  const huntId = w.generateRadiantQuest(hunter, 'hunt')!;
  const hunt = w.quests[huntId].data!;
  if (hunt.kind !== 'hunt') throw new Error('expected a hunt');
  assert.equal(hunt.aliases.locationId, site.id);
  w.hurt(w.byId(hunt.enemyId)!, 999, PLAYER_ID);
  assert.equal(w.questStage(huntId), 'report');
  assert.equal(w.finishHuntQuest(huntId, hunter), true);
  assert.equal(w.quests[huntId].status, 'done');
});

test('a contested camp becomes a quest alias only after the living threats are cleared', () => {
  const w = new SandboxWorld(28);
  const camp = RADIANT_SITES.find((p) => p.kind === 'camp')!;
  w.player.x = camp.point.x; w.player.z = camp.point.z;
  tick(w, 0.6);
  assert.equal(w.locationStatus(camp.id), 'uncleared');
  for (const foe of w.actors.filter((a) => a.kind === 'foe')) foe.alive = false;
  tick(w, 0.6);
  assert.equal(w.locationStatus(camp.id), 'cleared');
  const tobin = w.npc('Tobin')!;
  face(w, tobin);
  w.interact();
  assert.ok(w.dialogueView()!.options.some((option) => option.id === 'radiant-accept'));
  w.choose('radiant-accept');
  assert.equal(w.quests[w.tracked].data?.aliases.locationId, camp.id);
});

test('an active rescue in an older save keeps its alias and upgrades its site reservation', () => {
  const w = new SandboxWorld(34);
  const site = DUNGEON_SITES[0];
  w.player.x = site.point.x; w.player.z = site.point.z;
  tick(w, 0.6);
  const mara = w.npc('Mara')!, bran = w.npc('Bran')!;
  w.metNpcIds.push(mara.id, bran.id);
  mara.memory!.opinion = 20; bran.memory!.opinion = 20;
  w.generateRescueQuest(mara);
  const old = w.snapshot();
  const data = old.quests.rescue.data!;
  if (data.kind !== 'rescue') throw new Error('expected rescue data');
  delete (data as Partial<typeof data>).siteId;
  delete (data as Partial<typeof data>).siteName;
  delete (data as Partial<typeof data>).siteActorId;
  delete (data as Partial<typeof data>).aliases;
  old.siteStates = undefined; old.nextRadiantQuest = undefined; old.threatSignals = undefined;
  old.visitedLocations = ['village'];
  const restored = new SandboxWorld(w.seed, old);
  assert.equal(restored.siteStates[site.id].questId, 'rescue');
  assert.equal(restored.quests.rescue.data?.aliases.locationId, site.id);
  assert.equal(restored.questStage('rescue'), 'travel');
});

test('relationships let a trusted guardian take low-value goods from a home', () => {
  const w = new SandboxWorld(89);
  const tobin = w.npc('Tobin')!;
  tobin.memory!.opinion = 45;
  const candle = w.spawnItem('candle', tobin.home!.x + 1, tobin.home!.z + 0.8, 0, tobin.name);
  assert.equal(w.isTrustedHouseholdItem(candle), true);
  face(w, candle, 0.02);
  assert.equal(w.hud().prompt?.crime, false);
  w.interact();
  assert.equal(w.bounty, 0);
  assert.equal(w.pack.candle, 1);

  tobin.memory!.opinion = 0;
  const apple = w.spawnItem('apple', tobin.home!.x + 0.8, tobin.home!.z + 0.5, 0, tobin.name);
  assert.equal(w.isTrustedHouseholdItem(apple), false, 'a stranger got the household privilege');
});

test('relationships: killing the shopkeeper sends a family vendetta after the guardian', () => {
  const w = new SandboxWorld(97);
  const tobin = w.npc('Tobin')!, bran = w.npc('Bran')!;
  tobin.crowns = 48; bran.crowns = 3;
  w.player.x = tobin.x; w.player.z = tobin.z + 2;
  w.hurt(tobin, 120, w.player.id);
  assert.equal(tobin.alive, false);
  assert.ok(bran.memory!.rumors.includes('murder:Tobin'));
  assert.ok(bran.memory!.opinion < 0);
  assert.equal(bran.crowns, 51, 'the estate did not pass to next of kin');
  const deed = w.deeds.find((d) => d.kind === 'murder' && d.victimId === tobin.id);
  assert.ok(deed, 'the murder was not recorded as a world deed');
  assert.equal(deed!.locationName, 'First Meadow');
  assert.equal(deed!.inheritedBy, bran.id);
  assert.equal(deed!.inheritedCrowns, 48);
  const vendetta = w.vendettas.find((v) => v.victimId === tobin.id);
  assert.ok(vendetta, 'no delayed family vendetta was scheduled');
  assert.equal(vendetta!.contractorId, bran.id);
  const hunters = w.actors.filter((a) => a.kind === 'foe' && a.vendettaFor === tobin.id);
  assert.equal(hunters.length, 2);
  assert.ok(hunters.every((hunter) => hunter.intent === 'chase' && hunter.targetId === w.player.id));
  w.hurt(hunters[0], 200, w.player.id);
  assert.ok(w.actors.some((a) => a.itemType === 'mercenaryWrit'), 'the hired company left no evidence');

  const ambushers = () => w.actors.filter((a) => a.kind === 'foe' && a.alive && a.vendettaFor === tobin.id).length;
  const before = ambushers();
  w.player.x = 60; w.player.z = 60;
  for (let i = 0; i < 600; i++) w.update(0.05);
  assert.equal(vendetta!.triggered, true, 'the wilderness ambush never triggered');
  assert.ok(ambushers() > before, 'no hired thugs appeared in the wilds');
  const restored = save(w);
  assert.ok(restored.deeds.some((d) => d.victimId === tobin.id));
  assert.ok(restored.vendettas.some((v) => v.victimId === tobin.id && v.triggered));
});

test('AI packages: the smith forges, takes a midday tavern meal and locks the house at night', () => {
  const w = new SandboxWorld(101);
  const sera = w.npc('Sera')!;
  assert.ok(sera.packages && sera.packages.length >= 4);
  assert.equal(activePackage(sera.packages, 8)?.kind, 'work');
  assert.equal(activePackage(sera.packages, 12)?.target, 'tavern');
  assert.equal(activePackage(sera.packages, 23)?.kind, 'home');
  assert.equal(w.activePackageFor(sera, 12)?.id, 'midday-meal');
  const house = w.houseFor(sera)!;
  assert.equal(house.kind, 'house');
  assert.ok(house.residents!.includes(sera.id));
  assert.equal(w.houseLocked(house), false);

  sera.needs = { energy: 0.9, hunger: 0.62, social: 0.2, fun: 0 };
  sera.crowns = 20; sera.items = {}; sera.homeFood = 0;
  sera.x = 0; sera.z = 4; sera.decideIn = 0; sera.utility = undefined;
  w.elapsed = (12 - 8) * 30;
  tick(w, 0.2);
  assert.equal(w.byId(sera.id)?.utility?.kind, 'tavern', 'the midday package did not pull the smith toward the tavern');
  tick(w, 30);
  assert.equal(sera.crowns, 17, 'the tavern meal was not paid for');
  assert.ok(sera.needs!.hunger < 0.45, 'the meal did not satisfy hunger');

  w.elapsed = (23 - 8) * 30;
  sera.x = sera.home!.x; sera.z = sera.home!.z; sera.utility = { kind: 'sleep', until: w.elapsed + 40 };
  tick(w, 1);
  assert.equal(w.houseLocked(house), true, 'the household did not lock up at night');
});

test('AI desires: responsibility decides between earning a meal, stealing, or enduring hunger', () => {
  const w = new SandboxWorld(103);
  const base = (name: string) => {
    const npc = w.npc(name)!;
    npc.needs = { energy: 0.9, hunger: 0.98, social: 0, fun: 0 };
    npc.items = {}; npc.homeFood = 0; npc.crowns = 0;
    npc.persona!.honesty = 0.22;
    npc.utility = undefined;
    w.elapsed = (10 - 8) * 30;
    return npc;
  };
  const iona = base('Iona');
  iona.desires = { responsibility: 0.92, aggression: 0.2, confidence: 0.8 };
  assert.equal(chooseGoal(w, iona).kind, 'earnFood', 'a responsible person did not seek honest work');
  iona.desires = { responsibility: 0.12, aggression: 0.35, confidence: 0.3 };
  assert.equal(chooseGoal(w, iona).kind, 'steal', 'a desperate, irresponsible person did not consider theft');
  iona.desires = { responsibility: 0.9, aggression: 0.05, confidence: 0.05 };
  iona.work = undefined;
  const endured = chooseGoal(w, iona);
  assert.ok(!['earnFood', 'eatFood', 'eatHome', 'buyFood', 'steal'].includes(endured.kind), 'food appeared from nowhere');
});

test('home invasion: a barred door wakes the owner and brings a shouted confrontation', () => {
  const w = new SandboxWorld(107);
  const sera = w.npc('Sera')!;
  const house = w.houseFor(sera)!;
  w.elapsed = (23 - 8) * 30;
  sera.x = sera.home!.x; sera.z = sera.home!.z;
  sera.utility = { kind: 'sleep', until: w.elapsed + 60 };
  sera.activity = 'Sleeping';
  sera.doorLocked = true;
  for (const v of w.actors.filter((a) => a.kind === 'villager' && a !== sera)) {
    v.x = 70; v.z = -70; v.utility = { kind: 'idle', until: 1e9 }; v.decideIn = 1e6;
  }
  w.player.x = house.x; w.player.z = house.z + house.radius + 2.3; w.player.facing = Math.PI;
  assert.equal(w.houseLocked(house), true);
  assert.equal(w.attemptHouseEntry(house), true);
  assert.equal(sera.activity, 'Confronting');
  assert.ok((sera.homeDefenseUntil ?? 0) > w.elapsed, 'the owner was not jolted awake');
  assert.ok((sera.memory?.alarmUntil ?? 0) > w.elapsed);
  assert.ok(w.deeds.some((d) => d.kind === 'trespass'));
  assert.ok(w.bounty > 0);
  const hp = w.player.hp;
  tick(w, 8);
  assert.equal(sera.activity, 'Confronting');
  assert.ok(sera.utility?.kind === 'confront');
  assert.ok(Math.hypot(sera.x - w.player.x, sera.z - w.player.z) < 8, 'the owner did not approach the intruder');
  assert.equal(w.player.hp, hp, 'the confrontation should be a warning, not an execution');
});


test("Tobin's ledger branches on what you do with it", () => {
  const start = () => {
    const w = new SandboxWorld(5);
    face(w, w.npc('Tobin')!);
    w.interact(); w.choose('ledger-start'); w.closeDialogue();
    w.addToPack('ledger');
    tick(w, 0.6);
    assert.equal(w.questStage('ledger'), 'decide');
    return w;
  };
  const exposed = start();
  face(exposed, exposed.npc('Vela')!);
  exposed.interact(); exposed.choose('ledger-expose');
  assert.equal(exposed.flags.ledger, 'exposed');
  assert.ok(exposed.npc('Tobin')!.memory!.opinion < 0);
  const secret = start();
  secret.usePack('ledger');
  assert.equal(secret.flags.ledgerRead, true);
  face(secret, secret.npc('Tobin')!);
  secret.interact();
  assert.ok(secret.dialogueView()!.options.some((o) => o.id === 'ledger-confront'));
  secret.choose('ledger-confront'); secret.choose('ledger-secret');
  assert.equal(secret.flags.discount, true);
  assert.equal(secret.quests.ledger.status, 'done');
});

test('bread can be delivered by physically carrying it to the watch post', () => {
  const w = new SandboxWorld(5);
  face(w, w.npc('Bran')!);
  w.interact(); w.choose('bread-start'); w.closeDialogue();
  const post = w.actors.find((a) => a.kind === 'post')!;
  const loaves = w.actors.filter((a) => a.itemType === 'bread' && !a.owner);
  assert.equal(loaves.length, 3);
  for (const [i, loaf] of loaves.entries()) {
    w.player.x = post.x + 2; w.player.z = post.z + 1 + i * 0.4; w.player.facing = -Math.PI / 2;
    loaf.carriedBy = w.player.id;
    w.update(0.05);
    w.secondary();
    tick(w, 1);
  }
  tick(w, 1);
  assert.equal(w.questStage('bread'), 'thanks');
});

test('villagers keep schedules: they go home and sleep at night', () => {
  const w = new SandboxWorld(5);
  w.elapsed = (22 - 8) * 30;
  tick(w, 40);
  const asleep = w.actors.filter((a) => a.kind === 'villager' && a.activity === 'Sleeping').length;
  assert.ok(asleep >= 10, `${asleep} asleep`);
});

test('word of a crime spreads through conversation', () => {
  const w = new SandboxWorld(5);
  w.elapsed = (18 - 8) * 30;
  const vs = w.actors.filter((a) => a.kind === 'villager' && a.profession !== 'Warden');
  vs[0].memory!.rumors.push('crime');
  for (const v of vs) { v.needs!.social = 0.9; v.x = 2 + (v.variant % 4); v.z = 2 + Math.floor(v.variant / 4); }
  tick(w, 60);
  const told = vs.filter((v) => v.memory!.rumors.includes('crime')).length;
  assert.ok(told > 1, `rumour reached ${told} villagers`);
});

test('foes call allies when they spot the guardian', () => {
  const w = new SandboxWorld(5);
  const foes = w.actors.filter((a) => a.kind === 'foe');
  foes[1].x = foes[0].x + 3; foes[1].z = foes[0].z;
  w.player.x = foes[0].x - 4; w.player.z = foes[0].z;
  w.update(0.05);
  assert.equal(foes[0].intent, 'chase');
  assert.ok(foes[1].intent === 'search' || foes[1].intent === 'chase');
});

test('tactical operators choose a flank, withdrawal or healer support from world conditions', () => {
  const w = new SandboxWorld(13);
  const stalker = w.actors.find((a) => a.foeKind === 'stalker')!;
  const brute = w.actors.find((a) => a.foeKind === 'brute')!;
  const wisp = w.actors.find((a) => a.foeKind === 'wisp')!;
  const player = w.player;
  player.x = 30; player.z = 30;
  stalker.x = 30; stalker.z = 36;
  brute.x = 31; brute.z = 36;
  assert.equal(planTactic(stalker, player, [brute], undefined, w.elapsed).action, 'flank');
  stalker.hp = stalker.maxHp * 0.2;
  assert.equal(planTactic(stalker, player, [brute], undefined, w.elapsed).action, 'withdraw');
  wisp.x = 32; wisp.z = 36;
  brute.hp = brute.maxHp * 0.25;
  const support = planTactic(wisp, player, [stalker], brute, w.elapsed);
  assert.equal(support.action, 'support');
  assert.equal(support.allyId, brute.id);
});

test('squad sightings spread to allies and wisps heal using the shared spell rules', () => {
  const w = new SandboxWorld(17);
  const mara = w.npc('Mara')!, bran = w.npc('Bran')!;
  const foe = w.actors.find((a) => a.foeKind === 'brute')!;
  foe.x = mara.x + 2; foe.z = mara.z + 1;
  bran.x = mara.x + 3; bran.z = mara.z + 2;
  w.hurt(mara, 10, foe.id);
  tick(w, 0.5);
  assert.ok(w.threatSignals.some((s) => s.targetId === foe.id));
  assert.equal(bran.memory!.threatId, foe.id, 'the nearby villager did not hear the warning');
  assert.ok(save(w).threatSignals.some((s) => s.targetId === foe.id), 'the warning was lost on save');

  const healer = w.actors.find((a) => a.foeKind === 'wisp')!;
  const injured = w.actors.find((a) => a.foeKind === 'stalker')!;
  w.player.x = -70; w.player.z = -70;
  healer.x = 50; healer.z = 50; healer.focus = healer.maxFocus = 60;
  injured.x = 52; injured.z = 50; injured.hp = injured.maxHp * 0.3;
  const hp = injured.hp, focus = healer.focus;
  tick(w, 0.6);
  assert.ok(injured.hp > hp, 'the wisp did not mend its ally');
  assert.ok(healer.focus! < focus, 'healing did not spend focus');
});

test('witnesses report an assault; civilians and support roles do not all attack the player', () => {
  const w = new SandboxWorld(55), p = w.player;
  p.x = 0; p.z = 0;
  const victim = w.npc('Iona')!;
  for (const n of w.actors.filter((a) => a.kind === 'villager')) {
    n.x = ((n.variant ?? 0) % 4 - 1.5) * 1.8;
    n.z = 3 + Math.floor((n.variant ?? 0) / 4) * 1.6;
    n.facing = Math.atan2(p.x - n.x, p.z - n.z);
    n.persona!.courage = 1; n.persona!.loyalty = 1;
    n.decideIn = 0; n.utility = undefined;
  }
  w.hurt(victim, 5, p.id);
  assert.equal(canRetaliate(victim, p, w.elapsed), true);
  for (const name of ['Mara', 'Tobin', 'Bran', 'Lark', 'Rhea', 'Oren', 'Ellis', 'Tamsin']) {
    const witness = w.npc(name)!;
    assert.equal(canRetaliate(witness, p, w.elapsed), false, `${name} attacked without being hit`);
    assert.ok(!['fight', 'castBolt'].includes(roleResponse(w, witness, p).kind), `${name} treated witnessing as permission to attack`);
  }
  tick(w, 1.2);
  assert.ok(['fight', 'windup', 'strike', 'Fighting'].includes(victim.utility?.kind ?? victim.action ?? victim.activity ?? ''), 'the assaulted mason did not defend herself');
  for (const name of ['Mara', 'Tobin', 'Bran', 'Lark', 'Rhea', 'Oren', 'Ellis', 'Tamsin']) {
    const witness = w.npc(name)!;
    assert.notEqual(witness.utility?.kind, 'fight', `${name} joined an assault on the player`);
  }
});

test('each profession runs a separate threat, routine and work controller', () => {
  const w = new SandboxWorld(68);
  const villagers = w.actors.filter((a) => a.kind === 'villager');
  const professions = new Set(villagers.map((n) => n.profession));
  const brains = [...professions].map((profession) => PROFESSION_BRAINS[profession!]!);
  assert.equal(brains.length, 13);
  assert.ok(villagers.every((n) => !!brainFor(n)));
  assert.equal(new Set(brains.map((brain) => brain.onThreat)).size, brains.length);
  assert.equal(new Set(brains.map((brain) => brain.onRoutine)).size, brains.length);
  assert.equal(new Set(brains.map((brain) => brain.onWork)).size, brains.length);
  assert.equal(brainFor(w.npc('Tobin')!)?.attack, undefined, 'a merchant inherited a fighter attack pattern');
  const fighters = ['Alden', 'Vela', 'Sera', 'Perrin', 'Iona', 'Mara'].map((name) => brainFor(w.npc(name)!)!.attack!);
  assert.equal(new Set(fighters.map((style) => `${style.speed}:${style.windup}:${style.cooldown}`)).size, fighters.length);
});

test('save repair strips monster and tower behavior from villagers, and NPC logic from structures', () => {
  const w = new SandboxWorld(70);
  const merchant = w.npc('Tobin')!;
  merchant.foeKind = 'brute'; merchant.intent = 'raid'; merchant.structure = 'archer';
  w.stock.wood = 10; w.stock.stone = 10; w.stock.gold = 100;
  assert.equal(w.build('archer', { x: 6, z: -16 }), true);
  const tower = w.actors.find((a) => a.kind === 'tower')!;
  tower.profession = 'Warden'; tower.foeKind = 'stalker'; tower.intent = 'chase';
  tower.utility = { kind: 'fight', targetId: w.player.id, until: 999 };
  const foe = w.actors.find((a) => a.kind === 'foe')!;
  foe.profession = 'Merchant'; foe.structure = 'archer';
  const restored = save(w);
  assert.equal(restored.npc('Tobin')!.foeKind, undefined);
  assert.equal(restored.npc('Tobin')!.intent, undefined);
  assert.equal(restored.npc('Tobin')!.structure, undefined);
  assert.equal(restored.byId(tower.id)!.profession, undefined);
  assert.equal(restored.byId(tower.id)!.utility, undefined);
  assert.equal(restored.byId(foe.id)!.profession, undefined);
  assert.equal(planTactic(restored.byId(tower.id)!, restored.player, [], undefined, restored.elapsed).action, 'hold');
});

test('combat refuses unauthorized NPC damage even if a stale goal points at the guardian', () => {
  const w = new SandboxWorld(69), p = w.player;
  const merchant = w.npc('Tobin')!, smith = w.npc('Sera')!, warden = w.npc('Alden')!;
  merchant.memory!.alarmUntil = w.elapsed + 20; merchant.memory!.threatId = p.id;
  merchant.utility = { kind: 'fight', targetId: p.id, until: w.elapsed + 20 };
  const hp = p.hp;
  w.hurt(p, 15, merchant.id);
  assert.equal(p.hp, hp, 'an untrained witness hurt the player');
  w.hurt(merchant, 5, p.id);
  w.hurt(p, 15, merchant.id);
  assert.equal(p.hp, hp, 'a directly hurt merchant became an attacker');
  warden.activity = 'Fighting'; warden.memory!.threatId = p.id;
  w.hurt(p, 15, warden.id);
  assert.equal(p.hp, hp, 'an unauthorized guard struck the player');
  w.hurt(smith, 5, p.id);
  assert.equal(w.canNpcDamagePlayer(smith), true);
  w.hurt(p, 15, smith.id);
  assert.ok(p.hp < hp, 'a directly attacked defender could not protect herself');
});

test('a saved guard fighting state does not become an unearned attack after loading', () => {
  const w = new SandboxWorld(71), p = w.player, guard = w.npc('Alden')!;
  guard.x = p.x; guard.z = p.z + 1.4;
  guard.activity = 'Fighting'; guard.targetId = p.id; guard.decideIn = 100;
  const restored = save(w), before = restored.player.hp;
  restored.update(0.05);
  assert.notEqual(restored.npc('Alden')!.activity, 'Fighting');
  assert.equal(restored.player.hp, before);
});

test('an attack on the guardian brings guards forward while civilians seek safety', () => {
  const w = new SandboxWorld(56), p = w.player;
  p.x = 0; p.z = 0;
  const foe = w.actors.find((a) => a.foeKind === 'brute')!;
  foe.x = 1; foe.z = 5; foe.facing = Math.PI;
  const positions: [string, number, number][] = [
    ['Alden', -1, 3], ['Vela', 3, 3], ['Tobin', -2, 4], ['Ellis', 2, 4], ['Lark', 4, 5],
  ];
  for (const [name, x, z] of positions) {
    const n = w.npc(name)!;
    n.x = x; n.z = z; n.decideIn = 0; n.utility = undefined;
    n.needs = { energy: 0.9, hunger: 0, social: 0, fun: 0 };
  }
  w.hurt(p, 5, foe.id);
  tick(w, 1.3);
  assert.equal(w.npc('Tobin')!.memory!.threatId, foe.id);
  assert.ok(['warn', 'shelter'].includes(w.npc('Tobin')!.utility?.kind ?? ''));
  assert.equal(w.npc('Ellis')!.utility?.kind, 'hide');
  assert.ok(['fight', 'castBolt'].includes(w.npc('Alden')!.utility?.kind ?? ''), 'the warden did not defend the village');
  for (const name of ['Tobin', 'Ellis', 'Lark']) assert.notEqual(w.npc(name)!.targetId, p.id, `${name} attacked the guardian instead of the foe`);
});

test('each profession and foe type has an explicit job and a different response to danger', () => {
  const w = new SandboxWorld(57);
  const foe = w.actors.find((a) => a.foeKind === 'brute')!;
  foe.x = 5; foe.z = 5;
  const roles = new Set(w.actors.filter((a) => a.kind === 'villager').map((n) => PROFESSION_DUTIES[n.profession!]));
  assert.ok(roles.size >= 8, `only ${roles.size} occupation behaviors`);
  const response = ['Alden', 'Vela', 'Sera', 'Iona', 'Rhea', 'Lark', 'Tobin', 'Ellis', 'Oren'].map((name) => {
    const n = w.npc(name)!; n.x = 5; n.z = 7;
    return roleResponse(w, n, foe).kind;
  });
  assert.ok(new Set(response).size >= 5, `roles chose only ${new Set(response).size} reactions`);
  assert.deepEqual(Object.values(FOE_BEHAVIORS).map((b) => b.duty).sort(), ['ambush', 'siege', 'support', 'swarm']);
  const camp = w.camp;
  const stalker = w.actors.find((a) => a.foeKind === 'stalker')!;
  const slime = w.actors.find((a) => a.foeKind === 'slime')!;
  assert.ok(Math.hypot(foePatrolPoint(stalker, camp, 0).x - camp.x, foePatrolPoint(stalker, camp, 0).z - camp.z)
    > Math.hypot(foePatrolPoint(slime, camp, 0).x - camp.x, foePatrolPoint(slime, camp, 0).z - camp.z));
});

test('wild species prowl, screen, lurk or gather rather than sharing one idle routine', () => {
  const w = new SandboxWorld(63);
  w.player.x = -75; w.player.z = -75;
  tick(w, 1.5);
  const active = (kind: string) => w.actors.find((a) => a.foeKind === kind && a.alive)!;
  assert.equal(active('slime').activity, 'Prowling');
  assert.equal(active('wisp').activity, 'Screening');
  assert.equal(active('stalker').activity, 'Lurking');
  assert.ok(active('brute').targetId, 'the brute never sought materials for its siege');
});

test('bakers, farmers, smiths and apprentices produce different persistent work outcomes', () => {
  const w = new SandboxWorld(65);
  w.elapsed = (10 - 8) * 30;
  const workers: [string, number][] = [['Bran', 23], ['Oren', 23], ['Sera', 18], ['Rhea', 12]];
  for (const [name, interval] of workers) {
    const n = w.npc(name)!;
    n.x = n.work!.x; n.z = n.work!.z; n.vx = n.vz = 0;
    n.needs = { energy: 0.9, hunger: 0, social: 0, fun: 0 };
    n.utility = { kind: 'work', until: w.elapsed + 40, score: 1 };
    n.decideIn = 100;
    n.workProgress = interval - 0.04;
  }
  const bread = w.actors.filter((a) => a.itemType === 'bread' && a.owner === 'Bran').length;
  const food = w.npc('Oren')!.homeFood!;
  const stone = w.citadel.stockStone!;
  const magic = w.npc('Rhea')!.skills!.magic;
  tick(w, 0.2);
  assert.ok(w.actors.filter((a) => a.itemType === 'bread' && a.owner === 'Bran').length > bread, 'baker made no real bread');
  assert.ok(w.npc('Oren')!.homeFood! > food, 'farmer grew no food');
  assert.ok(w.citadel.stockStone! < stone, 'smith consumed no materials for forging');
  assert.ok(w.npc('Rhea')!.skills!.magic > magic, 'apprentice learned nothing while studying');
});

test('a squad flanker takes a lateral route instead of piling onto its target', () => {
  const w = new SandboxWorld(19);
  const stalker = w.actors.find((a) => a.foeKind === 'stalker')!;
  const brute = w.actors.find((a) => a.foeKind === 'brute')!;
  w.player.x = 25; w.player.z = 25;
  stalker.x = 25; stalker.z = 32; stalker.intent = 'chase'; stalker.targetId = PLAYER_ID;
  brute.x = 26; brute.z = 32; brute.intent = 'chase'; brute.targetId = PLAYER_ID;
  w.update(0.05);
  assert.equal(stalker.tactic?.action, 'flank');
  assert.ok(stalker.tactic?.point && Math.abs(stalker.tactic.point.x - w.player.x) > 1, 'the route has no lateral offset');
});

test('attacks chain into combos and rolling avoids a strike', () => {
  const w = new SandboxWorld(5);
  const p = w.player;
  p.x = 30; p.z = -30;
  w.attack();
  tick(w, 0.1);
  w.attack();
  tick(w, 0.5);
  assert.equal(p.action, 'attack2');
  tick(w, 1);
  const foe = w.actors.find((a) => a.kind === 'foe')!;
  foe.x = 30; foe.z = -31.2; foe.facing = 0; foe.targetId = p.id; foe.intent = 'chase';
  foe.action = 'windup'; foe.actionT = 0.95; foe.actionDur = 1;
  p.facing = Math.PI;
  const hp = p.hp;
  w.dodge();
  tick(w, 0.15);
  assert.equal(p.hp, hp, 'no damage while rolling');
});

test('verification finds and auto-repair fixes corrupted state', () => {
  const w = new SandboxWorld(5);
  w.player.x = Number.NaN;
  w.stock.gold = -3;
  const it = w.actors.find((a) => a.kind === 'item')!;
  it.carriedBy = 'nobody';
  it.y = Number.NaN;
  assert.ok(w.verify().length >= 3);
  const report = w.autoRepair();
  assert.ok(report.fixes.length >= 3);
  assert.deepEqual(report.remaining, []);
});

test('simulation stays fast: a minute of world time with everyone active', () => {
  const w = new SandboxWorld(5);
  for (const it of w.actors.filter((a) => a.kind === 'item')) { it.sleeping = false; it.vy = 2; it.y = 0.5; }
  const start = performance.now();
  tick(w, 60);
  const ms = (performance.now() - start) / 1200;
  console.log(`  ${ms.toFixed(3)} ms per simulation step`);
  assert.ok(ms < 4, `${ms.toFixed(2)} ms per step`);
});

test('simultaneous radiant quests, a raid, items and distant minds stay inside the simulation budget', () => {
  const w = new SandboxWorld(61);
  for (const site of DUNGEON_SITES) w.visitedLocations.push(site.id);
  const tobin = w.npc('Tobin')!, alden = w.npc('Alden')!, mara = w.npc('Mara')!, bran = w.npc('Bran')!;
  w.metNpcIds.push(tobin.id, alden.id, mara.id, bran.id);
  mara.memory!.opinion = 25; bran.memory!.opinion = 25;
  assert.ok(w.generateRadiantQuest(tobin, 'retrieve'));
  assert.ok(w.generateRadiantQuest(alden, 'hunt'));
  assert.equal(w.generateRescueQuest(mara), true);
  w.startWave();
  const start = performance.now();
  tick(w, 10);
  const ms = (performance.now() - start) / 200;
  assert.ok(ms < 4, `${ms.toFixed(2)} ms per busy simulation step`);
  assert.equal(w.radiantQuests().filter(([, q]) => q.status === 'active').length, 3);
  assert.ok(w.actors.some((a) => a.questFor && a.alive));
  assert.ok(w.actors.some((a) => a.kind === 'villager' && a.activity), 'distant schedules stopped');
  assert.ok(w.waveActive || w.waveCleared > 0, 'the raid stopped updating');
});

// ---------------------------------------------------------------- Vivid AI
test('vivid: villagers are generated with unique temperaments, routines and capabilities', () => {
  const a = new SandboxWorld(31), b = new SandboxWorld(31);
  const villagers = a.actors.filter((x) => x.kind === 'villager');
  assert.deepEqual(villagers.map((v) => v.persona), b.actors.filter((x) => x.kind === 'villager').map((v) => v.persona));
  assert.ok(new Set(villagers.map((v) => JSON.stringify(v.persona))).size > 8, 'temperaments repeat');
  assert.ok(new Set(villagers.map((v) => v.routine!.bedtime.toFixed(2))).size > 5, 'routines repeat');
  assert.ok(villagers.every((v) => v.attrs && v.skills && v.routine));
  assert.ok((a.npc('Alden')!.skills!.blade) > (a.npc('Lark')!.skills!.blade), 'the warden should out-fight the herbalist');
  assert.ok(villagers.every((v) => typeof v.persona!.curiosity === 'number' && typeof v.persona!.patience === 'number' && typeof v.persona!.loyalty === 'number'));
});

test('vivid: perception changes with facing, stealth and darkness', () => {
  const w = new SandboxWorld(23);
  const watcher = w.npc('Tobin')!;
  watcher.x = 0; watcher.z = 0; watcher.facing = 0;
  assert.equal(canSee(watcher, { x: 0, z: 8 }, 13, 12), true, 'the watcher missed someone ahead');
  assert.equal(canSee(watcher, { x: 0, z: -6 }, 13, 12), false, 'the watcher saw through the back of their head');
  assert.equal(canSee(watcher, { x: 0, z: 8 }, 13, 12, 100, true), false, 'a skilled crouching target was detected too easily');
  assert.equal(canSee(watcher, { x: 0, z: 11 }, 13, 23), false, 'night did not reduce sight range');
});

test('vivid: urgent hunger can replace a valid work goal without inventing food', () => {
  const w = new SandboxWorld(17);
  w.elapsed = (10 - 8) * 30;
  const iona = w.npc('Iona')!;
  iona.needs = { energy: 0.9, hunger: 0.99, social: 0, fun: 0 };
  iona.items = { bread: 1 };
  iona.utility = { kind: 'work', until: w.elapsed + 60, score: 0.5 };
  iona.decideIn = 0;
  w.update(0.05);
  assert.equal(iona.utility?.kind, 'eatFood', 'the work goal was not interrupted by hunger');

  const ellis = w.npc('Ellis')!;
  ellis.needs = { energy: 0.9, hunger: 0.99, social: 0, fun: 0 };
  ellis.items = {}; ellis.homeFood = 0; ellis.crowns = 0; ellis.persona!.honesty = 1; ellis.persona!.greed = 0;
  const goal = chooseGoal(w, ellis);
  assert.ok(!['eatFood', 'eatHome', 'buyFood', 'steal'].includes(goal.kind), `chose an unavailable meal: ${goal.kind}`);
});

test('vivid: a hungry, penniless, dishonest villager steals when nobody is watching', () => {
  const w = new SandboxWorld(5);
  const ellis = w.npc('Ellis')!;
  ellis.persona!.honesty = 0.05; ellis.crowns = 0; ellis.items = {}; ellis.homeFood = 0;
  ellis.needs!.hunger = 0.95; ellis.needs!.energy = 0.9; ellis.needs!.social = 0; ellis.needs!.fun = 0;
  for (const v of w.actors.filter((a) => a.kind === 'villager' && a !== ellis)) { v.x = 70; v.z = -70; v.utility = { kind: 'idle', until: 1e9 }; v.decideIn = 1e6; }
  const stall = w.actors.find((a) => a.kind === 'stall')!;
  ellis.x = stall.x - 3; ellis.z = stall.z + 3;
  const breads = () => w.actors.filter((a) => a.itemType === 'bread' && a.owner === 'Bran').length
    + w.actors.filter((a) => a.itemType === 'bread' && Math.hypot(a.x - stall.x, a.z - stall.z) < 1.5).length;
  const before = breads();
  tick(w, 30);
  assert.ok(breads() < before || (ellis.items.bread ?? 0) > 0 || ellis.needs!.hunger < 0.5, 'Ellis never stole');
  assert.equal(ellis.wanted ?? 0, 0, 'nobody saw, so no fine');
});

test('vivid: a witnessed theft brings a fine from the wardens', () => {
  const w = new SandboxWorld(5);
  const ellis = w.npc('Ellis')!;
  ellis.persona!.honesty = 0.05; ellis.crowns = 30; ellis.items = {}; ellis.homeFood = 0;
  ellis.needs!.hunger = 0.95; ellis.needs!.energy = 0.9; ellis.needs!.social = 0; ellis.needs!.fun = 0;
  const stall = w.actors.find((a) => a.kind === 'stall')!;
  const tobin = w.npc('Tobin')!;
  tobin.x = stall.x; tobin.z = stall.z + 2.5; tobin.facing = Math.PI; tobin.utility = { kind: 'idle', until: 1e9 }; tobin.decideIn = 1e6;
  tobin.social = { x: tobin.x, z: tobin.z };
  for (const v of w.actors.filter((a) => a.kind === 'villager' && a !== ellis && a !== tobin)) { v.x = 70; v.z = -70; v.utility = { kind: 'idle', until: 1e9 }; v.decideIn = 1e6; }
  ellis.x = stall.x - 1; ellis.z = stall.z + 2;
  tick(w, 12);
  assert.ok((ellis.wantedUntil ?? 0) > w.elapsed || (ellis.wanted ?? 0) > 0, 'the theft was not witnessed');
  const alden = w.npc('Alden')!;
  alden.x = ellis.x + 3; alden.z = ellis.z; alden.utility = undefined; alden.decideIn = 0;
  let fined = false;
  for (let i = 0; i < 1800 && !fined; i++) { w.update(0.05); fined = (ellis.wanted ?? 0) === 0; }
  assert.ok(fined, 'the fine was never collected');
  assert.ok((ellis.crowns ?? 0) < 30, 'Ellis kept the money');
});

test('vivid: two villagers, one stool — one sits, the other finds something else to do', () => {
  const w = new SandboxWorld(5);
  w.elapsed = (19.8 - 8) * 30;
  const stools = w.actors.filter((a) => a.itemType === 'stool');
  for (const extra of stools.slice(1)) { extra.alive = false; }
  const stool = stools[0];
  const pair = w.actors.filter((a) => a.kind === 'villager').slice(0, 2);
  for (const v of w.actors.filter((a) => a.kind === 'villager')) {
    v.needs!.energy = 0.9; v.needs!.hunger = 0; v.needs!.social = 0; v.needs!.fun = 0; v.decideIn = 1e6;
    v.utility = { kind: 'idle', until: 1e9 }; v.x = 60; v.z = 60;
  }
  for (const [i, v] of pair.entries()) {
    v.needs!.energy = 0.45; v.needs!.social = 0.05; v.decideIn = 0;
    v.x = stool.x + (i === 0 ? -2 : 2); v.z = stool.z + 1;
    v.utility = undefined;
  }
  tick(w, 30);
  const sitting = pair.filter((v) => v.sittingOn === stool.id);
  assert.equal(sitting.length, 1, `expected one seated villager, got ${sitting.length}`);
  assert.ok(pair.filter((v) => v.utility?.kind === 'sit' && v.utility.targetId === stool.id).length <= 1, 'two villagers reserved the same stool');
  const other = pair.find((v) => v !== sitting[0])!;
  assert.notEqual(other.activity, 'Sitting');
  assert.notEqual(other.sittingOn, stool.id);
});

test('vivid: the apprentice heals the wounded with the same spell system the guardian uses', () => {
  const w = new SandboxWorld(5);
  const rhea = w.npc('Rhea')!;
  const mara = w.npc('Mara')!;
  mara.hp = mara.maxHp * 0.3;
  rhea.x = mara.x + 4; rhea.z = mara.z; rhea.decideIn = 0; rhea.utility = undefined;
  rhea.needs!.hunger = 0; rhea.needs!.social = 0; rhea.needs!.fun = 0; rhea.needs!.energy = 0.9;
  tick(w, 12);
  assert.ok(mara.hp > mara.maxHp * 0.3, `Mara was not healed (${mara.hp})`);
});

test('vivid: a mage chooses the shared bolt spell when a foe is in range', () => {
  const w = new SandboxWorld(29);
  const rhea = w.npc('Rhea')!;
  const foe = w.actors.find((a) => a.kind === 'foe')!;
  w.player.x = -70; w.player.z = -70;
  for (const v of w.actors.filter((a) => a.kind === 'villager' && a !== rhea)) {
    v.x = 70; v.z = -70; v.utility = { kind: 'idle', until: 1e9 }; v.decideIn = 1e6;
  }
  rhea.x = 40; rhea.z = 40; rhea.facing = 0; rhea.vx = rhea.vz = 0;
  rhea.needs = { energy: 0.9, hunger: 0, social: 0, fun: 0 };
  rhea.utility = undefined; rhea.decideIn = 0;
  foe.x = 40; foe.z = 46; foe.facing = Math.PI; foe.intent = 'forage'; foe.targetId = undefined;
  const hp = foe.hp, focus = rhea.focus!, magic = rhea.skills!.magic;
  tick(w, 1.2);
  assert.ok(foe.hp < hp, 'the mage did not attack with a spell');
  assert.ok(rhea.focus! < focus, 'the NPC spent no shared focus');
  assert.ok(rhea.skills!.magic > magic, 'the NPC learned no magic from casting');
});

test('vivid: the guardian learns spells from books and casts them with shared rules', () => {
  const w = new SandboxWorld(5);
  w.addToPack('tomeBolt');
  w.usePack('tomeBolt');
  assert.ok(w.player.spells!.includes('bolt'));
  w.addToPack('tomeMend');
  w.usePack('tomeMend');
  const foe = w.actors.find((a) => a.kind === 'foe')!;
  foe.x = w.player.x + 3; foe.z = w.player.z; foe.intent = 'forage';
  const hp = foe.hp, focus = w.player.focus!;
  w.castSpell('bolt');
  assert.ok(foe.hp < hp, 'the bolt did nothing');
  assert.ok(w.player.focus! < focus, 'casting cost no focus');
  w.player.hp = 40;
  w.castSpell('mending');
  assert.ok(w.player.hp > 40, 'mending did nothing');
  assert.ok((w.player.skills!.magic) > 0, 'casting taught nothing');
});

test('vivid: lockpicks, patience and skill open a strongbox', () => {
  const w = new SandboxWorld(5);
  const box = w.actors.find((a) => a.itemType === 'strongbox')!;
  w.addToPack('lockpicks', 30);
  w.player.skills!.lockpick = 100;
  face(w, box, 0.05);
  for (let i = 0; i < 6 && box.locked; i++) { w.interact(); tick(w, 0.8); face(w, box, 0.05); }
  assert.equal(box.locked, 0, 'the lock never gave');
  w.interact();
  assert.equal(box.loot!.length, 0);
  assert.ok(w.actors.some((a) => a.itemType === 'pouch'), 'nothing came out of the box');
});

test('vivid: crouching changes whether a theft is seen', () => {
  const setup = (sneak: boolean) => {
    const w = new SandboxWorld(5);
    const tobin = w.npc('Tobin')!;
    tobin.x = 20; tobin.z = 20; tobin.facing = Math.PI; tobin.utility = { kind: 'idle', until: 1e9 }; tobin.decideIn = 1e6;
    tobin.social = { x: 20, z: 20 };
    for (const v of w.actors.filter((a) => a.kind === 'villager' && a !== tobin)) { v.x = 70; v.z = -70; v.utility = { kind: 'idle', until: 1e9 }; v.decideIn = 1e6; }
    const bread = w.spawnItem('bread', 20, 23.2, 0, 'Tobin');
    const p = w.player;
    p.x = 20; p.z = 16.5; p.facing = 0; p.sneaking = sneak;
    face(w, bread, 0.02);
    w.player.sneaking = sneak;
    w.interact();
    return w.bounty;
  };
  assert.ok(setup(false) > 0, 'standing in plain sight should be seen');
  assert.equal(setup(true), 0, 'crouching behind him should not');
});

test('vivid: skills grow with use', () => {
  const w = new SandboxWorld(5);
  const foe = w.actors.find((a) => a.kind === 'foe')!;
  foe.x = w.player.x; foe.z = w.player.z + 1.5;
  w.player.facing = 0;
  w.attack();
  tick(w, 0.6);
  assert.ok((w.player.skills!.blade) > 0, 'swinging taught nothing');
  const before = w.player.skills!.speech;
  w.buy('bread');
  assert.ok(w.player.skills!.speech > before, 'trading taught nothing');
});

test('vivid: distant villagers still live their lives (tiered simulation)', () => {
  const w = new SandboxWorld(5);
  w.player.x = -80; w.player.z = -80;
  w.elapsed = (23 - 8) * 30;
  tick(w, 90);
  const asleep = w.actors.filter((a) => a.kind === 'villager' && a.activity === 'Sleeping').length;
  assert.ok(asleep >= 8, `only ${asleep} distant villagers slept`);
});

test('vivid: a thief carries the loaf in a real inventory, and wardens confiscate it', () => {
  const w = new SandboxWorld(5);
  const ellis = w.npc('Ellis')!;
  ellis.persona!.honesty = 0.05; ellis.crowns = 30; ellis.items = {}; ellis.homeFood = 0;
  ellis.needs!.hunger = 0.95; ellis.needs!.energy = 0.9; ellis.needs!.social = 0; ellis.needs!.fun = 0;
  const stall = w.actors.find((a) => a.kind === 'stall')!;
  const tobin = w.npc('Tobin')!;
  for (const v of w.actors.filter((a) => a.kind === 'villager' && a !== ellis)) { v.x = 70; v.z = -70; v.utility = { kind: 'idle', until: 1e9 }; v.decideIn = 1e6; }
  ellis.x = stall.x - 1; ellis.z = stall.z + 2;
  const stock = () => w.actors.filter((a) => a.owner === 'Tobin' && a.kind === 'item').length;
  const before = stock();
  tick(w, 6);
  assert.ok(Object.values(ellis.stolen ?? {}).some((n) => n > 0), 'nothing marked stolen in his bag');
  assert.ok(stock() < before, 'the stall lost nothing');
  // Word gets out anyway: a witness reports him and the warden collects.
  ellis.wanted = 12; ellis.wantedUntil = w.elapsed + 150;
  const alden = w.npc('Alden')!;
  alden.x = ellis.x + 3; alden.z = ellis.z; alden.utility = undefined; alden.decideIn = 0;
  for (let i = 0; i < 1800 && (ellis.wanted ?? 0) > 0; i++) w.update(0.05);
  assert.deepEqual(ellis.stolen, {}, 'stolen goods were not confiscated');
  assert.equal(stock(), before, 'the goods did not return to the stall');
});

test('vivid: dropped food is scavenged by whoever is inclined to pick it up', () => {
  const w = new SandboxWorld(5);
  const bran = w.npc('Bran')!;
  bran.persona!.greed = 0.95; bran.needs!.hunger = 0.1; bran.needs!.energy = 0.9; bran.needs!.social = 0; bran.needs!.fun = 0;
  bran.utility = undefined; bran.decideIn = 0;
  for (const v of w.actors.filter((a) => a.kind === 'villager' && a !== bran)) { v.x = 70; v.z = -70; v.utility = { kind: 'idle', until: 1e9 }; v.decideIn = 1e6; }
  w.elapsed = (18.5 - 8) * 30;
  const cheese = w.spawnItem('cheese', bran.x + 3, bran.z, 0);
  tick(w, 15);
  assert.ok(!w.actors.includes(cheese), 'the cheese is still on the ground');
  assert.equal(w.bag(bran).cheese, 1);
});

test('vivid: everyone hits with the same formula, and the weapon in hand matters', () => {
  const w = new SandboxWorld(5);
  const alden = w.npc('Alden')!, lark = w.npc('Lark')!;
  assert.equal(alden.weapon, 'staff');
  assert.ok(w.meleeDamage(alden) > w.meleeDamage(lark), 'an armed warden should out-hit an unarmed herbalist');
  const p = w.player;
  const bare = w.meleeDamage(p);
  w.stock.gold = 500; w.buy('blade');
  assert.equal(p.weapon, 'blade');
  assert.ok(w.meleeDamage(p) > bare, 'the iron blade changed nothing');
});

test('vivid: shared skill training caps player and NPC values identically', () => {
  const w = new SandboxWorld(41);
  const p = w.player, lark = w.npc('Lark')!;
  p.skills!.guard = 98; lark.skills!.guard = 98;
  w.trainSkill(p, 'guard', 5); w.trainSkill(lark, 'guard', 5);
  assert.equal(p.skills!.guard, 100);
  assert.equal(lark.skills!.guard, 100);
});

test('vivid: the guardian agility attribute changes movement speed', () => {
  const travel = (agility: number) => {
    const w = new SandboxWorld(59);
    const p = w.player;
    p.x = 70; p.z = -70; p.attrs!.agility = agility;
    w.input = { x: 1, z: 0, sprint: false };
    tick(w, 1);
    return p.x - 70;
  };
  assert.ok(travel(10) > travel(2) + 0.1, 'agility did not affect player movement');
});

test('vivid: a brave, loyal villager can retaliate with the shared melee system', () => {
  const w = new SandboxWorld(53);
  const mara = w.npc('Mara')!, p = w.player;
  p.x = 40; p.z = 40; p.hp = p.maxHp;
  mara.x = 40; mara.z = 42; mara.vx = mara.vz = 0;
  mara.persona!.courage = 1; mara.persona!.loyalty = 1;
  mara.needs = { energy: 0.9, hunger: 0, social: 0, fun: 0 };
  mara.utility = undefined; mara.decideIn = 0;
  for (const v of w.actors.filter((a) => a.kind === 'villager' && a !== mara)) {
    v.x = 70; v.z = -70; v.utility = { kind: 'idle', until: 1e9 }; v.decideIn = 1e6;
  }
  const hp = p.hp;
  w.hurt(mara, 5, p.id);
  tick(w, 4);
  assert.equal(mara.memory!.threatId, p.id, 'the attack was not remembered');
  assert.ok(p.hp < hp, 'the brave villager never struck back');
  assert.ok((mara.skills!.blade ?? 0) > 0, 'the villager did not improve the shared blade skill');
});

test('engine: locomotion blends with speed and captured NPCs have a stable pose', () => {
  const rig = buildRig({ coat: '#52604a', trim: '#b8a171', skin: '#c99470', pants: '#38342f', hair: '#30251f' });
  animateRig(rig, 'walk', 0.8, 0.05, { phase: 1.4, actionT: 0, speed: 0.45 });
  const shortStride = rig.bones.lThigh.rotation.x;
  animateRig(rig, 'walk', 0.8, 0.05, { phase: 1.4, actionT: 0, speed: 2.5 });
  const fullStride = rig.bones.lThigh.rotation.x;
  assert.ok(Math.abs(fullStride) > Math.abs(shortStride), 'walking stride did not respond to speed');
  animateRig(rig, 'captured', 1.1, 0.05, { phase: 0, actionT: 0, speed: 0 });
  assert.ok(rig.bones.lUpperArm.rotation.x < 0, 'captured pose did not bind the arms forward');
  assert.ok(Object.values(rig.bones).every((bone) => Number.isFinite(bone.rotation.x + bone.rotation.y + bone.rotation.z)));
});

test('full character geometry is batched without losing bone or cape animation', () => {
  const rig = buildRig({ coat: '#52604a', trim: '#b8a171', skin: '#c99470', pants: '#38342f', hair: '#30251f', cape: true, weapon: 'sword' });
  let meshes = 0;
  rig.root.traverse((node) => { if (node instanceof THREE.Mesh) meshes++; });
  assert.equal(meshes, 1, 'the character was not merged into a single skinned draw');
  assert.ok(rig.mesh.geometry.attributes.position.count > 500, 'detailed body parts were lost');
  assert.ok(rig.cape && rig.skeleton.bones.includes(rig.cape), 'cape was not bound to the skeleton');
  const boneIndex = rig.skeleton.bones.indexOf(rig.bones.lUpperArm);
  const skinIndices = rig.mesh.geometry.getAttribute('skinIndex');
  let vertex = 0;
  while (vertex < skinIndices.count && skinIndices.getX(vertex) !== boneIndex) vertex++;
  assert.ok(vertex < skinIndices.count, 'arm geometry was not bound to the arm bone');
  const before = rig.mesh.getVertexPosition(vertex, new THREE.Vector3()).clone();
  animateRig(rig, 'captured', 1.1, 0.2, { phase: 0, actionT: 0, speed: 0 });
  rig.root.updateMatrixWorld(true);
  const after = rig.mesh.getVertexPosition(vertex, new THREE.Vector3());
  assert.ok(before.distanceTo(after) > 0.05, 'the merged arm did not follow the animated bone');
  rig.mesh.geometry.dispose(); rig.skeleton.dispose();
});

test('vivid: a worker whose spot is occupied works beside it instead of freezing', () => {
  const w = new SandboxWorld(5);
  const iona = w.npc('Iona')!;
  w.player.x = iona.work!.x; w.player.z = iona.work!.z;
  iona.x = iona.work!.x - 6; iona.z = iona.work!.z; iona.utility = undefined; iona.decideIn = 0;
  iona.needs!.hunger = 0; iona.needs!.social = 0; iona.needs!.fun = 0; iona.needs!.energy = 0.9;
  w.elapsed = (10 - 8) * 30;
  tick(w, 20);
  const d = Math.hypot(iona.x - iona.work!.x, iona.z - iona.work!.z);
  assert.ok(d > 0.9 && d < 3, `Iona ended ${d.toFixed(2)} from her spot`);
  assert.equal(iona.activity, 'Masonry');
  assert.ok((iona.stuck ?? 0) < 0.4, 'she is still shoving');
});

let failures = 0;
for (const [name, run] of tests) {
  try { run(); console.log(`PASS ${name}`); } catch (error) { failures++; console.error(`FAIL ${name}\n  ${(error as Error).message}`); }
}
if (failures) process.exitCode = 1; else console.log(`${tests.length} world tests passed.`);
