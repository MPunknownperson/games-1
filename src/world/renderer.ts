// Three.js presentation of the simulation. Static props share merged, vertex-coloured geometry (one draw
// call each); characters use skeletal rigs. The same camera serves the title, intro and play.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { animateRig, buildRig, type AnimState, type Rig, type RigStyle } from './rig';
import { BUILDINGS, PLAYER_ID, type Actor, type ActionKind, type Point, type SandboxWorld, type StructureKind } from './simulation';
import type { ItemType } from './items';

export type CameraMode = 'title' | 'intro' | 'play';

const C = {
  trunk: '#5b4232', leafA: '#3b5a31', leafB: '#4c6d35', leafC: '#62803d', pine: '#2e4b33', pineB: '#3a5a39', birch: '#d6cfbf',
  stone: '#9a9588', stoneDark: '#6d6b63', stoneLight: '#bbb4a2', plaster: '#ddd2ba', timber: '#563c2a', thatch: '#9f7f4c',
  slate: '#58646b', door: '#46301f', roofRed: '#87493a', canvasRed: '#8d4c3a', canvasTeal: '#4c675e', wood: '#76573c',
  woodLight: '#9c7a54', dark: '#2a2622', iron: '#5f6264', bronze: '#9a7a45', water: '#4b636b',
};

const PRIM = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  taper: new THREE.CylinderGeometry(0.38, 0.5, 1, 8),
  cone: new THREE.ConeGeometry(0.5, 1, 8),
  cone4: new THREE.ConeGeometry(0.5, 1, 4),
  dodec: new THREE.DodecahedronGeometry(0.5, 0),
  ico: new THREE.IcosahedronGeometry(0.5, 1),
  octa: new THREE.OctahedronGeometry(0.5, 0),
};
type Prim = keyof typeof PRIM;

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();

/** Accumulates transformed, coloured primitives and merges them into a single geometry. */
class Shape {
  private parts: THREE.BufferGeometry[] = [];
  add(prim: Prim, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, rx = 0, rz = 0) {
    const src = PRIM[prim];
    const g = src.index ? src.toNonIndexed() : src.clone();
    g.deleteAttribute('uv');
    tmpM.compose(tmpP.set(x, y, z), tmpQ.setFromEuler(tmpE.set(rx, ry, rz)), tmpS.set(sx, sy, sz));
    g.applyMatrix4(tmpM);
    tmpC.set(color);
    const n = g.attributes.position.count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { colors[i * 3] = tmpC.r; colors[i * 3 + 1] = tmpC.g; colors[i * 3 + 2] = tmpC.b; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.parts.push(g);
    return this;
  }
  build() {
    const merged = mergeGeometries(this.parts)!;
    for (const p of this.parts) p.dispose();
    merged.computeBoundingSphere();
    return merged;
  }
}

const STYLES: Partial<RigStyle>[] = [
  { coat: '#6a4f6e', trim: '#d8c6a0', skirt: true, hair: '#cfc6b8' },
  { coat: '#7b5a38', trim: '#c9a464', hair: '#2b211a', build: 1.2 },
  { coat: '#4b5a63', trim: '#8f9497', helm: true, weapon: 'staff' },
  { coat: '#8a6d4f', trim: '#5b4636', hair: '#5a3a26' },
  { coat: '#5f6b3d', trim: '#8a7449', hair: '#3a2a1c', build: 1.15 },
  { coat: '#5e7a5a', trim: '#d6c9a3', skirt: true, hair: '#8c4a2e' },
  { coat: '#8a7a52', trim: '#5b4a32', hair: '#bdb6aa' },
  { coat: '#4b5a63', trim: '#8f9497', helm: true, weapon: 'staff' },
  { coat: '#6d5a3c', trim: '#9b8656', hood: true },
  { coat: '#5a6a7a', trim: '#d9cfb8', skirt: true, hair: '#2e2420', height: 0.92 },
  { coat: '#3e3a36', trim: '#8d5a3a', hair: '#1f1a16', build: 1.15 },
  { coat: '#7a8a4e', trim: '#c8b886', skirt: true, hair: '#d8b070' },
  { coat: '#d8cfbd', trim: '#8a6a4a', hair: '#6a4a32', build: 1.2 },
  { coat: '#3d4a3a', trim: '#7a6a4a', hood: true },
];
const SKINS = ['#d3a585', '#b9855f', '#e2b796', '#8f6346'];

const ACTION_ANIM: Record<ActionKind, AnimState> = {
  attack1: 'attack1', attack2: 'attack2', attack3: 'attack3', roll: 'roll', gather: 'gather', throw: 'throw', hurt: 'hurt',
  pickup: 'pickup', land: 'land', windup: 'windup', strike: 'strike', cheer: 'cheer',
};

interface Visual {
  obj: THREE.Object3D; rig?: Rig; frame: number; lx: number; ly: number; lz: number; lf: number;
  isStatic: boolean; phase: number; yaw: number; glyphs?: THREE.Object3D[]; glow?: THREE.Object3D;
  shot?: THREE.Line; stump?: THREE.Object3D; main?: THREE.Object3D; weaponLevel?: number; body?: THREE.Object3D; shook?: boolean;
  poolKey?: string; poolIndex?: number; poolAlive?: boolean;
}

interface Pool { mesh: THREE.InstancedMesh; next: number }

const angleDelta = (from: number, to: number) => {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

export class WorldRenderer {
  readonly camera: THREE.PerspectiveCamera;
  readonly scene = new THREE.Scene();
  readonly renderer: THREE.WebGLRenderer;
  mode: CameraMode = 'title';
  yaw = 0;
  pitch = 0.3;
  distance = 6.5;
  readonly introDuration = 9;
  private world: SandboxWorld;
  private visuals = new Map<string, Visual>();
  private pools = new Map<string, Pool>();
  private geometryCache = new Map<string, THREE.BufferGeometry>();
  private frame = 0;
  private time = 0;
  private introTime = 0;
  private camPos = new THREE.Vector3(40, 30, 40);
  private camLook = new THREE.Vector3();
  private focusShot: { target: Point; t: number; duration: number } | null = null;
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private beacon: THREE.PointLight;
  private ghost: THREE.Mesh | null = null;
  private ghostKind: StructureKind | null = null;
  private resizeHandler: () => void;
  private vertexMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private windowMat = new THREE.MeshLambertMaterial({ color: '#3a2f22', emissive: '#f2b25c', emissiveIntensity: 0 });
  private glowMat = new THREE.MeshLambertMaterial({ color: '#e9cf8a', emissive: '#d99a3a', emissiveIntensity: 0.8 });
  private glyphMat = new THREE.MeshBasicMaterial({ color: '#f1d68f', side: THREE.DoubleSide });
  private carveMat = new THREE.MeshBasicMaterial({ color: '#3c3a33', side: THREE.DoubleSide });
  private ghostOk = new THREE.MeshBasicMaterial({ color: '#cfe7c4', transparent: true, opacity: 0.45, depthWrite: false });
  private ghostBad = new THREE.MeshBasicMaterial({ color: '#e7a08f', transparent: true, opacity: 0.45, depthWrite: false });
  private skyDay = new THREE.Color('#c4d3c9');
  private skyDusk = new THREE.Color('#d9a888');
  private skyNight = new THREE.Color('#1a2230');
  private sunDay = new THREE.Color('#fff0d4');
  private sunDusk = new THREE.Color('#ffab6a');
  private sunNight = new THREE.Color('#7f92bb');
  private sky = new THREE.Color();

  constructor(canvas: HTMLCanvasElement, world: SandboxWorld) {
    this.world = world;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene.background = new THREE.Color('#c4d3c9');
    this.scene.fog = new THREE.Fog('#c4d3c9', 45, 165);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 230);

    this.hemi = new THREE.HemisphereLight('#e6efe2', '#5d6b52', 1.4);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff0d4', 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 120;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);
    this.beacon = new THREE.PointLight('#ffc670', 0, 26, 2);
    this.beacon.position.set(world.citadel.x, 11, world.citadel.z);
    this.scene.add(this.beacon);

    this.createTerrain();
    this.resizeHandler = () => this.resize();
    window.addEventListener('resize', this.resizeHandler);
    this.resize();
    const p = world.player;
    this.yaw = p.facing + Math.PI;
  }

  // ------------------------------------------------------------------ terrain
  private createTerrain() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#6a7f4e';
    ctx.fillRect(0, 0, 256, 256);
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 60; i++) {
      ctx.globalAlpha = 0.07;
      ctx.fillStyle = i % 2 ? '#5d7843' : '#86995b';
      ctx.beginPath(); ctx.arc(rnd() * 256, rnd() * 256, 10 + rnd() * 30, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 3500; i++) {
      ctx.globalAlpha = 0.08 + rnd() * 0.12;
      ctx.fillStyle = ['#4f683a', '#93a265', '#7b9152', '#a4a874'][Math.floor(rnd() * 4)];
      ctx.fillRect(rnd() * 256, rnd() * 256, 1, 1 + rnd() * 3);
    }
    const grass = new THREE.CanvasTexture(canvas);
    grass.colorSpace = THREE.SRGBColorSpace;
    grass.wrapS = grass.wrapT = THREE.RepeatWrapping;
    grass.repeat.set(70, 70);
    grass.anisotropy = 4;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(420, 420), new THREE.MeshLambertMaterial({ map: grass }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Worn paths between the places people actually go.
    const pathMat = new THREE.MeshLambertMaterial({ color: '#a38e69' });
    const paths: [number, number, number, number, number][] = [
      [1, 6, 2, 70, 4.2], [-6, 5, -27, 8, 3], [-27, 8, -42, 33, 2.6], [9, -2, 24, -17, 2.6], [8, 8, 22, 7, 2.4], [-4, -10, -11, -16, 2.2], [4, -10, 11, -16, 2.2],
    ];
    for (const [x1, z1, x2, z2, w] of paths) {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(w, len), pathMat);
      strip.rotation.x = -Math.PI / 2;
      strip.rotation.z = -Math.atan2(x2 - x1, z2 - z1);
      strip.position.set((x1 + x2) / 2, 0.02, (z1 + z2) / 2);
      strip.receiveShadow = true;
      this.scene.add(strip);
    }
    const paveCanvas = document.createElement('canvas');
    paveCanvas.width = paveCanvas.height = 256;
    const pc = paveCanvas.getContext('2d')!;
    pc.fillStyle = '#8e8a78'; pc.fillRect(0, 0, 256, 256);
    for (let r = 0; r < 8; r++) for (let c = -1; c < 8; c++) {
      pc.fillStyle = ['#b3ad97', '#a8a28b', '#bdb7a1', '#a39d87'][(r * 3 + c + 8) % 4];
      pc.fillRect(c * 36 + (r % 2) * 18 + 2, r * 32 + 2, 32, 28);
    }
    const pave = new THREE.CanvasTexture(paveCanvas);
    pave.colorSpace = THREE.SRGBColorSpace;
    pave.wrapS = pave.wrapT = THREE.RepeatWrapping;
    pave.repeat.set(4, 4);
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(12.5, 48), new THREE.MeshLambertMaterial({ map: pave }));
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(0, 0.03, -2);
    plaza.receiveShadow = true;
    this.scene.add(plaza);

