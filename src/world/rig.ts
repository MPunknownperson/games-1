// Skeletal humanoid rig: a THREE.Bone hierarchy with rigid segments bound to each bone, driven by a
// procedural, blended behaviour state machine (locomotion, combat, work, rest and social poses).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sampleAttack, sampleRecoil } from './choreography';
import { createOzzPose, ozzStatus, type OzzPose } from './ozz/runtime';

export type BoneName =
  | 'hips' | 'spine' | 'chest' | 'neck' | 'head'
  | 'lUpperArm' | 'lForearm' | 'lHand' | 'rUpperArm' | 'rForearm' | 'rHand'
  | 'lThigh' | 'lShin' | 'lFoot' | 'rThigh' | 'rShin' | 'rFoot';
export const BONES: BoneName[] = ['hips', 'spine', 'chest', 'neck', 'head', 'lUpperArm', 'lForearm', 'lHand', 'rUpperArm', 'rForearm', 'rHand', 'lThigh', 'lShin', 'lFoot', 'rThigh', 'rShin', 'rFoot'];

export type AnimState =
  | 'idle' | 'walk' | 'run' | 'jump' | 'fall' | 'land' | 'attack1' | 'attack2' | 'attack3' | 'roll' | 'hurt' | 'dead'
  | 'gather' | 'carry' | 'carryWalk' | 'throw' | 'talk' | 'sit' | 'sleep' | 'work' | 'tend' | 'cheer' | 'pickup' | 'windup' | 'strike' | 'sneak' | 'captured' | 'block';

export interface RigStyle {
  coat: string; trim: string; skin: string; pants: string; hair: string; boots?: string;
  hood?: boolean; cape?: boolean; skirt?: boolean; helm?: boolean;
  build?: number; height?: number; weapon?: 'sword' | 'staff' | 'club' | 'blade' | 'none'; eyes?: string;
}

export interface Rig {
  root: THREE.Group;
  bones: Record<BoneName, THREE.Bone>;
  skeleton: THREE.Skeleton;
  mesh: THREE.SkinnedMesh;
  cape?: THREE.Bone;
  current: Float32Array;
  upperCurrent: Float32Array;
  upperWeight: number;
  ozz?: OzzPose;
  ozzFailed: boolean;
  ozzMatricesActive: boolean;
  parents: Int32Array;
  restPositions: Float32Array;
  baseQuaternions: Float32Array;
  upperQuaternions: Float32Array;
  additiveQuaternions: Float32Array;
  upperMask: Float32Array;
  feet: { anchor?: THREE.Vector3; weight: number; planted: boolean }[];
  hipsBase: number;
  hipsY: number;
}

const materials = new Map<string, THREE.MeshLambertMaterial>();
export function lambert(color: string) {
  let m = materials.get(color);
  if (!m) { m = new THREE.MeshLambertMaterial({ color, flatShading: true }); materials.set(color, m); }
  return m;
}
const BOX = new THREE.BoxGeometry(1, 1, 1);
const RIG_MATERIAL = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

function seg(bone: THREE.Object3D, color: string, w: number, h: number, d: number, x = 0, y = 0, z = 0, shadow = false) {
  const m = new THREE.Mesh(BOX, lambert(color));
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  bone.add(m);
  return m;
}

