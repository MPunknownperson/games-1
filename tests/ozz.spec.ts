import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { createOzzPose, initializeOzz } from '../src/world/ozz/runtime';
import { animateRig, buildRig, disposeRig } from '../src/world/rig';
import { SandboxWorld } from '../src/world/simulation';
import { initializeChoreography } from '../src/world/choreography';

function identities(count: number) {
  const values = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) values[i * 4 + 3] = 1;
  return values;
}

test('ozz WASM blends masked and additive rotations and produces model matrices', async () => {
  assert.equal(await initializeOzz(), true);
  const pose = createOzzPose(new Int32Array([-1, 0, 1]), new Float32Array([0, 2, 0, 0, -1, 0, 0, -1, 0]));
  assert.ok(pose);
  try {
    const base = identities(3), upper = identities(3), additive = identities(3), mask = new Float32Array([1, 0, 0]);
    const swing = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    upper.set(swing.toArray(), 0);
    const recoil = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.2);
    additive.set(recoil.toArray(), 4);
    assert.equal(pose.blend(base, upper, additive, mask, 1, 1, 0), true);
    assert.ok(Math.abs(pose.quaternions[2] - swing.z) < 0.001, 'upper-body mask did not apply');
    assert.ok(Math.abs(pose.quaternions[4] - recoil.x) < 0.001, 'additive recoil did not apply');
    assert.ok([...pose.matrices].every(Number.isFinite));
    assert.ok(Math.abs(pose.matrices[12 + 16] - 1) < 0.01, 'model matrices did not follow the blended parent');
  } finally { pose.dispose(); }
});

test('ozz two-bone IK reaches a ground target without invalid matrices', async () => {
  await initializeOzz();
  const pose = createOzzPose(new Int32Array([-1, 0, 1]), new Float32Array([0, 2, 0, 0, -1, 0, 0, -1, 0]));
  assert.ok(pose);
  try {
    const base = identities(3);
    assert.ok(pose.blend(base, base, base, new Float32Array(3), 0, 0, 0));
    const target = { x: 0.2, y: 0.35, z: 0.3 };
    assert.ok(pose.solveLeg(0, 1, 2, target, 1));
    const end = new THREE.Vector3().fromArray(pose.matrices, 2 * 16 + 12);
    assert.ok(end.distanceTo(new THREE.Vector3(target.x, target.y, target.z)) < 0.12, `ankle missed target: ${end.toArray()}`);
    assert.ok([...pose.quaternions, ...pose.matrices].every(Number.isFinite));
  } finally { pose.dispose(); }
});

test('the skinned rig layers a weapon swing over running and uses ozz matrices', async () => {
  await initializeOzz();
  const style = { coat: '#52604a', trim: '#b8a171', skin: '#c99470', pants: '#38342f', hair: '#30251f', height: 0.92, build: 1.2, cape: true };
  const running = buildRig(style), attacking = buildRig(style), blocking = buildRig(style);
  try {
    const context = { phase: 1.1, actionT: 0.24, speed: 4.3 };
    for (let i = 0; i < 20; i++) {
      animateRig(running, 'run', 1, 0.05, context);
      animateRig(attacking, 'attack1', 1, 0.05, context);
      animateRig(blocking, 'block', 1, 0.05, context);
    }
    assert.ok(attacking.ozz && attacking.ozzMatricesActive, 'the live rig did not use ozz');
    assert.ok(running.bones.lThigh.quaternion.angleTo(attacking.bones.lThigh.quaternion) < 0.02, 'swing replaced the running legs');
    assert.ok(running.bones.rUpperArm.quaternion.angleTo(attacking.bones.rUpperArm.quaternion) > 0.2, 'upper-body swing was not layered');
    assert.ok(running.bones.lThigh.quaternion.angleTo(blocking.bones.lThigh.quaternion) < 0.02, 'block replaced the running legs');
    assert.ok(running.bones.lUpperArm.quaternion.angleTo(blocking.bones.lUpperArm.quaternion) > 0.2, 'upper-body block was not layered');
    attacking.root.position.set(3, 0, 4); attacking.root.rotation.y = 0.5;
    attacking.root.updateMatrixWorld(true);
    attacking.skeleton.update();
    const expected = new THREE.Matrix4(), actual = new THREE.Matrix4();
    for (let i = 0; i < attacking.skeleton.bones.length; i++) {
      expected.multiplyMatrices(attacking.skeleton.bones[i].matrixWorld, attacking.skeleton.boneInverses[i]);
      actual.fromArray(attacking.skeleton.boneMatrices!, i * 16);
      assert.ok(expected.elements.every((value, j) => Math.abs(value - actual.elements[j]) < 0.0001), `GPU matrix mismatch at bone ${i}`);
    }
  } finally { for (const rig of [running, attacking, blocking]) { disposeRig(rig); rig.mesh.geometry.dispose(); } }
});