    // Instanced tufts: one draw call of texture for the whole valley.
    const tuftGeo = new THREE.ConeGeometry(0.09, 0.42, 3);
    tuftGeo.translate(0, 0.21, 0);
    const tufts = new THREE.InstancedMesh(tuftGeo, new THREE.MeshLambertMaterial({ color: '#ffffff' }), 2600);
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    let n = 0;
    for (let i = 0; i < 6000 && n < 2600; i++) {
      const x = (rnd() - 0.5) * 175, z = (rnd() - 0.5) * 175;
      if (Math.hypot(x, z + 2) < 13.5 || (Math.abs(x - 1.5) < 3 && z > 6 && z < 70)) continue;
      const s = 0.7 + rnd() * 0.9;
      m.compose(tmpP.set(x, 0, z), tmpQ.setFromEuler(tmpE.set((rnd() - 0.5) * 0.4, rnd() * 6, (rnd() - 0.5) * 0.4)), tmpS.set(s, s * (0.8 + rnd() * 0.8), s));
      tufts.setMatrixAt(n, m);
      tufts.setColorAt(n, col.set(rnd() < 0.08 ? (rnd() < 0.5 ? '#d9c76a' : '#c99aa8') : rnd() < 0.5 ? '#557238' : '#6f8a45'));
      n++;
    }
    tufts.count = n;
    tufts.instanceMatrix.needsUpdate = true;
    if (tufts.instanceColor) tufts.instanceColor.needsUpdate = true;
    this.scene.add(tufts);