export function buildRig(s: RigStyle): Rig {
  const b = s.build ?? 1;
  const root = new THREE.Group();
  const scale = s.height ?? 1;
  root.scale.setScalar(scale);
  const bone = (name: BoneName | 'cape', parent: THREE.Object3D, x: number, y: number, z: number) => {
    const node = new THREE.Bone();
    node.name = name;
    node.position.set(x, y, z);
    parent.add(node);
    return node;
  };
  const hips = bone('hips', root, 0, 0.95, 0);
  const spine = bone('spine', hips, 0, 0.1, 0);
  const chest = bone('chest', spine, 0, 0.22, 0);
  const neck = bone('neck', chest, 0, 0.3, 0);
  const head = bone('head', neck, 0, 0.07, 0);
  const lUpperArm = bone('lUpperArm', chest, 0.25 * b, 0.24, 0);
  const lForearm = bone('lForearm', lUpperArm, 0, -0.3, 0);
  const lHand = bone('lHand', lForearm, 0, -0.27, 0);
  const rUpperArm = bone('rUpperArm', chest, -0.25 * b, 0.24, 0);
  const rForearm = bone('rForearm', rUpperArm, 0, -0.3, 0);
  const rHand = bone('rHand', rForearm, 0, -0.27, 0);
  const lThigh = bone('lThigh', hips, 0.11 * b, -0.04, 0);
  const lShin = bone('lShin', lThigh, 0, -0.42, 0);
  const lFoot = bone('lFoot', lShin, 0, -0.43, 0);
  const rThigh = bone('rThigh', hips, -0.11 * b, -0.04, 0);
  const rShin = bone('rShin', rThigh, 0, -0.42, 0);
  const rFoot = bone('rFoot', rShin, 0, -0.43, 0);

  const boots = s.boots ?? '#2e2620';
  seg(hips, s.pants, 0.34 * b, 0.2, 0.22, 0, 0, 0);
  seg(spine, s.coat, 0.33 * b, 0.26, 0.21, 0, 0.11, 0, true);
  seg(spine, s.trim, 0.35 * b, 0.05, 0.23, 0, 0.01, 0);
  seg(chest, s.coat, 0.44 * b, 0.32, 0.25, 0, 0.14, 0, true);
  seg(chest, s.trim, 0.12, 0.3, 0.02, 0, 0.14, 0.13);
  seg(neck, s.skin, 0.1, 0.1, 0.1, 0, 0.03, 0);
  seg(head, s.skin, 0.22, 0.25, 0.23, 0, 0.13, 0, true);
  seg(head, s.eyes ?? '#1d1916', 0.035, 0.035, 0.01, 0.05, 0.15, 0.117);
  seg(head, s.eyes ?? '#1d1916', 0.035, 0.035, 0.01, -0.05, 0.15, 0.117);
  seg(head, s.skin, 0.04, 0.05, 0.04, 0, 0.11, 0.125);
  if (s.hood) {
    seg(head, s.coat, 0.28, 0.29, 0.25, 0, 0.15, -0.035);
    seg(head, s.coat, 0.16, 0.08, 0.16, 0, 0.32, -0.07);
  } else if (s.helm) {
    seg(head, '#7a7d7c', 0.26, 0.12, 0.26, 0, 0.27, 0);
    seg(head, '#7a7d7c', 0.27, 0.03, 0.27, 0, 0.21, 0);
  } else {
    seg(head, s.hair, 0.24, 0.08, 0.25, 0, 0.27, -0.01);
    seg(head, s.hair, 0.24, 0.17, 0.06, 0, 0.17, -0.105);
  }
  for (const [upper, fore, hand] of [[lUpperArm, lForearm, lHand], [rUpperArm, rForearm, rHand]]) {
    seg(upper, s.coat, 0.11 * b, 0.32, 0.12, 0, -0.15, 0);
    seg(fore, s.coat, 0.1 * b, 0.27, 0.11, 0, -0.13, 0);
    seg(fore, s.trim, 0.11 * b, 0.05, 0.12, 0, -0.24, 0);
    seg(hand, s.skin, 0.085, 0.1, 0.09, 0, -0.05, 0);
  }
  for (const [thigh, shin, foot] of [[lThigh, lShin, lFoot], [rThigh, rShin, rFoot]]) {
    seg(thigh, s.pants, 0.14 * b, 0.44, 0.16, 0, -0.21, 0, true);
    seg(shin, s.pants, 0.12 * b, 0.43, 0.13, 0, -0.21, 0);
    seg(shin, boots, 0.135 * b, 0.18, 0.145, 0, -0.34, 0);
    seg(foot, boots, 0.13 * b, 0.08, 0.25, 0, -0.03, 0.05);
  }
  if (s.skirt) seg(hips, s.coat, 0.4 * b, 0.36, 0.28, 0, -0.17, 0);

  let cape: THREE.Bone | undefined;
  if (s.cape) {
    cape = new THREE.Bone();
    cape.name = 'cape';
    cape.position.set(0, 0.28, -0.13);
    chest.add(cape);
    seg(cape, s.trim, 0.42, 0.06, 0.04, 0, 0, 0);
    seg(cape, s.coat, 0.4, 0.74, 0.025, 0, -0.38, -0.01);
  }

  if (s.weapon && s.weapon !== 'none') {
    const w = new THREE.Group();
    w.rotation.x = Math.PI / 2 + 0.25;
    w.position.set(0, -0.08, 0.02);
    rHand.add(w);
    if (s.weapon === 'sword' || s.weapon === 'blade') {
      seg(w, '#5a4030', 0.04, 0.16, 0.04, 0, 0, 0);
      seg(w, '#8f8a7e', 0.2, 0.035, 0.05, 0, 0.09, 0);
      seg(w, s.weapon === 'blade' ? '#b9bec2' : '#a6a9a6', 0.06, 0.72, 0.018, 0, 0.47, 0);
    } else if (s.weapon === 'staff') {
      seg(w, '#6b4f36', 0.05, 1.6, 0.05, 0, 0.3, 0);
      seg(w, '#8d8f8a', 0.08, 0.2, 0.08, 0, 1.1, 0);
    } else {
      seg(w, '#5c4632', 0.07, 0.5, 0.07, 0, 0.2, 0);
      seg(w, '#4a3a2a', 0.14, 0.24, 0.14, 0, 0.5, 0);
    }
  }

  const bones = { hips, spine, chest, neck, head, lUpperArm, lForearm, lHand, rUpperArm, rForearm, rHand, lThigh, lShin, lFoot, rThigh, rShin, rFoot };
  const skinBones = BONES.map((name) => bones[name]);
  if (cape) skinBones.push(cape);
  root.updateMatrixWorld(true);
  const inverseRoot = root.matrixWorld.clone().invert();
  const parts: THREE.BufferGeometry[] = [];
  for (const [index, skinBone] of skinBones.entries()) {
    const collect = (node: THREE.Object3D) => {
      for (const child of [...node.children]) {
        if (child instanceof THREE.Bone) continue;
        if (!(child instanceof THREE.Mesh)) { collect(child); continue; }
        const geometry = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
        geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverseRoot, child.matrixWorld));
        const count = geometry.attributes.position.count;
        const color = (child.material as THREE.MeshLambertMaterial).color;
        const colors = new Float32Array(count * 3), indices = new Uint16Array(count * 4), weights = new Float32Array(count * 4);
        for (let i = 0; i < count; i++) {
          colors.set([color.r, color.g, color.b], i * 3);
          indices[i * 4] = index;
          weights[i * 4] = 1;
        }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('skinIndex', new THREE.BufferAttribute(indices, 4));
        geometry.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4));
        parts.push(geometry);
        node.remove(child);
      }
    };
    collect(skinBone);
  }
  const geometry = mergeGeometries(parts, false)!;
  parts.forEach((part) => part.dispose());
  const skeleton = new THREE.Skeleton(skinBones);
  const mesh = new THREE.SkinnedMesh(geometry, RIG_MATERIAL);
  mesh.castShadow = true;
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 4);
  root.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(skeleton);
  const parents = new Int32Array(skinBones.map((bone) => skinBones.indexOf(bone.parent as THREE.Bone)));
  const restPositions = new Float32Array(skinBones.flatMap((bone) => [bone.position.x, bone.position.y, bone.position.z]));
  const mask = new Float32Array(skinBones.length);
  for (const name of ['spine', 'chest', 'neck', 'head', 'lUpperArm', 'lForearm', 'lHand', 'rUpperArm', 'rForearm', 'rHand'] as BoneName[]) mask[BONES.indexOf(name)] = 1;
  if (cape) mask[skinBones.length - 1] = 1;
  const rig: Rig = { root, bones, skeleton, mesh, cape, current: new Float32Array(BONES.length * 3),
    upperCurrent: new Float32Array(BONES.length * 3), upperWeight: 0, ozzFailed: false, ozzMatricesActive: false, parents, restPositions,
    baseQuaternions: new Float32Array(skinBones.length * 4), upperQuaternions: new Float32Array(skinBones.length * 4),
    additiveQuaternions: new Float32Array(skinBones.length * 4), upperMask: mask,
    feet: [{ weight: 0, planted: false }, { weight: 0, planted: false }], hipsBase: 0.95, hipsY: 0 };
  const originalUpdate = skeleton.update.bind(skeleton);
  const local = new THREE.Matrix4(), world = new THREE.Matrix4(), skin = new THREE.Matrix4();
  skeleton.update = () => {
    const matrices = skeleton.boneMatrices;
    if (!rig.ozz || !rig.ozzMatricesActive || !matrices) { originalUpdate(); return; }
    for (let i = 0; i < skinBones.length; i++) {
      local.fromArray(rig.ozz.matrices, i * 16);
      world.multiplyMatrices(root.matrixWorld, local);
      skin.multiplyMatrices(world, skeleton.boneInverses[i]).toArray(matrices, i * 16);
    }
    if (skeleton.boneTexture) skeleton.boneTexture.needsUpdate = true;
  };
  return rig;
}