test('additive recoil preserves locomotion and two-bone IK follows stepped ground', async () => {
  await initializeOzz();
  await initializeChoreography();
  const style = { coat: '#52604a', trim: '#b8a171', skin: '#c99470', pants: '#38342f', hair: '#30251f' };
  const running = buildRig(style), flinching = buildRig(style), grounded = buildRig(style);
  try {
    const motion = { phase: 0.8, actionT: 0.15, speed: 4 };
    for (let i = 0; i < 20; i++) {
      animateRig(running, 'run', 1, 0.05, motion);
      animateRig(flinching, 'hurt', 1, 0.05, motion);
      animateRig(grounded, 'idle', 1, 0.05, { phase: 0, actionT: 0, speed: 0, grounded: true, groundHeight: (x) => x > 0 ? 0.12 : 0 });
    }
    assert.ok(running.bones.lThigh.quaternion.angleTo(flinching.bones.lThigh.quaternion) < 0.02, 'recoil removed the running gait');
    assert.ok(running.bones.chest.quaternion.angleTo(flinching.bones.chest.quaternion) > 0.1, 'recoil was not added to the torso');
    assert.ok(grounded.ozz);
    const left = new THREE.Vector3().fromArray(grounded.ozz.matrices, 13 * 16 + 12);
    const right = new THREE.Vector3().fromArray(grounded.ozz.matrices, 16 * 16 + 12);
    assert.ok(Math.abs(left.y - 0.19) < 0.09, `raised foot missed the step: ${left.y}`);
    assert.ok(Math.abs(right.y - 0.07) < 0.09, `grounded foot missed the floor: ${right.y}`);
    const stepUp = new THREE.Vector3().setFromMatrixColumn(new THREE.Matrix4().fromArray(grounded.ozz.matrices, 13 * 16), 1).normalize();
    assert.ok(stepUp.y > 0.98, `foot tilted across a stair edge: ${stepUp.toArray()}`);
    grounded.root.position.set(2, 0, -3); grounded.root.updateMatrixWorld(true); grounded.skeleton.update();
    const expected = new THREE.Matrix4(), actual = new THREE.Matrix4();
    for (let i = 0; i < grounded.skeleton.bones.length; i++) {
      expected.multiplyMatrices(grounded.skeleton.bones[i].matrixWorld, grounded.skeleton.boneInverses[i]);
      actual.fromArray(grounded.skeleton.boneMatrices!, i * 16);
      assert.ok(expected.elements.every((value, j) => Math.abs(value - actual.elements[j]) < 0.0001), `IK GPU matrix mismatch at bone ${i}`);
    }
  } finally {
    for (const rig of [running, flinching, grounded]) { disposeRig(rig); rig.mesh.geometry.dispose(); }
  }
});