    // A ring of distant hills, merged into one mesh.
    const hills = new Shape();
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2, r = 150 + (i % 3) * 14;
      const h = 26 + ((i * 7) % 5) * 9;
      hills.add('cone', i % 2 ? '#7d9585' : '#8aa18f', Math.cos(a) * r, h / 2 - 3, Math.sin(a) * r, 60 + (i % 4) * 10, h, 60, a);
    }
    const hillMesh = new THREE.Mesh(hills.build(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }));
    this.scene.add(hillMesh);
  }

  // ------------------------------------------------------------------ geometry
  private cached(key: string, make: () => THREE.BufferGeometry) {
    let g = this.geometryCache.get(key);
    if (!g) { g = make(); this.geometryCache.set(key, g); }
    return g;
  }

  private staticGeometry(a: Actor): THREE.BufferGeometry {
    const v = a.variant;
    switch (a.kind) {
      case 'tree': return this.cached(`tree${v}`, () => {
        const s = new Shape();
        if (v === 1) {
          s.add('taper', C.trunk, 0, 0.8, 0, 0.42, 1.6, 0.42);
          s.add('cone', C.pine, 0, 2.3, 0, 3.4, 2.6, 3.4).add('cone', C.pineB, 0, 3.6, 0, 2.6, 2.2, 2.6).add('cone', C.pine, 0, 4.7, 0, 1.7, 1.8, 1.7);
        } else if (v === 2) {
          s.add('taper', C.birch, 0, 1.7, 0, 0.32, 3.4, 0.32);
          s.add('ico', C.leafC, 0, 4.2, 0, 2.2, 3, 2.2).add('ico', C.leafB, 0.5, 3.3, 0.3, 1.4, 1.6, 1.4);
        } else {
          s.add('taper', C.trunk, 0, 1.3, 0, 0.55, 2.6, 0.55);
          s.add('dodec', C.leafB, 0, 3.7, 0, 3.2, 2.6, 3.2).add('dodec', C.leafA, -0.9, 3.1, 0.4, 2.2, 1.9, 2.2).add('dodec', C.leafC, 0.9, 3.4, -0.3, 2, 1.8, 2);
        }
        return s.build();
      });
      case 'ore': return this.cached(`ore${v}`, () => new Shape()
        .add('dodec', C.stoneDark, 0, 0.5, 0, 2, 1.3, 1.7, v)
        .add('dodec', C.stone, 0.6, 0.85, 0.2, 1.1, 0.9, 1)
        .add('octa', C.stoneLight, -0.4, 1.05, 0.1, 0.45, 0.8, 0.45, 0, 0, 0.3).build());
      case 'house': return this.cached(`house${v}`, () => {
        const s = new Shape();
        s.add('box', C.stoneDark, 0, 0.2, 0, 5, 0.4, 4.6).add('box', C.plaster, 0, 1.8, 0, 4.2, 2.8, 3.8);
        for (const x of [-2.02, 2.02]) for (const z of [-1.82, 1.82]) s.add('box', C.timber, x, 1.85, z, 0.22, 2.9, 0.22);
        for (const z of [-1.93, 1.93]) s.add('box', C.timber, 0, 3.12, z, 4.3, 0.2, 0.1).add('box', C.timber, 0, 1.95, z, 4.3, 0.13, 0.08);
        for (const x of [-1.1, 1.1]) s.add('box', C.timber, x, 1.9, 1.95, 0.12, 2.1, 0.08, 0, 0, x < 0 ? 0.5 : -0.5);
        s.add('cone4', v === 1 ? C.slate : C.thatch, 0, 4.35, 0, 6.3, 2.5, 6.3, Math.PI / 4);
        s.add('box', C.stone, 1.2, 4.9, -0.8, 0.5, 1.5, 0.5).add('box', C.door, 0, 1.2, 1.93, 0.9, 1.6, 0.1);
        return s.build();
      });
      case 'citadel': return this.cached('citadel', () => {
        const s = new Shape();
        s.add('cyl', C.stoneDark, 0, 0.22, 0, 8, 0.45, 8).add('cyl', C.stoneLight, 0, 0.7, 0, 7, 0.5, 7).add('taper', C.stone, 0, 2.6, 0, 5.4, 3.4, 5.4);
        s.add('cyl', C.stoneLight, 0, 4.4, 0, 5.6, 0.35, 5.6);
        for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; s.add('box', C.stoneLight, Math.cos(a) * 2.5, 4.85, Math.sin(a) * 2.5, 0.5, 0.55, 0.5, -a); }
        s.add('taper', C.stoneLight, 0, 6.1, 0, 2.1, 3.3, 2.1).add('cone', C.slate, 0, 8.75, 0, 2.8, 2.2, 2.8).add('cyl', C.bronze, 0, 10.2, 0, 0.32, 1.1, 0.32);
        for (const [x, z] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) s.add('cyl', C.stoneLight, x, 2.3, z, 1.2, 3.8, 1.2).add('cone', C.slate, x, 4.75, z, 1.6, 1.2, 1.6);
        s.add('box', C.dark, 0, 1.7, 2.75, 1.3, 2.1, 0.2).add('box', C.door, 0, 1.5, 2.86, 0.9, 1.5, 0.12);
        return s.build();
      });
      case 'camp': return this.cached(`camp${a.faction}`, () => {
        const canvas = a.faction === 'citadel' ? C.canvasTeal : C.canvasRed;
        return new Shape().add('cyl', C.stoneDark, 0, 0.12, 0, 5, 0.24, 5).add('cone4', canvas, 0, 1.9, 0, 4.4, 3.5, 4.4, Math.PI / 4)
          .add('box', C.trunk, 0, 2.4, 0, 0.17, 4.6, 0.17).add('box', canvas, 0.62, 4.25, 0, 1.1, 0.65, 0.08).add('box', C.dark, 0, 0.75, 1.55, 0.8, 1.3, 0.12)
          .add('cyl', C.stoneDark, 2.7, 0.1, 1.5, 1, 0.2, 1).add('box', C.trunk, 2.7, 0.25, 1.5, 0.9, 0.14, 0.14, 0.6).build();
      });
      case 'tower': return this.cached(`tower${a.faction}${a.structure}`, () => {
        const wild = a.faction === 'wild';
        const s = new Shape();
        s.add('cyl', C.stoneDark, 0, 0.18, 0, 2.8, 0.35, 2.8).add('taper', wild ? C.wood : C.stone, 0, 1.95, 0, 2.1, 3.3, 2.1).add('cyl', wild ? C.woodLight : C.stoneLight, 0, 3.72, 0, 2.3, 0.3, 2.3);
        for (let i = 0; i < 6; i++) { const ang = (i / 6) * Math.PI * 2; s.add('box', wild ? C.wood : C.stoneLight, Math.cos(ang) * 1.0, 4.05, Math.sin(ang) * 1.0, 0.35, 0.4, 0.35, -ang); }
        if (a.structure === 'ward') s.add('cyl', C.bronze, 0, 4.3, 0, 0.3, 1, 0.3);
        else s.add('cone', wild ? C.canvasRed : C.slate, 0, 4.9, 0, 2.6, 1.4, 2.6);
        return s.build();
      });
      case 'barricade': return this.cached('barricade', () => {
        const s = new Shape();
        for (const x of [-0.65, 0, 0.65]) s.add('box', C.wood, x, 0.8, 0, 0.4, 1.6, 0.34, 0, 0, x * 0.2).add('cone4', C.woodLight, x, 1.78, 0, 0.42, 0.36, 0.42, Math.PI / 4);
        return s.add('box', C.timber, 0, 0.75, 0.22, 2.1, 0.18, 0.2).build();
      });
      case 'well': return this.cached('well', () => new Shape().add('cyl', C.stone, 0, 0.5, 0, 2.2, 1, 2.2).add('cyl', C.water, 0, 1.0, 0, 1.6, 0.04, 1.6)
        .add('box', C.timber, -0.9, 1.65, 0, 0.14, 2.3, 0.14).add('box', C.timber, 0.9, 1.65, 0, 0.14, 2.3, 0.14).add('box', C.timber, 0, 2.6, 0, 1.9, 0.1, 0.1)
        .add('cone4', C.roofRed, 0, 3.1, 0, 2.8, 0.8, 2.8, Math.PI / 4).build());
      case 'table': return this.cached('table', () => {
        const s = new Shape().add('box', C.wood, 0, a.surface ? a.surface - 0.04 : 0.86, 0, 1.5, 0.08, 1.1);
        for (const x of [-0.65, 0.65]) for (const z of [-0.45, 0.45]) s.add('box', C.timber, x, 0.43, z, 0.09, 0.84, 0.09);
        return s.build();
      });
      case 'stall': return this.cached('stall', () => {
        const s = new Shape().add('box', C.woodLight, 0, 0.91, 0, 1.8, 0.08, 1.3);
        for (const x of [-0.82, 0.82]) for (const z of [-0.58, 0.58]) s.add('box', C.timber, x, z < 0 ? 1.15 : 1.0, z, 0.1, z < 0 ? 2.3 : 2.0, 0.1);
        s.add('box', C.canvasTeal, 0, 2.2, 0, 2.1, 0.05, 1.6, 0, 0.2).add('box', '#d8cdb2', 0, 2.17, 0.4, 2.1, 0.05, 0.3, 0, 0.2);
        return s.build();
      });
      case 'pillar': return this.cached('pillar', () => new Shape().add('box', C.timber, 0, 1.65, 0, 0.28, 3.3, 0.28).build());
      case 'roof': return this.cached('roof', () => new Shape().add('cone4', C.thatch, 0, 4.15, 0, 8.6, 1.8, 8.6, Math.PI / 4)
        .add('box', C.timber, 0, 3.28, -2.2, 6, 0.18, 0.18).add('box', C.timber, 0, 3.28, 2.2, 6, 0.18, 0.18)
        .add('box', C.timber, -2.6, 3.28, 0, 0.18, 0.18, 5).add('box', C.timber, 2.6, 3.28, 0, 0.18, 0.18, 5).build());
      case 'ruin': return this.cached(`ruin${v}`, () => {
        const s = new Shape().add('box', C.stone, 0, 0.9, 0, 2.2 * (a.radius / 1.1), 1.8, 0.6, v * 0.9).add('box', C.stoneLight, 0.4, 2.0, 0, 1.0, 0.5, 0.55, v * 0.9);
        return s.add('dodec', C.stoneDark, 0.8, 0.25, 0.6, 0.7, 0.5, 0.6).add('dodec', C.stone, -0.7, 0.2, 0.5, 0.5, 0.4, 0.5).build();
      });
      case 'post': return this.cached('post', () => {
        const s = new Shape();
        for (const x of [-0.6, 0.6]) for (const z of [-0.6, 0.6]) s.add('box', C.timber, x, 1.7, z, 0.18, 3.4, 0.18);
        s.add('box', C.woodLight, 0, 3.4, 0, 1.7, 0.15, 1.7).add('box', C.timber, 0, 3.85, 0.8, 1.7, 0.1, 0.08).add('box', C.timber, 0, 3.85, -0.8, 1.7, 0.1, 0.08);
        s.add('cone4', C.thatch, 0, 4.6, 0, 2.5, 1, 2.5, Math.PI / 4);
        for (let i = 0; i < 6; i++) s.add('box', C.wood, 0.95, 0.3 + i * 0.55, 0, 0.06, 0.06, 0.5);
        return s.build();
      });
      case 'rune': return this.cached('rune', () => new Shape().add('cyl', C.stoneDark, 0, 0.12, 0, 1.7, 0.25, 1.7).add('box', C.stone, 0, 1.4, 0, 1.1, 2.3, 0.6)
        .add('cone4', C.stoneLight, 0, 2.75, 0, 1.05, 0.45, 0.85, Math.PI / 4).build());
      case 'echo': return this.cached('echo', () => new Shape().add('cyl', C.stoneDark, 0, 0.1, 0, 1.4, 0.2, 1.4).add('box', C.stoneLight, 0, 1.3, 0, 0.75, 2.4, 0.5)
        .add('box', C.stone, 0, 2.6, 0, 0.55, 0.3, 0.4).build());
      case 'note': return this.cached('note', () => new Shape().add('box', C.wood, 0, 0.55, 0, 0.08, 1.1, 0.08).add('box', '#3d4245', 0, 1.0, 0.05, 0.52, 0.36, 0.04, 0, -0.2).build());
      case 'bell': return this.cached('bell', () => new Shape().add('box', C.timber, -0.6, 1.3, 0, 0.14, 2.6, 0.14).add('box', C.timber, 0.6, 1.3, 0, 0.14, 2.6, 0.14)
        .add('box', C.timber, 0, 2.6, 0, 1.45, 0.14, 0.14).add('cone', C.bronze, 0, 2.15, 0, 0.75, 0.7, 0.75).add('cone4', C.thatch, 0, 2.95, 0, 1.9, 0.6, 1.9, Math.PI / 4).build());
      default: return this.cached('fallback', () => new Shape().add('box', C.stone, 0, 0.5, 0, 1, 1, 1).build());
    }
  }

  private itemGeometry(type: ItemType) {
    return this.cached(`item-${type}`, () => {
      const s = new Shape();
      switch (type) {
        case 'apple': s.add('ico', '#a8402f', 0, 0.11, 0, 0.22, 0.21, 0.22).add('box', C.trunk, 0, 0.23, 0, 0.02, 0.06, 0.02); break;
        case 'bread': s.add('ico', '#c28a4f', 0, 0.09, 0, 0.42, 0.2, 0.26).add('box', '#a46b38', 0, 0.17, 0, 0.3, 0.03, 0.03); break;
        case 'cheese': s.add('cyl', '#d8b85a', 0, 0.07, 0, 0.38, 0.14, 0.38); break;
        case 'book': s.add('box', '#6b3b2c', 0, 0.035, 0, 0.3, 0.07, 0.22).add('box', '#e4dac2', 0.01, 0.035, 0, 0.29, 0.05, 0.2); break;
        case 'ledger': s.add('box', '#3e2a1f', 0, 0.035, 0, 0.32, 0.07, 0.24).add('box', '#b8954f', 0.16, 0.035, 0, 0.03, 0.05, 0.08); break;
        case 'pot': s.add('taper', '#a86a43', 0, 0.15, 0, 0.42, 0.3, 0.42, 0, Math.PI).add('cyl', '#94593a', 0, 0.31, 0, 0.3, 0.05, 0.3); break;
        case 'jug': s.add('ico', '#9b8b72', 0, 0.15, 0, 0.32, 0.3, 0.32).add('cyl', '#8a7a62', 0, 0.32, 0, 0.12, 0.12, 0.12); break;
        case 'barrel': s.add('cyl', C.wood, 0, 0.47, 0, 0.84, 0.94, 0.84).add('cyl', C.iron, 0, 0.18, 0, 0.87, 0.06, 0.87).add('cyl', C.iron, 0, 0.76, 0, 0.87, 0.06, 0.87); break;
        case 'crate': s.add('box', C.woodLight, 0, 0.45, 0, 0.95, 0.9, 0.95).add('box', C.wood, 0, 0.45, 0.48, 0.97, 0.12, 0.02).add('box', C.wood, 0, 0.45, -0.48, 0.97, 0.12, 0.02).add('box', C.wood, 0.48, 0.45, 0, 0.02, 0.12, 0.97); break;
        case 'bucket': s.add('taper', C.wood, 0, 0.18, 0, 0.46, 0.36, 0.46, 0, Math.PI).add('box', C.iron, 0, 0.42, 0, 0.42, 0.03, 0.03); break;
        case 'hammer': s.add('box', C.wood, 0, 0.03, 0, 0.05, 0.05, 0.42).add('box', C.iron, 0, 0.06, 0.2, 0.18, 0.11, 0.1); break;
        case 'candle': s.add('cyl', '#e8e0c8', 0, 0.1, 0, 0.12, 0.2, 0.12).add('box', C.dark, 0, 0.22, 0, 0.01, 0.04, 0.01); break;
        case 'pouch': s.add('ico', '#7a5a3a', 0, 0.09, 0, 0.22, 0.18, 0.22).add('cyl', '#5b4028', 0, 0.18, 0, 0.08, 0.05, 0.08); break;
        case 'herb': s.add('box', '#5d8a45', 0, 0.05, 0, 0.06, 0.1, 0.22, 0.3).add('box', '#6e9a52', 0.04, 0.05, 0, 0.06, 0.1, 0.2, -0.5).add('box', '#4f7a3b', -0.04, 0.05, 0.02, 0.06, 0.12, 0.18, 1.2); break;
        case 'log': s.add('cyl', C.trunk, 0, 0.22, 0, 0.44, 0.8, 0.44, 0, 0, Math.PI / 2).add('cyl', '#c39b6a', 0.41, 0.22, 0, 0.38, 0.02, 0.38, 0, 0, Math.PI / 2); break;
        case 'stoneChunk': s.add('box', C.stone, 0, 0.2, 0, 0.5, 0.4, 0.44).add('box', C.stoneLight, 0.05, 0.4, 0, 0.42, 0.02, 0.36); break;
        case 'draught': s.add('cyl', '#7a3b46', 0, 0.09, 0, 0.16, 0.18, 0.16).add('cyl', '#7a3b46', 0, 0.2, 0, 0.06, 0.06, 0.06).add('cyl', C.woodLight, 0, 0.25, 0, 0.06, 0.04, 0.06); break;
        case 'stool': s.add('cyl', C.wood, 0, 0.43, 0, 0.5, 0.06, 0.5); for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; s.add('box', C.timber, Math.cos(a) * 0.15, 0.2, Math.sin(a) * 0.15, 0.05, 0.42, 0.05); } break;
        case 'basket': s.add('taper', '#b08a52', 0, 0.15, 0, 0.62, 0.3, 0.62, 0, Math.PI).add('cyl', '#987443', 0, 0.3, 0, 0.62, 0.03, 0.62); break;
        case 'lantern': s.add('box', C.dark, 0, 0.14, 0, 0.2, 0.28, 0.2).add('box', '#f2c66d', 0, 0.14, 0, 0.16, 0.18, 0.21).add('box', C.dark, 0, 0.32, 0, 0.1, 0.06, 0.1); break;
        case 'tomeBolt': s.add('box', '#4a3436', 0, 0.035, 0, 0.3, 0.07, 0.22).add('box', '#e4dac2', 0.01, 0.035, 0, 0.29, 0.05, 0.2).add('box', '#c7744c', 0, 0.075, 0, 0.1, 0.01, 0.1); break;
        case 'tomeMend': s.add('box', '#3d4a3a', 0, 0.035, 0, 0.3, 0.07, 0.22).add('box', '#e4dac2', 0.01, 0.035, 0, 0.29, 0.05, 0.2).add('box', '#9bb17c', 0, 0.075, 0, 0.1, 0.01, 0.1); break;
        case 'lockpicks': s.add('box', C.iron, 0, 0.02, 0.03, 0.03, 0.02, 0.24, 0, 0, 0.2).add('box', C.iron, 0.04, 0.02, -0.03, 0.03, 0.02, 0.22, 0, 0, -0.15); break;
        case 'strongbox': s.add('box', '#4c4438', 0, 0.21, 0, 0.68, 0.42, 0.52).add('box', C.iron, 0, 0.21, 0.27, 0.7, 0.44, 0.03).add('box', C.iron, 0, 0.21, -0.27, 0.7, 0.44, 0.03).add('box', C.iron, 0.34, 0.21, 0, 0.03, 0.44, 0.54).add('box', C.iron, -0.34, 0.21, 0, 0.03, 0.44, 0.54).add('box', C.bronze, 0, 0.24, 0.28, 0.12, 0.16, 0.04); break;
      }
      return s.build();
    });
  }

  private glyph(index: number, mat: THREE.Material) {
    const shape = new THREE.Shape();
    if (index === 0) {
      for (let i = 0; i < 16; i++) { const r = i % 2 ? 0.2 : 0.36, a = (i / 16) * Math.PI * 2; if (i === 0) shape.moveTo(Math.sin(a) * r, Math.cos(a) * r); else shape.lineTo(Math.sin(a) * r, Math.cos(a) * r); }
    } else if (index === 1) {
      shape.moveTo(0, -0.38); shape.quadraticCurveTo(-0.36, -0.05, 0, 0.4); shape.quadraticCurveTo(0.36, 0.0, 0, -0.38);
    } else {
      for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.14 : 0.38, a = (i / 10) * Math.PI * 2; if (i === 0) shape.moveTo(Math.sin(a) * r, Math.cos(a) * r); else shape.lineTo(Math.sin(a) * r, Math.cos(a) * r); }
    }
    const geo = this.cached(`glyph${index}`, () => new THREE.ShapeGeometry(shape));
    return new THREE.Mesh(geo, mat);
  }

  // ------------------------------------------------------------------ actors
  private rigStyle(a: Actor): RigStyle {
    if (a.kind === 'player') {
      return { coat: '#3f5650', trim: '#b89a68', skin: '#d3a585', pants: '#3a332c', hair: '#3a2a20', hood: true, cape: true, weapon: this.world.weaponLevel > 1 ? 'blade' : 'sword' };
    }
    if (a.kind === 'foe') {
      if (a.foeKind === 'brute') return { coat: '#56653a', trim: '#3e3426', skin: '#6c7c45', pants: '#3e3a2a', hair: '#3a3a22', boots: '#2a2a1e', build: 1.45, height: 1.12, weapon: 'club', eyes: '#e0b050' };
      return { coat: '#5e3530', trim: '#2e2622', skin: '#82584a', pants: '#2e2622', hair: '#1f1a16', hood: true, build: 0.85, weapon: 'blade', eyes: '#e9c46a' };
    }
    const base = STYLES[a.variant % STYLES.length];
    const weapon = a.weapon === 'fists' ? 'none' : a.weapon;
    return { coat: '#6b5a44', trim: '#c8b78f', pants: '#3e3730', hair: '#3a2a20', skin: SKINS[a.variant % SKINS.length], ...base, weapon } as RigStyle;
  }

  private createVisual(a: Actor): Visual {
    const v: Visual = { obj: new THREE.Group(), frame: 0, lx: NaN, ly: NaN, lz: NaN, lf: NaN, isStatic: false, phase: 0, yaw: a.facing };
    const humanoid = a.kind === 'player' || a.kind === 'villager' || (a.kind === 'foe' && (a.foeKind === 'brute' || a.foeKind === 'stalker'));
    if (humanoid) {
      v.rig = buildRig(this.rigStyle(a));
      v.obj = v.rig.root;
      v.weaponLevel = this.world.weaponLevel;
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(0, 1.2, 0)]);
      const shot = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#bfe3ff' }));
      shot.visible = false;
      shot.frustumCulled = false;
      v.obj.add(shot);
      v.shot = shot;
    } else if (a.kind === 'tree' || a.kind === 'ore') {
      const key = `${a.kind}${a.variant}`;
      let pool = this.pools.get(key);
      if (!pool) {
        const count = this.world.actors.filter((x) => x.kind === a.kind && x.variant === a.variant).length;
        pool = { mesh: new THREE.InstancedMesh(this.staticGeometry(a), this.vertexMat, Math.max(1, count)), next: 0 };
        pool.mesh.castShadow = a.kind === 'tree';
        pool.mesh.frustumCulled = false;
        this.pools.set(key, pool);
        this.scene.add(pool.mesh);
      }
      v.poolKey = key;
      v.poolIndex = pool.next++;
      const holder = new THREE.Group();
      if (a.kind === 'tree') {
        const stump = new THREE.Mesh(this.cached('stump', () => new Shape().add('taper', C.trunk, 0, 0.25, 0, 0.6, 0.5, 0.6).add('cyl', '#b38f62', 0, 0.51, 0, 0.5, 0.02, 0.5).build()), this.vertexMat);
        stump.visible = false;
        holder.add(stump);
        v.stump = stump;
      }
      v.obj = holder;
      v.isStatic = true;
      this.setInstance(a, v, true);
    } else if (a.kind === 'foe') {
      const g = new THREE.Group();
      const body = new THREE.Group();
      g.add(body);
      if (a.foeKind === 'slime') {
        const m = new THREE.Mesh(PRIM.ico, new THREE.MeshLambertMaterial({ color: '#76964a', flatShading: true }));
        m.scale.set(1.25, 0.95, 1.25); m.position.y = 0.48; m.castShadow = true; body.add(m);
        for (const x of [-0.18, 0.18]) { const e = new THREE.Mesh(PRIM.box, new THREE.MeshLambertMaterial({ color: '#1f2318' })); e.scale.set(0.09, 0.12, 0.03); e.position.set(x, 0.62, 0.58); body.add(e); }
      } else {
        const m = new THREE.Mesh(PRIM.octa, new THREE.MeshLambertMaterial({ color: '#8b7ea0', emissive: '#4a3f63', emissiveIntensity: 0.6, flatShading: true }));
        m.scale.set(0.9, 1.2, 0.9); m.position.y = 1.2; body.add(m);
        const core = new THREE.Mesh(PRIM.ico, this.glowMat); core.scale.setScalar(0.28); core.position.set(0, 1.2, 0.3); body.add(core);
      }
      v.body = body;
      v.obj = g;
    } else if (a.kind === 'item') {
      const m = new THREE.Mesh(this.itemGeometry(a.itemType!), this.vertexMat);
      m.castShadow = a.itemType === 'barrel' || a.itemType === 'crate';
      v.obj = m;
      v.isStatic = true;
    } else {
      const g = new THREE.Group();
      const main = new THREE.Mesh(this.staticGeometry(a), this.vertexMat);
      main.castShadow = a.kind !== 'note' && a.kind !== 'table' && a.kind !== 'roof';
      main.matrixAutoUpdate = false;
      main.updateMatrix();
      g.add(main);
      v.main = main;
      if (a.kind === 'house') {
        const w = new THREE.Mesh(this.cached('windows', () => new Shape().add('box', '#000', -1.25, 2.1, 1.94, 0.55, 0.55, 0.05).add('box', '#000', 1.25, 2.1, 1.94, 0.55, 0.55, 0.05)
          .add('box', '#000', -1.25, 2.1, -1.94, 0.55, 0.55, 0.05).add('box', '#000', 1.25, 2.1, -1.94, 0.55, 0.55, 0.05).build()), this.windowMat);
        g.add(w);
      }
      if (a.kind === 'citadel') {
        const crystal = new THREE.Mesh(PRIM.octa, this.glowMat);
        crystal.scale.set(1, 1.5, 1); crystal.position.y = 11.1;
        g.add(crystal);
        v.glow = crystal;
      }
      if (a.kind === 'tower' && a.structure === 'ward') {
        const crystal = new THREE.Mesh(PRIM.octa, this.glowMat);
        crystal.scale.set(0.8, 1.2, 0.8); crystal.position.y = 5.2;
        g.add(crystal);
        v.glow = crystal;
      }
      if (a.kind === 'tower' && a.structure !== 'ward') {
        const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 4, 0), new THREE.Vector3(0, 1, 0)]);
        const shot = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: a.faction === 'wild' ? '#f0a07c' : '#fff0c8' }));
        shot.visible = false;
        shot.frustumCulled = false;
        g.add(shot);
        v.shot = shot;
      }
      if (a.kind === 'rune' || a.kind === 'echo') {
        const glyphs: THREE.Object3D[] = [];
        for (let i = 0; i < 3; i++) {
          const gm = this.glyph(i, this.glyphMat);
          gm.position.set(0, a.kind === 'rune' ? 1.75 : 1.7, a.kind === 'rune' ? 0.305 : 0.255);
          gm.visible = a.kind === 'rune' ? i === a.currentRune : i === a.variant;
          g.add(gm);
          glyphs.push(gm);
        }
        v.glyphs = glyphs;
        if (a.kind === 'rune') {
          const carve = this.glyph(a.targetRune ?? 0, this.carveMat);
          carve.scale.setScalar(0.45);
          carve.position.set(0, 0.62, 0.305);
          g.add(carve);
        }
      }
      v.obj = g;
      v.isStatic = true;
    }
    if (v.isStatic) v.obj.matrixAutoUpdate = false;
    this.scene.add(v.obj);
    return v;
  }

  private setInstance(a: Actor, v: Visual, alive: boolean) {
    const pool = this.pools.get(v.poolKey!);
    if (!pool || v.poolIndex === undefined) return;
    tmpM.compose(
      tmpP.set(a.x, 0, a.z),
      tmpQ.setFromEuler(tmpE.set(0, a.variant * 1.7 + a.x * 0.13, 0)),
      tmpS.setScalar(alive ? 1 : 0.0001),
    );
    pool.mesh.setMatrixAt(v.poolIndex, tmpM);
    pool.mesh.instanceMatrix.needsUpdate = true;
    v.poolAlive = alive;
  }

  private animFor(a: Actor): AnimState {
    if (a.hp <= 0 && (a.kind === 'player' || a.kind === 'foe')) return 'dead';
    if (a.action) return ACTION_ANIM[a.action];
    const speed = Math.hypot(a.vx, a.vz);
    if (a.kind === 'player') {
      if (a.sittingOn) return 'sit';
      if (a.y > 0.05) return a.vy > 0 ? 'jump' : 'fall';
      if (this.world.held()) return speed > 0.4 ? 'carryWalk' : 'carry';
      if (a.sneaking && speed > 0.3) return 'sneak';
      return speed > 5.4 ? 'run' : speed > 0.3 ? 'walk' : 'idle';
    }
    if (a.kind === 'villager') {
      if (a.activity === 'Sitting') return 'sit';
      if (a.activity === 'Sneaking') return speed > 0.3 ? 'sneak' : 'idle';
      if (speed > 0.3) return speed > 3 ? 'run' : 'walk';
      switch (a.activity) {
        case 'Chopping': return 'gather';
        case 'Masonry': case 'Smithing': case 'Baking': return 'work';
        case 'Tending fields': case 'Gardening': case 'Gathering herbs': case 'Foraging': return 'tend';
        case 'Conversing': case 'Talking': case 'Minding the stall': return 'talk';
        case 'Studying': case 'Eating': return 'sit';
        default: return 'idle';
      }
    }
    return speed > 2.9 ? 'run' : speed > 0.3 ? 'walk' : 'idle';
  }

  private sync(dt: number, focus: THREE.Vector3) {
    const frame = ++this.frame;
    const t = this.time;
    const far2 = 95 * 95;
    for (const a of this.world.actors) {
      let v = this.visuals.get(a.id);
      if (v && v.rig && a.kind === 'player' && v.weaponLevel !== this.world.weaponLevel) { this.scene.remove(v.obj); this.visuals.delete(a.id); v = undefined; }
      if (!v) { v = this.createVisual(a); this.visuals.set(a.id, v); }
      v.frame = frame;
      const dx = a.x - focus.x, dz = a.z - focus.z;
      const inRange = dx * dx + dz * dz < far2;
      if (a.kind === 'tree' || a.kind === 'ore') {
        v.obj.visible = inRange;
        if (v.stump) { v.stump.visible = !a.alive && inRange; v.obj.position.set(a.x, 0, a.z); v.obj.updateMatrix(); }
        if (v.poolAlive !== a.alive) this.setInstance(a, v, a.alive);
      } else v.obj.visible = inRange && a.alive && !(a.kind === 'villager' && a.activity === 'Sleeping') && a.kind !== 'player' ? true : a.kind === 'player';
      if (a.kind === 'foe' && a.hp <= 0) v.obj.visible = false;
      if (!v.obj.visible) continue;

      if (v.isStatic) {
        const shaking = a.struckAt !== undefined && this.world.elapsed - a.struckAt < 0.35;
        if (a.x !== v.lx || a.y !== v.ly || a.z !== v.lz || a.facing !== v.lf || shaking || v.shook) {
          v.shook = shaking;
          v.obj.position.set(a.x, a.y, a.z);
          v.obj.rotation.set(0, a.kind === 'item' ? a.facing : 0, shaking ? Math.sin(this.world.elapsed * 60) * 0.03 : 0);
          v.obj.updateMatrix();
          v.lx = a.x; v.ly = a.y; v.lz = a.z; v.lf = a.facing;
        }
        if (v.glyphs) {
          if (a.kind === 'rune') v.glyphs.forEach((g, i) => { g.visible = i === a.currentRune; });
          const ring = a.struckAt !== undefined && this.world.elapsed - a.struckAt < 1.2 ? 1 + (1.2 - (this.world.elapsed - a.struckAt)) * 0.25 : 1;
          const solved = a.kind === 'rune' ? a.currentRune === a.targetRune : this.world.echoSolved;
          v.glyphs.forEach((g) => g.scale.setScalar(ring * (solved ? 1.1 : 0.9)));
          v.obj.updateMatrixWorld(true);
        }
        if (v.glow) { v.glow.rotation.y = this.world.elapsed * 0.6; v.glow.position.y = (a.kind === 'citadel' ? 11.1 : 5.2) + Math.sin(this.world.elapsed * 1.5) * 0.1; v.obj.updateMatrixWorld(true); }
        if (v.shot) {
          const vis = a.shotAt !== undefined && this.world.elapsed - a.shotAt < 0.14;
          v.shot.visible = vis;
          if (vis) {
            const pos = v.shot.geometry.attributes.position as THREE.BufferAttribute;
            pos.setXYZ(1, (a.shotX ?? a.x) - a.x, 1.1, (a.shotZ ?? a.z) - a.z);
            pos.needsUpdate = true;
          }
          v.obj.updateMatrixWorld(true);
        }
        continue;
      }

      // Characters
      const speed = Math.hypot(a.vx, a.vz);
      v.yaw += angleDelta(v.yaw, a.facing) * Math.min(1, dt * 14);
      v.obj.position.set(a.x, a.y, a.z);
      v.obj.rotation.y = v.yaw;
      v.phase += speed * dt * 2.3;
      if (v.shot && !v.isStatic) {
        const vis = a.shotAt !== undefined && this.world.elapsed - a.shotAt < 0.18;
        v.shot.visible = vis;
        if (vis) {
          const pos = v.shot.geometry.attributes.position as THREE.BufferAttribute;
          pos.setXYZ(1, (a.shotX ?? a.x) - a.x, 1.2, (a.shotZ ?? a.z) - a.z);
          pos.needsUpdate = true;
        }
      }
      if (v.rig) {
        const state = this.animFor(a);
        const dist2 = dx * dx + dz * dz;
        if (dist2 < 3600 || (frame + a.variant) % 3 === 0) animateRig(v.rig, state, t + a.variant * 1.7, dt, { phase: v.phase, actionT: a.action ? a.actionT ?? 0 : 0, speed });
        if (a.lookAt && state !== 'sleep') {
          const target = this.world.byId(a.lookAt);
          if (target) {
            const rel = angleDelta(v.yaw, Math.atan2(target.x - a.x, target.z - a.z));
            v.rig.bones.head.rotation.y += Math.max(-1, Math.min(1, rel)) * 0.8;
          }
        }
      } else if (v.body) {
        const state = this.animFor(a);
        if (a.foeKind === 'slime') {
          const hop = speed > 0.3 ? Math.abs(Math.sin(v.phase * 1.5)) : 0;
          const squash = state === 'windup' ? 0.7 : state === 'strike' ? 1.25 : 1 + Math.sin(t * 5 + a.variant) * 0.05;
          v.body.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
          v.body.position.set(0, hop * 0.35, state === 'strike' ? 0.4 : 0);
        } else {
          v.body.position.y = Math.sin(t * 2.4 + a.variant) * 0.15;
          v.body.rotation.y = t * 1.5;
        }
      }
    }
    for (const [id, v] of this.visuals) if (v.frame !== frame) { this.scene.remove(v.obj); this.visuals.delete(id); }
  }

  // ------------------------------------------------------------------ camera
  resize() {
    const canvas = this.renderer.domElement;
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }
  orbit(dx: number, dy: number) {
    this.yaw -= dx * 0.0026;
    this.pitch = Math.max(0.05, Math.min(1.15, this.pitch + dy * 0.002));
  }
  zoom(delta: number) { this.distance = Math.max(3.2, Math.min(14, this.distance + delta)); }
  /** Camera-relative ground directions for movement input. */
  forward() { return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) }; }
  heading() { return Math.atan2(-Math.sin(this.yaw), -Math.cos(this.yaw)); }
  skipIntro() { this.introTime = this.introDuration; }
  startIntro() { this.introTime = 0; this.mode = 'intro'; }

  setGhost(kind: StructureKind | null, point: Point | null, valid: boolean) {
    if (!kind || !point) { if (this.ghost) this.ghost.visible = false; return; }
    if (!this.ghost || this.ghostKind !== kind) {
      if (this.ghost) this.scene.remove(this.ghost);
      const fake = { kind: kind === 'barricade' ? 'barricade' : kind === 'outpost' ? 'camp' : 'tower', faction: 'citadel', structure: kind, variant: 0, radius: BUILDINGS[kind].radius } as Actor;
      this.ghost = new THREE.Mesh(this.staticGeometry(fake), this.ghostOk);
      this.ghostKind = kind;
      this.scene.add(this.ghost);
    }
    this.ghost.visible = true;
    this.ghost.material = valid ? this.ghostOk : this.ghostBad;
    this.ghost.position.set(point.x, 0, point.z);
  }

  private updateCamera(dt: number, focus: THREE.Vector3) {
    const w = this.world;
    const p = w.player;
    const desiredLook = new THREE.Vector3(p.x, p.y + 1.45, p.z);
    const cp = Math.cos(this.pitch);
    const desiredPos = new THREE.Vector3(p.x + Math.sin(this.yaw) * this.distance * cp, p.y + 1.6 + Math.sin(this.pitch) * this.distance, p.z + Math.cos(this.yaw) * this.distance * cp);
    let k = 1 - Math.exp(-dt * 9);

    const event = w.cameraEvents.shift();
    if (event && this.mode === 'play') this.focusShot = { target: event.target, t: 0, duration: event.duration };

    if (this.mode === 'title') {
      const a = this.time * 0.025;
      desiredPos.set(Math.cos(a) * 46, 21, Math.sin(a) * 46 - 2);
      desiredLook.set(0, 2.5, -2);
      k = 1 - Math.exp(-dt * 2);
    } else if (this.mode === 'intro') {
      this.introTime = Math.min(this.introDuration, this.introTime + dt);
      const u = this.introTime / this.introDuration;
      const e = u * u * (3 - 2 * u);
      const a = 0.9 - e * 0.9;
      const start = new THREE.Vector3(Math.cos(a) * 40, 24, Math.sin(a) * 40 + 6);
      desiredPos.copy(start.lerp(desiredPos, e));
      desiredLook.copy(new THREE.Vector3(0, 4, -6).lerp(desiredLook, e));
      k = 1;
      if (this.introTime >= this.introDuration) this.mode = 'play';
    } else if (w.dialogue) {
      const n = w.byId(w.dialogue.npcId);
      if (n) {
        const dx = p.x - n.x, dz = p.z - n.z, d = Math.hypot(dx, dz) || 1;
        const ux = dx / d, uz = dz / d;
        desiredPos.set(p.x + ux * 2.4 - uz * 1.7, 1.75, p.z + uz * 2.4 + ux * 1.7);
        desiredLook.set(n.x * 0.8 + p.x * 0.2, 1.55, n.z * 0.8 + p.z * 0.2);
        k = 1 - Math.exp(-dt * 4);
      }
    } else if (this.focusShot) {
      const f = this.focusShot;
      f.t += dt;
      const weight = Math.sin(Math.min(1, f.t / f.duration) * Math.PI);
      desiredPos.lerp(new THREE.Vector3(f.target.x + 14, 16, f.target.z + 18), weight);
      desiredLook.lerp(new THREE.Vector3(f.target.x, 2, f.target.z), weight);
      if (f.t >= f.duration) this.focusShot = null;
    }
    this.camPos.lerp(desiredPos, k);
    this.camLook.lerp(desiredLook, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    focus.copy(this.mode === 'title' ? new THREE.Vector3(0, 0, 0) : desiredLook);
  }

  private updateLighting(focus: THREE.Vector3) {
    const h = this.world.hour();
    const day = Math.max(0, Math.min(1, Math.sin(((h - 5.5) / 14) * Math.PI)));
    const dusk = Math.max(0, 1 - Math.abs(h - 19.2) / 1.6) + Math.max(0, 1 - Math.abs(h - 6.2) / 1.3);
    this.sky.copy(this.skyNight).lerp(this.skyDay, day).lerp(this.skyDusk, Math.min(0.55, dusk * 0.55));
    (this.scene.background as THREE.Color).copy(this.sky);
    (this.scene.fog as THREE.Fog).color.copy(this.sky);
    this.sun.color.copy(this.sunNight).lerp(this.sunDay, day).lerp(this.sunDusk, Math.min(0.7, dusk * 0.7));
    this.sun.intensity = 0.35 + day * 2.1;
    this.hemi.intensity = 0.45 + day * 1.05;
    const sunAngle = ((h - 6) / 12) * Math.PI;
    const elev = Math.max(0.35, Math.sin(sunAngle));
    this.sun.position.set(focus.x - Math.cos(sunAngle) * 30, 18 + elev * 30, focus.z + 22);
    this.sun.target.position.set(focus.x, 0, focus.z);
    this.windowMat.emissiveIntensity = (1 - day) * 1.4;
    this.beacon.intensity = 10 + (1 - day) * 40;
  }

  render(dt: number) {
    this.time += dt;
    const focus = new THREE.Vector3();
    this.updateCamera(dt, focus);
    this.sync(dt, focus);
    this.updateLighting(focus);
    this.renderer.render(this.scene, this.camera);
  }

  info() { return { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles }; }

  dispose() {
    window.removeEventListener('resize', this.resizeHandler);
    this.scene.traverse((o) => {
      if (o instanceof THREE.InstancedMesh || o instanceof THREE.Line) o.geometry.dispose();
      if (o instanceof THREE.Mesh) {
        const mat = o.material as THREE.Material & { map?: THREE.Texture | null };
        if (mat.map) mat.map.dispose();
      }
    });
    for (const g of this.geometryCache.values()) g.dispose();
    this.renderer.dispose();
  }

  get playerId() { return PLAYER_ID; }
}