// --- pose evaluation ---------------------------------------------------------------------------
const target = new Float32Array(BONES.length * 3);
const IDX = Object.fromEntries(BONES.map((n, i) => [n, i * 3])) as Record<BoneName, number>;
function set(b: BoneName, x: number, y = 0, z = 0) { const i = IDX[b]; target[i] = x; target[i + 1] = y; target[i + 2] = z; }
function add(b: BoneName, x: number, y = 0, z = 0) { const i = IDX[b]; target[i] += x; target[i + 1] += y; target[i + 2] += z; }
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const ease = (n: number) => n * n * (3 - 2 * n);

function gait(ph: number, leg: number, knee: number, arm: number, blend = 1) {
  const s = Math.sin(ph), c = Math.cos(ph);
  set('lThigh', -s * leg * blend); set('rThigh', s * leg * blend);
  set('lShin', (Math.max(0, c) * knee + 0.06) * blend); set('rShin', (Math.max(0, -c) * knee + 0.06) * blend);
  set('lFoot', s * leg * 0.4 * blend); set('rFoot', -s * leg * 0.4 * blend);
  set('lUpperArm', s * arm * blend, 0, 0.06 * blend); set('rUpperArm', -s * arm * blend, 0, -0.06 * blend);
  set('lForearm', (-0.25 - arm * 0.35) * blend); set('rForearm', (-0.25 - arm * 0.35) * blend);
  add('chest', 0, s * 0.12 * blend, 0);
  add('hips', 0, -s * 0.08 * blend, 0);
}