test('a planted foot stays near its world-space contact while the body moves', async () => {
  await initializeOzz();
  const rig = buildRig({ coat: '#52604a', trim: '#b8a171', skin: '#c99470', pants: '#38342f', hair: '#30251f' });
  try {
    const context = { phase: 0.8, actionT: 0, speed: 2, grounded: true, groundHeight: () => 0 };
    for (let i = 0; i < 25; i++) animateRig(rig, 'walk', 1, 0.05, context);
    rig.root.updateWorldMatrix(true, false);
    const before = new THREE.Vector3().fromArray(rig.ozz!.matrices, 13 * 16 + 12).applyMatrix4(rig.root.matrixWorld);
    for (let i = 0; i < 10; i++) { rig.root.position.z += 0.015; animateRig(rig, 'walk', 1, 0.05, context); }
    rig.root.updateWorldMatrix(true, false);
    const after = new THREE.Vector3().fromArray(rig.ozz!.matrices, 13 * 16 + 12).applyMatrix4(rig.root.matrixWorld);
    assert.ok(Math.hypot(after.x - before.x, after.z - before.z) < 0.09, `planted foot slid: ${before.distanceTo(after)}`);
  } finally { disposeRig(rig); rig.mesh.geometry.dispose(); }
});

test('ankles align with a sloped support surface', async () => {
  await initializeOzz();
  const rig = buildRig({ coat: '#52604a', trim: '#b8a171', skin: '#c99470', pants: '#38342f', hair: '#30251f' });
  try {
    for (let i = 0; i < 30; i++) animateRig(rig, 'idle', 1, 0.05, {
      phase: 0, actionT: 0, speed: 0, grounded: true, groundHeight: (x) => x * 0.25,
    });
    const matrix = new THREE.Matrix4().fromArray(rig.ozz!.matrices, 13 * 16);
    const up = new THREE.Vector3().setFromMatrixColumn(matrix, 1).normalize();
    const normal = new THREE.Vector3(-0.25, 1, 0).normalize();
    assert.ok(up.dot(normal) > 0.98, `ankle did not align with the slope: ${up.toArray()}`);
  } finally { disposeRig(rig); rig.mesh.geometry.dispose(); }
});

test('guarding reduces frontal damage and sprint attacks retain locomotion', () => {
  const guarded = new SandboxWorld(44), exposed = new SandboxWorld(44);
  for (const world of [guarded, exposed]) {
    const player = world.player, foe = world.actors.find((a) => a.kind === 'foe')!;
    player.x = 40; player.z = 40; player.facing = 0;
    foe.x = 40; foe.z = 42; foe.action = 'windup'; foe.actionT = 0; foe.actionDur = 10;
    world.input = { x: 0, z: 0, sprint: false, block: world === guarded };
    world.update(0.05);
    world.hurt(player, 20, foe.id);
  }
  assert.ok(guarded.player.blocking && guarded.player.hp > exposed.player.hp, 'guard did not reduce a frontal strike');
  assert.ok(guarded.stamina < guarded.maxStamina, 'guard did not consume stamina');
  const runner = new SandboxWorld(45);
  runner.input = { x: 0, z: 1, sprint: true };
  runner.attack();
  for (let i = 0; i < 5; i++) runner.update(0.05);
  assert.ok(Math.hypot(runner.player.vx, runner.player.vz) > 3, 'sprint attack did not retain running movement');
});

test('ozz updates a crowd of layered rigs without invalid matrices', async () => {
  await initializeOzz();
  const style = { coat: '#52604a', trim: '#b8a171', skin: '#c99470', pants: '#38342f', hair: '#30251f' };
  const rigs = Array.from({ length: 40 }, () => buildRig(style));
  const started = performance.now();
  try {
    for (let frame = 0; frame < 30; frame++) for (const rig of rigs) animateRig(rig, 'attack1', frame / 30, 1 / 30, {
      phase: frame * 0.2, actionT: 0.2, speed: 4, grounded: true, groundHeight: () => 0,
    });
    assert.ok(rigs.every((rig) => rig.ozzMatricesActive && [...rig.ozz!.matrices].every(Number.isFinite)));
    console.log(`  40 layered rigs: ${((performance.now() - started) / 30).toFixed(3)} ms per update`);
  } finally { for (const rig of rigs) { disposeRig(rig); rig.mesh.geometry.dispose(); } }
});