export interface AnimContext {
  phase: number; actionT: number; speed: number; lookYaw?: number; grounded?: boolean;
  groundHeight?: (x: number, z: number) => number | null;
}

function pose(state: AnimState, t: number, c: AnimContext): number {
  target.fill(0);
  let hy = 0;
  const breathe = Math.sin(t * 1.9) * 0.025;
  switch (state) {
    case 'idle':
      set('chest', breathe); set('head', Math.sin(t * 0.37) * 0.05, Math.sin(t * 0.23) * 0.25, 0);
      set('lUpperArm', 0.04, 0, 0.09); set('rUpperArm', 0.04, 0, -0.09);
      set('lForearm', -0.15); set('rForearm', -0.15);
      set('lThigh', 0, 0, 0.03); set('rThigh', 0, 0, -0.03);
      break;
    case 'walk':
      gait(c.phase, 0.55, 0.65, 0.42, clamp01(c.speed / 2.5)); set('chest', 0.03, target[IDX.chest + 1]); hy = -Math.abs(Math.sin(c.phase)) * 0.03 * clamp01(c.speed / 2.5);
      break;
    case 'run':
      gait(c.phase, 0.95, 1.2, 0.85, clamp01(c.speed / 6)); add('spine', 0.22); add('head', -0.14); set('lForearm', -1.2); set('rForearm', -1.2);
      hy = -Math.abs(Math.sin(c.phase)) * 0.07 + 0.02;
      break;
    case 'carry': case 'carryWalk':
      if (state === 'carryWalk') gait(c.phase, 0.42, 0.5, 0, clamp01(c.speed / 2.5));
      set('lUpperArm', -1.15, 0, -0.28); set('rUpperArm', -1.15, 0, 0.28);
      set('lForearm', -0.55); set('rForearm', -0.55); add('spine', -0.08);
      break;
    case 'sneak':
      gait(c.phase, 0.32, 0.5, 0.12, clamp01(c.speed / 1.8));
      set('spine', 0.5); set('chest', 0.12); set('head', -0.3);
      set('lForearm', -0.7); set('rForearm', -0.7);
      hy = -0.16;
      break;
    case 'jump':
      set('lThigh', -0.75); set('rThigh', -0.15); set('lShin', 0.95); set('rShin', 0.35);
      set('lUpperArm', -0.9, 0, 0.35); set('rUpperArm', -0.6, 0, -0.35); set('spine', 0.12);
      break;
    case 'fall':
      set('lUpperArm', -0.3, 0, 1.0); set('rUpperArm', -0.3, 0, -1.0); set('lThigh', -0.35); set('rThigh', 0.1); set('lShin', 0.55); set('rShin', 0.3);
      break;
    case 'land': {
      const k = 1 - clamp01(c.actionT / 0.22);
      hy = -0.18 * k; set('lThigh', -0.8 * k); set('rThigh', -0.8 * k); set('lShin', 1.3 * k); set('rShin', 1.3 * k);
      set('lFoot', -0.5 * k); set('rFoot', -0.5 * k); set('spine', 0.35 * k); set('lUpperArm', -0.4 * k, 0, 0.3); set('rUpperArm', -0.4 * k, 0, -0.3);
      break;
    }
    case 'attack1': case 'attack2': {
      const { windup: w, strike: s } = sampleAttack(state, c.actionT);
      const dir = state === 'attack1' ? 1 : -1;
      set('rUpperArm', -1.45, dir * (0.95 * w - 1.7 * s), dir * -0.25); set('rForearm', -0.45 + 0.3 * s);
      set('chest', 0.05, dir * (0.55 * w - 0.8 * s)); set('spine', 0.12, dir * (0.2 * w - 0.3 * s));
      set('lUpperArm', -0.35, 0, 0.35); set('lForearm', -0.8);
      set('lThigh', -0.4); set('rThigh', 0.32); set('lShin', 0.35); set('rShin', 0.25); hy = -0.05;
      break;
    }
    case 'attack3': {
      const { windup: w, strike: s } = sampleAttack(state, c.actionT);
      set('rUpperArm', -0.6 - 2.3 * w + 2.4 * s); set('lUpperArm', -0.6 - 2.1 * w + 2.2 * s); set('rForearm', -0.5 + 0.3 * s); set('lForearm', -0.5);
      set('spine', -0.22 * w + 0.65 * s); set('chest', -0.1 * w + 0.2 * s);
      set('lThigh', -0.55 * s - 0.1); set('rThigh', 0.45 * s); set('lShin', 0.5 * s); set('rShin', 0.3);
      hy = -0.14 * s;
      break;
    }
    case 'roll': {
      const a = clamp01(c.actionT / 0.55);
      set('hips', a * Math.PI * 2); hy = -0.42 * Math.sin(a * Math.PI);
      const tuck = Math.sin(a * Math.PI);
      set('lThigh', -1.6 * tuck); set('rThigh', -1.6 * tuck); set('lShin', 2 * tuck); set('rShin', 2 * tuck);
      set('spine', 0.6 * tuck); set('lUpperArm', -1.2 * tuck); set('rUpperArm', -1.2 * tuck); set('lForearm', -1.3 * tuck); set('rForearm', -1.3 * tuck);
      break;
    }
    case 'hurt':
      set('spine', -0.35); set('head', -0.3); set('lUpperArm', 0.2, 0, 0.55); set('rUpperArm', 0.2, 0, -0.55); hy = -0.05;
      break;
    case 'dead':
      set('hips', -1.45); hy = -0.74; set('lUpperArm', 0, 0, 1.2); set('rUpperArm', 0, 0, -1.3); set('head', 0, 0.4); set('lThigh', -0.15); set('rThigh', 0.1);
      break;
    case 'captured':
      set('spine', 0.28); set('chest', 0.1); set('head', 0.2, Math.sin(t * 0.7) * 0.08);
      set('lUpperArm', -1.35, 0, 0.32); set('rUpperArm', -1.35, 0, -0.32);
      set('lForearm', -1.15); set('rForearm', -1.15); set('lHand', -0.2); set('rHand', -0.2);
      set('lThigh', -0.1); set('rThigh', 0.1); hy = -0.04;
      break;
    case 'gather': {
      const cyc = c.actionT > 0 ? clamp01(c.actionT / 0.95) : (t * 1.1) % 1;
      const lift = cyc < 0.62 ? ease(cyc / 0.62) : 1 - ease((cyc - 0.62) / 0.38);
      set('rUpperArm', -0.5 - 2.1 * lift, 0.2); set('lUpperArm', -0.5 - 2.0 * lift, -0.2); set('rForearm', -0.35); set('lForearm', -0.35);
      set('spine', 0.4 - 0.5 * lift); set('lThigh', -0.35); set('rThigh', 0.25); set('lShin', 0.3); set('rShin', 0.2); hy = -0.05;
      break;
    }
    case 'work': {
      const cyc = (t * 1.4) % 1, lift = cyc < 0.6 ? ease(cyc / 0.6) : 1 - ease((cyc - 0.6) / 0.4);
      set('rUpperArm', -0.4 - 1.6 * lift); set('rForearm', -0.7); set('lUpperArm', -0.6, 0, -0.2); set('lForearm', -1.0);
      set('spine', 0.3); set('head', 0.25);
      break;
    }
    case 'tend':
      set('spine', 0.85 + Math.sin(t * 0.8) * 0.06); set('lThigh', -0.55); set('rThigh', -0.55); set('lShin', 0.9); set('rShin', 0.9);
      set('lUpperArm', -0.9 + Math.sin(t * 2.2) * 0.25); set('rUpperArm', -0.9 - Math.sin(t * 2.2) * 0.25); hy = -0.18;
      break;
    case 'talk':
      set('chest', breathe); set('rUpperArm', -0.35 + Math.sin(t * 2.1) * 0.22, 0, -0.1); set('rForearm', -0.95 + Math.sin(t * 2.7) * 0.3);
      set('lUpperArm', -0.15 + Math.sin(t * 1.3 + 1) * 0.12, 0, 0.12); set('lForearm', -0.55);
      set('head', Math.sin(t * 1.7) * 0.06, Math.sin(t * 0.9) * 0.14);
      break;
    case 'sit':
      hy = -0.42; set('lThigh', -1.5); set('rThigh', -1.5); set('lShin', 1.5); set('rShin', 1.5);
      set('spine', 0.05 + breathe); set('lUpperArm', -0.45); set('rUpperArm', -0.45); set('lForearm', -0.8); set('rForearm', -0.8);
      set('head', 0.25);
      break;
    case 'sleep':
      set('hips', 0, 0, 1.5); hy = -0.78; set('lThigh', -0.5); set('rThigh', -0.6); set('lShin', 0.8); set('rShin', 0.9);
      set('lUpperArm', -0.7); set('rUpperArm', -0.5); set('chest', Math.sin(t * 0.9) * 0.03);
      break;
    case 'cheer':
      set('lUpperArm', -2.8, 0, 0.3); set('rUpperArm', -2.8, 0, -0.3); hy = Math.abs(Math.sin(t * 6)) * 0.05;
      break;
    case 'pickup': {
      const bnd = Math.sin(clamp01(c.actionT / 0.38) * Math.PI);
      set('spine', 0.95 * bnd); set('lThigh', -0.6 * bnd); set('rThigh', -0.6 * bnd); set('lShin', 1.0 * bnd); set('rShin', 1.0 * bnd);
      set('lUpperArm', -1.0 * bnd); set('rUpperArm', -1.0 * bnd); hy = -0.25 * bnd;
      break;
    }
    case 'throw': {
      const a = clamp01(c.actionT / 0.35);
      set('rUpperArm', a < 0.35 ? 0.9 * (a / 0.35) : 0.9 - 2.7 * ease((a - 0.35) / 0.65)); set('rForearm', -0.4);
      set('spine', a < 0.35 ? -0.2 : 0.3); set('chest', 0, a < 0.35 ? 0.4 : -0.3); set('lUpperArm', -0.7, 0, 0.3);
      set('lThigh', -0.35); set('rThigh', 0.3);
      break;
    }
    case 'windup':
      set('spine', -0.28); set('lUpperArm', -2.6, 0, 0.2); set('rUpperArm', -2.6, 0, -0.2); set('lForearm', -0.4); set('rForearm', -0.4);
      set('lThigh', -0.3); set('rThigh', 0.3); hy = -0.04;
      break;
    case 'block':
      set('spine', 0.12); set('lUpperArm', -1.25, 0.15, 0.35); set('rUpperArm', -1.1, -0.2, -0.3);
      set('lForearm', -1.25); set('rForearm', -1.15); set('head', -0.08);
      break;
    case 'strike':
      set('spine', 0.55); set('lUpperArm', -0.4); set('rUpperArm', -0.4); set('lForearm', -0.2); set('rForearm', -0.2);
      set('lThigh', -0.5); set('rThigh', 0.4); set('lShin', 0.4); hy = -0.1;
      break;
  }
  return hy;
}

const upperTarget = new Float32Array(BONES.length * 3);
const motionEuler = new THREE.Euler();
const baseQuaternion = new THREE.Quaternion(), upperQuaternion = new THREE.Quaternion(), additiveQuaternion = new THREE.Quaternion();
const rootInverse = new THREE.Matrix4();
const footWorld = new THREE.Vector3(), targetLocal = new THREE.Vector3();
const ankleMatrix = new THREE.Matrix4(), ankleWorldMatrix = new THREE.Matrix4();
const groundNormal = new THREE.Vector3(), footUp = new THREE.Vector3(), decomposedPosition = new THREE.Vector3(), decomposedScale = new THREE.Vector3();
const ankleRotation = new THREE.Quaternion(), worldCorrection = new THREE.Quaternion(), localCorrection = new THREE.Quaternion(), weightedCorrection = new THREE.Quaternion();

function supportSlope(before: number | null, center: number, after: number | null) {
  if (before === null || after === null || !Number.isFinite(before) || !Number.isFinite(after) || !Number.isFinite(center)) return 0;
  const first = center - before, second = after - center;
  return Math.abs(first - second) > 0.04 ? -2 * (Math.abs(first) < Math.abs(second) ? first : second) : before - after;
}

function applyFootIK(rig: Rig, state: AnimState, dt: number, context: AnimContext) {
  const ozz = rig.ozz;
  const allowed = !!ozz && !!context.groundHeight && !!context.grounded
    && !['jump', 'fall', 'roll', 'sit', 'sleep', 'dead', 'pickup'].includes(state);
  if (!allowed || !ozz || !context.groundHeight) {
    for (const foot of rig.feet) { foot.weight = 0; foot.planted = false; foot.anchor = undefined; }
    return;
  }
  rig.root.updateWorldMatrix(true, false);
  rootInverse.copy(rig.root.matrixWorld).invert();
  const rootElements = rig.root.matrixWorld.elements;
  const footHeight = 0.07 * Math.hypot(rootElements[4], rootElements[5], rootElements[6]);
  const chains = [[11, 12, 13], [14, 15, 16]] as const;
  for (const [side, [hip, knee, ankle]] of chains.entries()) {
    const plant = rig.feet[side];
    footWorld.fromArray(ozz.matrices, ankle * 16 + 12).applyMatrix4(rig.root.matrixWorld);
    const height = context.groundHeight(footWorld.x, footWorld.z);
    const stance = height !== null && Number.isFinite(height)
      && (context.speed < 0.25 || Math.sin(context.phase + side * Math.PI) > 0)
      && footWorld.y - height < 0.4;
    if (stance && height !== null) {
      if (!plant.planted || !plant.anchor || Math.hypot(plant.anchor.x - footWorld.x, plant.anchor.z - footWorld.z) > 0.7) {
        plant.anchor = new THREE.Vector3(footWorld.x, height + footHeight, footWorld.z);
      }
      plant.planted = true;
    } else plant.planted = false;
    const targetWeight = plant.planted ? 1 : 0;
    plant.weight += (targetWeight - plant.weight) * (1 - Math.exp(-Math.max(0, dt) * 14));
    if (plant.anchor && plant.weight > 0.01) {
      const anchorHeight = context.groundHeight(plant.anchor.x, plant.anchor.z);
      if (anchorHeight !== null && Number.isFinite(anchorHeight)) plant.anchor.y = anchorHeight + footHeight;
      targetLocal.copy(plant.anchor).applyMatrix4(rootInverse);
      if (ozz.solveLeg(hip, knee, ankle, targetLocal, plant.weight)) {
        const x = plant.anchor.x, z = plant.anchor.z, epsilon = 0.12;
        const left = context.groundHeight(x - epsilon, z), right = context.groundHeight(x + epsilon, z);
        const back = context.groundHeight(x, z - epsilon), front = context.groundHeight(x, z + epsilon);
        const center = anchorHeight !== null && Number.isFinite(anchorHeight) ? anchorHeight : plant.anchor.y - footHeight;
        groundNormal.set(supportSlope(left, center, right), epsilon * 2, supportSlope(back, center, front)).normalize();
        ankleMatrix.fromArray(ozz.matrices, ankle * 16);
        ankleWorldMatrix.multiplyMatrices(rig.root.matrixWorld, ankleMatrix).decompose(decomposedPosition, ankleRotation, decomposedScale);
        footUp.set(0, 1, 0).applyQuaternion(ankleRotation);
        worldCorrection.setFromUnitVectors(footUp, groundNormal);
        localCorrection.copy(ankleRotation).invert().multiply(worldCorrection).multiply(ankleRotation);
        weightedCorrection.identity().slerp(localCorrection, plant.weight);
        ozz.rotateJoint(ankle, weightedCorrection);
      }
    } else if (!plant.planted) plant.anchor = undefined;
  }
}

/** Blend locomotion, masked actions and additive motion, then solve grounded feet. */
export function animateRig(rig: Rig, state: AnimState, t: number, dt: number, c: AnimContext) {
  let hy = pose(state, t, c);
  upperTarget.set(target);
  const upperAction = state.startsWith('attack') || state === 'block' || state === 'windup' || state === 'strike';
  const moving = c.speed > 0.3 && (upperAction || state === 'hurt');
  if (moving) hy = pose(c.speed > 3 ? 'run' : 'walk', t, c);
  const layered = moving && upperAction;
  if (!layered) upperTarget.set(target);
  const headYaw = Math.max(-1, Math.min(1, c.lookYaw ?? 0));
  target[IDX.head + 1] += headYaw;
  upperTarget[IDX.head + 1] += headYaw;
  const snappy = state === 'roll' || state.startsWith('attack') || state === 'strike' || state === 'throw';
  const k = state === 'roll' ? 1 : 1 - Math.exp(-Math.max(0, dt) * (snappy ? 26 : 12));
  for (let i = 0; i < rig.current.length; i++) {
    rig.current[i] += Math.atan2(Math.sin(target[i] - rig.current[i]), Math.cos(target[i] - rig.current[i])) * k;
    rig.upperCurrent[i] += Math.atan2(Math.sin(upperTarget[i] - rig.upperCurrent[i]), Math.cos(upperTarget[i] - rig.upperCurrent[i])) * k;
  }
  rig.upperWeight += ((layered ? 1 : 0) - rig.upperWeight) * k;
  rig.hipsY += (hy - rig.hipsY) * (state === 'roll' ? 1 : k);
  const recoil = state === 'hurt' ? sampleRecoil(c.actionT) : 0;
  const breathe = state === 'dead' || state === 'roll' ? 0 : Math.sin(t * 1.9) * 0.018;
  const count = rig.parents.length;
  for (let i = 0; i < count; i++) {
    const at = i * 3;
    const cape = i >= BONES.length;
    const capeAngle = 0.12 + Math.min(1.1, c.speed * 0.14) + Math.sin(t * 3.1) * 0.04;
    baseQuaternion.setFromEuler(motionEuler.set(cape ? capeAngle : rig.current[at], cape ? 0 : rig.current[at + 1], cape ? 0 : rig.current[at + 2]));
    upperQuaternion.setFromEuler(motionEuler.set(cape ? capeAngle : rig.upperCurrent[at], cape ? 0 : rig.upperCurrent[at + 1], cape ? 0 : rig.upperCurrent[at + 2]));
    const additiveX = i === 2 ? breathe - recoil * 0.28 : i === 4 ? -recoil * 0.16 : 0;
    const additiveZ = i === 5 ? recoil * 0.12 : i === 8 ? -recoil * 0.12 : 0;
    additiveQuaternion.setFromEuler(motionEuler.set(additiveX, 0, additiveZ));
    baseQuaternion.toArray(rig.baseQuaternions, i * 4);
    upperQuaternion.toArray(rig.upperQuaternions, i * 4);
    additiveQuaternion.toArray(rig.additiveQuaternions, i * 4);
  }
  if (!rig.ozz && !rig.ozzFailed && ozzStatus === 'ready') {
    rig.ozz = createOzzPose(rig.parents, rig.restPositions);
    if (!rig.ozz) rig.ozzFailed = true;
  }
  const blended = rig.ozz?.blend(rig.baseQuaternions, rig.upperQuaternions, rig.additiveQuaternions,
    rig.upperMask, rig.upperWeight, 1, rig.hipsY) ?? false;
  if (blended && rig.ozz) {
    applyFootIK(rig, state, dt, c);
    for (let i = 0; i < count; i++) rig.skeleton.bones[i].quaternion.fromArray(rig.ozz.quaternions, i * 4);
    rig.ozzMatricesActive = true;
  } else {
    rig.ozzMatricesActive = false;
    for (let i = 0; i < count; i++) {
      baseQuaternion.fromArray(rig.baseQuaternions, i * 4);
      upperQuaternion.fromArray(rig.upperQuaternions, i * 4);
      additiveQuaternion.fromArray(rig.additiveQuaternions, i * 4);
      rig.skeleton.bones[i].quaternion.copy(baseQuaternion.slerp(upperQuaternion, rig.upperMask[i] * rig.upperWeight).multiply(additiveQuaternion));
    }
  }
  rig.bones.hips.position.y = rig.hipsBase + rig.hipsY;
}

export function disposeRig(rig: Rig) { rig.ozz?.dispose(); rig.ozz = undefined; rig.ozzMatricesActive = false; }
