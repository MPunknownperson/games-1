// Three.js presentation of the simulation. Stable props bake into cell meshes, trees use
// full-detail instancing, and characters use skeletal rigs.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { animateRig, buildRig, disposeRig, lambert, type AnimState, type Rig, type RigStyle } from './rig';
import { BUILDINGS, PLAYER_ID, type Actor, type ActionKind, type Point, type SandboxWorld, type StructureKind } from './simulation';
import { ITEMS, type ItemType } from './items';
import { EXTERIOR_SPACE, WORLD_UNITS_PER_CELL, cellKey, spaceOf } from './cells';
import { CellPreloader } from './preloader';
import { isPrecombinedStatic } from './renderBatches';
import { TerrainLod } from './terrainLod';
import { WaterLod } from './waterLod';
import { CompressedTexturePack, TEXTURE_NAMES } from './compressedTextures';
import { createBrowserNavigation } from './navigationClient';
import { prepareMeshBVH } from './meshAcceleration';
import type { PhysicsBackend, RagdollPartName } from './physics';
import { attackTiming, choreographyStatus, initializeChoreography, sampleAttack, sampleCinematic } from './choreography';
import { initializeOzz, ozzStatus } from './ozz/runtime';

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
  constructor(private textured = false) {}
  add(prim: Prim, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, rx = 0, rz = 0) {
    const src = PRIM[prim];
    const g = src.index ? src.toNonIndexed() : src.clone();
    if (!this.textured) g.deleteAttribute('uv');
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
  slash?: THREE.Mesh;
  poolKey?: string; poolIndex?: number; poolAlive?: boolean;
}

interface Pool { mesh: THREE.InstancedMesh; next: number; free: number[]; active: number }
interface StaticBatch { group: THREE.Group; geometries: THREE.BufferGeometry[]; refs: number; signature: string }

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
  private preloader: CellPreloader;
  private exteriorGroup = new THREE.Group();
  private interiorGroup = new THREE.Group();
  private rooms = new Map<string, THREE.Group>();
  private staticBatches = new Map<string, StaticBatch>();
  private pendingBatchKeys: string[] = [];
  private grassCells = new Map<string, THREE.InstancedMesh>();
  private roomGeometries: THREE.BufferGeometry[] = [];
  private grassTexture?: THREE.Texture;
  private pavingTexture?: THREE.Texture;
  private terrainLod?: TerrainLod;
  private waterLod?: WaterLod;
  private texturePack?: CompressedTexturePack;
  private texturesReady = false;
  private compressedTextureCount = 0;
  private gpuCompressedTextureCount = 0;
  private disposed = false;
  private preferredPhysics: PhysicsBackend = new URLSearchParams(window.location.search).get('physics') === 'deterministic' ? 'deterministic' : 'simd';
  private readyCells = new Set<string>();
  private firstSceneReady = false;
  private contextNeedsWarmup = false;
  private readyAtFrame = -1;
  private lastSpace = EXTERIOR_SPACE;
  private visuals = new Map<string, Visual>();
  private ragdollVisuals = new Map<string, { group: THREE.Group; parts: Map<RagdollPartName, THREE.Mesh> }>();
  private pools = new Map<string, Pool>();
  private geometryCache = new Map<string, THREE.BufferGeometry>();
  private itemTextures = new Map<ItemType, THREE.Texture>();
  private itemMaterials = new Map<ItemType, THREE.MeshStandardMaterial>();
  private preferredRatio = Math.min(window.devicePixelRatio || 1, 1.25);
  private pixelRatio = Math.min(this.preferredRatio, 1);
  private pendingPixelRatio: number | null = null;
  private pendingResize = false;
  private slowFrames = 0;
  private fastFrames = 0;
  private renderFocus = new THREE.Vector3();
  private frustum = new THREE.Frustum();
  private projectionView = new THREE.Matrix4();
  private viewSphere = new THREE.Sphere();
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
  private slashMat = new THREE.MeshBasicMaterial({ color: '#f4dda0', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
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
    this.preloader = this.makePreloader();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = false;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene.background = new THREE.Color('#c4d3c9');
    this.scene.fog = new THREE.Fog('#c4d3c9', 45, 165);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.25, 230);

    this.hemi = new THREE.HemisphereLight('#e6efe2', '#5d6b52', 1.4);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff0d4', 2.4);
    this.sun.castShadow = false;
    this.sun.shadow.mapSize.set(512, 512);
    const sc = this.sun.shadow.camera;
    sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 120;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);
    this.beacon = new THREE.PointLight('#ffc670', 0, 26, 2);
    this.beacon.position.set(world.citadel.x, 11, world.citadel.z);
    this.scene.add(this.beacon);

    this.scene.add(this.exteriorGroup, this.interiorGroup);
    this.createTerrain();
    this.waterLod = new WaterLod();
    this.exteriorGroup.add(this.waterLod.group);
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('captureTextures')) {
      this.texturesReady = true;
    } else {
      try {
        this.texturePack = new CompressedTexturePack(this.renderer);
        void this.texturePack.load().then((textures) => {
          if (this.disposed) { for (const texture of textures.values()) texture.dispose(); return; }
          this.installTextures(textures);
          this.texturesReady = true;
        }).catch(() => { this.texturesReady = true; });
      } catch { this.texturesReady = true; }
    }
    this.resizeHandler = () => { this.pendingResize = true; };
    window.addEventListener('resize', this.resizeHandler);
    this.resize();
    const p = world.player;
    this.yaw = p.facing + Math.PI;
    void world.initializeNavigation(createBrowserNavigation);
    void world.initializePhysics(this.preferredPhysics);
    void initializeChoreography();
    void initializeOzz();
  }

  private makePreloader() {
    return new CellPreloader(
      (key) => this.world.streamer.actorsInCell(key).map((a) => ({
        id: a.id, kind: a.kind, x: a.x, z: a.z, radius: a.radius, height: a.height, solid: a.solid,
        alive: a.alive, neverFade: !!a.neverFade,
      })),
    );
  }

  private installTextures(textures: Map<string, THREE.Texture>) {
    const replaceMap = (previous: THREE.Texture | undefined, next: THREE.Texture) => {
      if (!previous) return;
      this.scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          const mapped = material as THREE.Material & { map?: THREE.Texture | null };
          if (mapped.map === previous) { mapped.map = next; mapped.needsUpdate = true; }
        }
      });
    };
    const grass = textures.get('grass');
    if (grass) {
      grass.colorSpace = THREE.SRGBColorSpace;
      grass.wrapS = grass.wrapT = THREE.RepeatWrapping;
      grass.repeat.set(70, 70);
      grass.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
      this.terrainLod?.setTexture(grass);
      replaceMap(this.grassTexture, grass);
      this.grassTexture?.dispose();
      this.grassTexture = grass;
    }
    const paving = textures.get('paving');
    if (paving) {
      paving.colorSpace = THREE.SRGBColorSpace;
      paving.wrapS = paving.wrapT = THREE.RepeatWrapping;
      paving.repeat.set(4, 4);
      replaceMap(this.pavingTexture, paving);
      this.pavingTexture?.dispose();
      this.pavingTexture = paving;
    }
    const water = textures.get('water-normal');
    if (water) this.waterLod?.setNormalMap(water);
    for (const type of Object.keys(ITEMS) as ItemType[]) {
      const texture = textures.get(`item-${type}`);
      if (!texture) continue;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
      const previous = this.itemTextures.get(type);
      const material = this.itemMaterials.get(type);
      if (material) { material.map = texture; material.needsUpdate = true; }
      this.itemTextures.set(type, texture);
      previous?.dispose();
    }
    this.compressedTextureCount = textures.size;
    this.gpuCompressedTextureCount = [...textures.values()].filter((texture) => texture.format !== THREE.RGBAFormat).length;
    for (const texture of textures.values()) this.renderer.initTexture(texture);
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
    this.grassTexture = grass;
    this.terrainLod = new TerrainLod(grass);
    this.exteriorGroup.add(this.terrainLod.group);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(420, 420), new THREE.MeshLambertMaterial({ map: grass }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.exteriorGroup.add(ground);

    // Worn paths between the places people actually go.
    const pathMat = new THREE.MeshLambertMaterial({ color: '#a38e69', polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
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
      this.exteriorGroup.add(strip);
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
    this.pavingTexture = pave;
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(12.5, 48), new THREE.MeshLambertMaterial({
      map: pave, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(0, 0.03, -2);
    plaza.receiveShadow = true;
    this.exteriorGroup.add(plaza);

    // Cell-sized grass batches can be unloaded independently of the low-detail ground.
    const tuftGeo = new THREE.ConeGeometry(0.09, 0.42, 3);
    tuftGeo.translate(0, 0.21, 0);
    const tuftMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    const patches = new Map<string, { matrices: THREE.Matrix4[]; colors: THREE.Color[] }>();
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    let n = 0;
    for (let i = 0; i < 6000 && n < 2600; i++) {
      const x = (rnd() - 0.5) * 175, z = (rnd() - 0.5) * 175;
      if (Math.hypot(x, z + 2) < 13.5 || (Math.abs(x - 1.5) < 3 && z > 6 && z < 70)) continue;
      const s = 0.7 + rnd() * 0.9;
      m.compose(tmpP.set(x, 0, z), tmpQ.setFromEuler(tmpE.set((rnd() - 0.5) * 0.4, rnd() * 6, (rnd() - 0.5) * 0.4)), tmpS.set(s, s * (0.8 + rnd() * 0.8), s));
      const key = cellKey({ id: `grass-${n}`, x, z });
      let patch = patches.get(key);
      if (!patch) { patch = { matrices: [], colors: [] }; patches.set(key, patch); }
      patch.matrices.push(m.clone());
      patch.colors.push(col.set(rnd() < 0.08 ? (rnd() < 0.5 ? '#d9c76a' : '#c99aa8') : rnd() < 0.5 ? '#557238' : '#6f8a45').clone());
      n++;
    }
    for (const [key, patch] of patches) {
      const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, patch.matrices.length);
      patch.matrices.forEach((matrix, i) => tufts.setMatrixAt(i, matrix));
      patch.colors.forEach((color, i) => tufts.setColorAt(i, color));
      tufts.instanceMatrix.needsUpdate = true;
      if (tufts.instanceColor) tufts.instanceColor.needsUpdate = true;
      this.exteriorGroup.add(tufts);
      this.grassCells.set(key, tufts);
    }

  }

  private createInteriorRooms(spaceId: string) {
    for (const entrance of this.world.actors) {
      if (entrance.portalTo !== spaceId || this.rooms.has(spaceId)) continue;
      const tavern = entrance.kind === 'tavern';
      const walls = tavern ? '#8a7455' : entrance.kind === 'house' ? '#a99878' : '#545852';
      const floor = tavern ? '#6c523b' : entrance.kind === 'house' ? '#795a40' : '#6a6b60';
      const shape = new Shape()
        .add('box', floor, 0, -0.13, 0, 14, 0.26, 14)
        .add('box', walls, -7, 2.2, 0, 0.35, 4.4, 14)
        .add('box', walls, 7, 2.2, 0, 0.35, 4.4, 14)
        .add('box', walls, 0, 2.2, -7, 14, 4.4, 0.35)
        .add('box', walls, 0, 2.2, 7, 14, 4.4, 0.35)
        .add('box', tavern ? '#473727' : '#414440', 0, 4.5, 0, 14.4, 0.2, 14.4)
        .add('box', tavern ? '#d2a56a' : '#a7aa94', -4.6, 3.3, -6.65, 1.2, 1.1, 0.1);
      const room = new THREE.Group();
      const geometry = shape.build();
      this.roomGeometries.push(geometry);
      const shell = new THREE.Mesh(geometry, this.vertexMat);
      shell.receiveShadow = true;
      room.add(shell);
      const light = new THREE.PointLight(tavern ? '#ffcf8e' : '#d0d3bb', tavern ? 24 : 16, 25, 1.3);
      light.position.set(0, 3.8, -1);
      room.add(light);
      room.visible = false;
      this.interiorGroup.add(room);
      this.rooms.set(entrance.portalTo, room);
    }
  }

  private removeStaticBatch(key: string) {
    const batch = this.staticBatches.get(key);
    if (!batch) return;
    batch.group.parent?.remove(batch.group);
    for (const geometry of batch.geometries) geometry.dispose();
    this.staticBatches.delete(key);
  }

  private houseWindowsGeometry() {
    return this.cached('windows', () => new Shape()
      .add('box', '#000', -1.25, 2.1, 1.94, 0.55, 0.55, 0.05)
      .add('box', '#000', 1.25, 2.1, 1.94, 0.55, 0.55, 0.05)
      .add('box', '#000', -1.25, 2.1, -1.94, 0.55, 0.55, 0.05)
      .add('box', '#000', 1.25, 2.1, -1.94, 0.55, 0.55, 0.05).build());
  }

  private actorInView(actor: Actor) {
    const height = Math.max(1, actor.height);
    this.viewSphere.center.set(actor.x, actor.y + height / 2, actor.z);
    this.viewSphere.radius = Math.max(2, actor.radius * 3, height * 0.75);
    return this.frustum.intersectsSphere(this.viewSphere);
  }

  private cellInView(key: string) {
    const [, x, z] = key.split(':');
    this.viewSphere.center.set((Number(x) + 0.5) * WORLD_UNITS_PER_CELL, 5, (Number(z) + 0.5) * WORLD_UNITS_PER_CELL);
    this.viewSphere.radius = WORLD_UNITS_PER_CELL * Math.SQRT2 / 2 + 15;
    return this.frustum.intersectsSphere(this.viewSphere);
  }

  private batchSignature(actors: Actor[]) {
    return actors.map((a) => [a.id, a.kind, a.variant, a.x, a.y, a.z, a.facing, a.scale,
      a.radius, a.surface, a.faction, a.structure, a.locationId].join(':')).sort().join('|');
  }

  /** Build changed full-detail cell batches before replacing the previous batch. */
  private bakeStaticCells(interior: boolean) {
    const cells = new Map<string, Actor[]>();
    for (const key of this.world.streamer.exteriorCells) {
      const actors = this.world.streamer.actorsInCell(key).filter(isPrecombinedStatic);
      if (actors.length) cells.set(key, actors);
    }
    for (const key of this.staticBatches.keys()) if (!cells.has(key)) this.removeStaticBatch(key);
    this.pendingBatchKeys = [...cells.keys()].filter((key) =>
      this.staticBatches.get(key)?.signature !== this.batchSignature(cells.get(key)!));
    const priority = (key: string) => {
      const [, x, z] = key.split(':');
      const dx = (Number(x) + 0.5) * WORLD_UNITS_PER_CELL - this.camera.position.x;
      const dz = (Number(z) + 0.5) * WORLD_UNITS_PER_CELL - this.camera.position.z;
      return (!interior && this.cellInView(key) ? -1e9 : 0) + dx * dx + dz * dz;
    };
    this.pendingBatchKeys.sort((a, b) => priority(a) - priority(b));
    let built = 0;
    while (this.pendingBatchKeys.length) {
      const key = this.pendingBatchKeys[0];
      const urgent = this.firstSceneReady && !interior && this.cellInView(key);
      if (built && !urgent) break;
      this.pendingBatchKeys.shift();
      const actors = cells.get(key)!;
      this.bakeStaticCell(key, actors, this.batchSignature(actors));
      built++;
    }
  }

  private bakeStaticCell(key: string, actors: Actor[], signature: string) {
    const parts: THREE.BufferGeometry[] = [], windows: THREE.BufferGeometry[] = [];
    for (const actor of actors) {
      // Geometry construction uses the shared transform scratch matrix, so resolve it first.
      const body = this.staticGeometry(actor);
      const houseWindows = actor.kind === 'house' ? this.houseWindowsGeometry() : undefined;
      tmpM.compose(tmpP.set(actor.x, actor.y, actor.z), tmpQ.setFromEuler(tmpE.set(0, actor.facing, 0)),
        tmpS.setScalar(actor.scale ?? 1));
      parts.push(body.clone().applyMatrix4(tmpM));
      if (houseWindows) windows.push(houseWindows.clone().applyMatrix4(tmpM));
    }
    const group = new THREE.Group();
    const geometries: THREE.BufferGeometry[] = [];
    const attach = (source: THREE.BufferGeometry[], material: THREE.Material) => {
      if (!source.length) return;
      const merged = mergeGeometries(source, false);
      if (merged) {
        source.forEach((g) => g.dispose());
        merged.computeBoundingSphere();
        prepareMeshBVH(merged);
        geometries.push(merged);
        group.add(new THREE.Mesh(merged, material));
      } else for (const g of source) { geometries.push(g); group.add(new THREE.Mesh(g, material)); }
    };
    attach(parts, this.vertexMat);
    attach(windows, this.windowMat);
    this.removeStaticBatch(key);
    this.exteriorGroup.add(group);
    this.staticBatches.set(key, { group, geometries, refs: actors.length, signature });
  }

  // ------------------------------------------------------------------ geometry
  private cached(key: string, make: () => THREE.BufferGeometry) {
    let g = this.geometryCache.get(key);
    if (!g) { g = prepareMeshBVH(make()); this.geometryCache.set(key, g); }
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
      case 'tavern': return this.cached('tavern', () => {
        const s = new Shape();
        s.add('box', C.stoneDark, 0, 0.18, 0, 4.9, 0.35, 4.2).add('box', C.plaster, 0, 1.75, 0, 4.1, 2.7, 3.5)
          .add('box', C.timber, -2.05, 1.75, 0, 0.2, 2.9, 3.6).add('box', C.timber, 2.05, 1.75, 0, 0.2, 2.9, 3.6)
          .add('box', C.timber, 0, 3.1, 0, 4.2, 0.2, 3.6).add('box', C.timber, 0, 1.65, 0, 4.2, 0.13, 3.6);
        s.add('cone4', C.roofRed, 0, 4.35, 0, 5.8, 2.1, 5.2, Math.PI / 4)
          .add('box', C.door, 0, 1.25, 1.79, 1.0, 2.3, 0.1).add('box', C.bronze, 0.32, 1.25, 1.86, 0.08, 0.08, 0.05)
          .add('box', C.stone, 1.25, 4.2, 0.2, 0.45, 1.35, 0.45);
        s.add('box', C.timber, -2.25, 3.25, 1.6, 0.12, 1.4, 0.12)
          .add('box', '#d8cdb2', -2.25, 3.75, 1.7, 1.1, 0.6, 0.06, 0.08)
          .add('cyl', C.bronze, -2.25, 3.88, 1.75, 0.24, 0.08, 0.24, 0, Math.PI / 2);
        return s.build();
      });
      case 'dungeon': return this.cached(`dungeon-${a.locationId ?? 'unknown'}`, () => new Shape()
        .add('box', '#161713', 0, 1.25, 0.08, 1.28, 2.3, 0.12)
        .add('box', C.stoneDark, -0.92, 1.25, 0, 0.68, 2.8, 1.1)
        .add('box', C.stone, 0.92, 1.25, 0, 0.68, 2.8, 1.1)
        .add('box', C.stoneLight, 0, 2.72, 0, 2.5, 0.65, 1.15)
        .add('dodec', C.stone, -1.08, 3.02, 0, 0.85, 0.7, 1.0, 0.3)
        .add('dodec', C.stoneLight, 0.84, 3.03, 0.1, 0.9, 0.76, 1.0, 1.1)
        .add('dodec', C.stoneDark, -1.35, 0.32, 0.2, 0.75, 0.55, 0.9, 0.7)
        .add('dodec', C.stone, 1.3, 0.28, 0.1, 0.8, 0.5, 0.9, 1.7)
        .add('box', C.wood, 0, 0.28, 0.03, 0.1, 0.5, 0.1).build());
      case 'portal': return this.cached('interior-portal', () => new Shape()
        .add('box', C.timber, -0.72, 1.4, 0, 0.18, 2.8, 0.22)
        .add('box', C.timber, 0.72, 1.4, 0, 0.18, 2.8, 0.22)
        .add('box', C.woodLight, 0, 2.85, 0, 1.65, 0.18, 0.22)
        .add('box', C.woodLight, 0, 0.08, 0, 1.65, 0.16, 0.28).build());
      case 'counter': return this.cached('interior-counter', () => new Shape()
        .add('box', C.wood, 0, 0.6, 0, 3.5, 1.2, 1.2)
        .add('box', C.woodLight, 0, 1.24, 0, 3.7, 0.12, 1.4)
        .add('box', C.bronze, -0.8, 1.35, 0, 0.24, 0.2, 0.24).build());
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

  private itemTexture(type: ItemType) {
    let texture = this.itemTextures.get(type);
    if (texture) return texture;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 128, 128);
    let seed = [...type].reduce((n, ch) => (n * 33 + ch.charCodeAt(0)) | 0, 19) >>> 0;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 850; i++) {
      const shade = random() > 0.5 ? '35,25,15' : '255,255,255';
      ctx.fillStyle = `rgba(${shade},${0.025 + random() * 0.09})`;
      ctx.fillRect(random() * 128, random() * 128, 1 + random() * 2, 1 + random() * 2);
    }
    if (['barrel', 'crate', 'log', 'stool', 'basket', 'bucket', 'pot'].includes(type)) {
      ctx.strokeStyle = 'rgba(74,43,24,0.15)'; ctx.lineWidth = 2;
      for (let y = 8; y < 128; y += 13) { ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(36, y - 3, 82, y + 3, 128, y - 1); ctx.stroke(); }
    } else if (['book', 'ledger', 'tomeBolt', 'tomeMend', 'mercenaryWrit', 'familyLocket'].includes(type)) {
      ctx.strokeStyle = 'rgba(76,54,35,0.16)'; ctx.lineWidth = 1;
      for (let y = 20; y < 116; y += 12) { ctx.beginPath(); ctx.moveTo(18, y); ctx.lineTo(108, y + 1); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(166,123,62,0.22)'; ctx.lineWidth = 3; ctx.strokeRect(8, 8, 112, 112);
    } else if (['hammer', 'lockpicks', 'strongbox', 'lantern'].includes(type)) {
      ctx.strokeStyle = 'rgba(38,43,45,0.16)'; ctx.lineWidth = 2;
      for (let i = 0; i < 9; i++) { const x = random() * 128, y = random() * 128; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 18 + random() * 18, y - 2); ctx.stroke(); }
    }
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    this.itemTextures.set(type, texture);
    return texture;
  }

  private itemMaterial(type: ItemType) {
    let material = this.itemMaterials.get(type);
    if (!material) {
      const metal = ['hammer', 'lockpicks', 'strongbox', 'lantern', 'familyLocket'].includes(type);
      material = new THREE.MeshStandardMaterial({ map: this.itemTexture(type), vertexColors: true, flatShading: true, roughness: metal ? 0.5 : 0.86, metalness: metal ? 0.24 : 0 });
      this.itemMaterials.set(type, material);
    }
    return material;
  }

  private itemGeometry(type: ItemType) {
    return this.cached(`item-${type}`, () => {
      const s = new Shape(true);
      switch (type) {
        case 'apple':
          s.add('ico', '#a8402f', 0, 0.11, 0, 0.24, 0.22, 0.23).add('ico', '#c45038', 0.04, 0.14, 0.04, 0.14, 0.13, 0.14)
            .add('box', C.trunk, 0, 0.25, 0, 0.025, 0.08, 0.025).add('box', '#688744', 0.055, 0.28, 0, 0.1, 0.025, 0.05, 0, 0, 0.38); break;
        case 'bread':
          s.add('ico', '#c28a4f', 0, 0.09, 0, 0.42, 0.2, 0.28).add('box', '#a46b38', 0, 0.17, 0, 0.3, 0.025, 0.035)
            .add('box', '#d2a16b', 0, 0.15, 0.08, 0.29, 0.025, 0.03, 0, 0.22); break;
        case 'cheese':
          s.add('cyl', '#d8b85a', 0, 0.07, 0, 0.38, 0.14, 0.38);
          for (const [x, z, r] of [[-0.1, 0.1, 0.032], [0.11, 0.06, 0.025], [0.03, -0.12, 0.03], [-0.14, -0.04, 0.02]]) s.add('ico', '#b18e3f', x, 0.145, z, r, r, r);
          break;
        case 'book': case 'ledger': case 'tomeBolt': case 'tomeMend': {
          const cover = type === 'ledger' ? '#3e2a1f' : type === 'tomeBolt' ? '#4a3436' : type === 'tomeMend' ? '#3d4a3a' : '#6b3b2c';
          s.add('box', '#d4c9ae', 0, 0.035, 0, 0.32, 0.075, 0.24).add('box', cover, 0, 0.078, 0, 0.34, 0.026, 0.26)
            .add('box', cover, 0, -0.005, 0, 0.34, 0.02, 0.26).add('box', cover, -0.155, 0.035, 0, 0.03, 0.08, 0.26)
            .add('box', type === 'tomeMend' ? '#9bb17c' : type === 'tomeBolt' ? '#c7744c' : '#b8954f', 0, 0.095, 0, 0.12, 0.008, 0.12)
            .add('box', '#eee5d1', 0.17, 0.035, 0, 0.015, 0.08, 0.25);
          break;
        }
        case 'mercenaryWrit':
          s.add('box', '#cbbb98', 0, 0.025, 0, 0.32, 0.035, 0.25).add('box', '#dfd1ad', 0, 0.047, 0, 0.28, 0.008, 0.2)
            .add('cyl', '#3c2425', 0.08, 0.06, 0.04, 0.08, 0.025, 0.08).add('ico', '#8d3f2c', 0.08, 0.08, 0.04, 0.045, 0.03, 0.045); break;
        case 'familyLocket':
          s.add('cyl', '#b38a4d', 0, 0.08, 0, 0.2, 0.08, 0.2).add('cyl', '#e0c47b', 0, 0.125, 0, 0.16, 0.02, 0.16)
            .add('box', '#9b7542', 0, 0.145, 0, 0.07, 0.008, 0.08).add('box', '#d3b66e', 0, 0.17, 0, 0.025, 0.035, 0.025); break;
        case 'pot':
          s.add('taper', '#a86a43', 0, 0.15, 0, 0.42, 0.3, 0.42, 0, Math.PI).add('cyl', '#94593a', 0, 0.31, 0, 0.31, 0.05, 0.31)
            .add('cyl', '#c08657', 0, 0.33, 0, 0.34, 0.035, 0.34).add('cyl', '#8c5036', 0, 0.305, 0, 0.25, 0.02, 0.25); break;
        case 'jug':
          s.add('ico', '#9b8b72', 0, 0.15, 0, 0.32, 0.3, 0.32).add('cyl', '#8a7a62', 0, 0.32, 0, 0.13, 0.12, 0.13)
            .add('cyl', '#c0af91', 0, 0.39, 0, 0.16, 0.025, 0.16).add('box', '#82745f', 0.2, 0.18, 0, 0.05, 0.15, 0.055, 0, 0, 0.25); break;
        case 'barrel':
          s.add('cyl', C.wood, 0, 0.47, 0, 0.84, 0.94, 0.84).add('cyl', C.iron, 0, 0.18, 0, 0.88, 0.06, 0.88)
            .add('cyl', C.iron, 0, 0.76, 0, 0.88, 0.06, 0.88).add('cyl', '#b58a56', 0, 0.945, 0, 0.76, 0.025, 0.76);
          for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; s.add('box', '#9b7145', Math.sin(a) * 0.39, 0.46, Math.cos(a) * 0.39, 0.018, 0.72, 0.03, -a); }
          break;
        case 'crate':
          s.add('box', C.woodLight, 0, 0.45, 0, 0.95, 0.9, 0.95).add('box', C.wood, 0, 0.45, 0.48, 0.97, 0.12, 0.02)
            .add('box', C.wood, 0, 0.45, -0.48, 0.97, 0.12, 0.02).add('box', C.wood, 0.48, 0.45, 0, 0.02, 0.12, 0.97)
            .add('box', C.timber, 0, 0.45, -0.51, 0.08, 0.9, 0.025).add('box', C.timber, -0.45, 0.45, -0.51, 0.08, 0.9, 0.025)
            .add('box', '#c39b6a', 0, 0.92, 0, 0.94, 0.06, 0.94); break;
        case 'bucket':
          s.add('taper', C.wood, 0, 0.18, 0, 0.46, 0.36, 0.46, 0, Math.PI).add('cyl', C.iron, 0, 0.38, 0, 0.48, 0.035, 0.48)
            .add('box', C.iron, 0, 0.42, 0, 0.42, 0.03, 0.03).add('box', C.iron, -0.21, 0.39, 0, 0.03, 0.08, 0.03); break;
        case 'hammer':
          s.add('box', C.wood, 0, 0.03, 0, 0.055, 0.055, 0.42).add('box', C.iron, 0, 0.06, 0.2, 0.2, 0.12, 0.12)
            .add('box', '#888b89', 0, 0.065, 0.26, 0.12, 0.07, 0.018); break;
        case 'candle':
          s.add('cyl', '#e8e0c8', 0, 0.1, 0, 0.12, 0.2, 0.12).add('cyl', '#eee7d3', 0, 0.19, 0, 0.125, 0.03, 0.125)
            .add('box', C.dark, 0, 0.22, 0, 0.01, 0.04, 0.01); break;
        case 'pouch':
          s.add('ico', '#7a5a3a', 0, 0.09, 0, 0.24, 0.2, 0.23).add('cyl', '#5b4028', 0, 0.18, 0, 0.1, 0.05, 0.1)
            .add('box', '#bb9655', 0, 0.19, 0, 0.11, 0.02, 0.11); break;
        case 'herb':
          s.add('box', '#5d8a45', 0, 0.05, 0, 0.06, 0.1, 0.22, 0.3).add('box', '#6e9a52', 0.04, 0.05, 0, 0.06, 0.1, 0.2, -0.5)
            .add('box', '#4f7a3b', -0.04, 0.05, 0.02, 0.06, 0.12, 0.18, 1.2).add('box', '#9bb17c', 0, 0.02, 0, 0.025, 0.16, 0.025); break;
        case 'log':
          s.add('cyl', C.trunk, 0, 0.22, 0, 0.44, 0.8, 0.44, 0, 0, Math.PI / 2).add('cyl', '#c39b6a', 0.41, 0.22, 0, 0.38, 0.025, 0.38, 0, 0, Math.PI / 2)
            .add('cyl', '#c39b6a', -0.41, 0.22, 0, 0.38, 0.025, 0.38, 0, 0, Math.PI / 2); break;
        case 'stoneChunk':
          s.add('dodec', C.stone, 0, 0.2, 0, 0.5, 0.4, 0.44).add('box', C.stoneLight, 0.05, 0.4, 0, 0.42, 0.025, 0.36)
            .add('box', C.stoneDark, -0.08, 0.33, 0.08, 0.25, 0.025, 0.03, 0, 0.2); break;
        case 'draught':
          s.add('cyl', '#d4c5aa', 0, 0.09, 0, 0.18, 0.18, 0.18).add('cyl', '#8d3f4a', 0, 0.09, 0.01, 0.145, 0.12, 0.145)
            .add('cyl', '#8d3f4a', 0, 0.2, 0, 0.07, 0.07, 0.07).add('cyl', C.woodLight, 0, 0.25, 0, 0.07, 0.045, 0.07); break;
        case 'stool':
          s.add('cyl', C.wood, 0, 0.43, 0, 0.5, 0.07, 0.5);
          for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; s.add('box', C.timber, Math.cos(a) * 0.15, 0.2, Math.sin(a) * 0.15, 0.055, 0.42, 0.055); }
          s.add('box', C.woodLight, 0, 0.2, 0, 0.36, 0.04, 0.36); break;
        case 'basket':
          s.add('taper', '#b08a52', 0, 0.15, 0, 0.62, 0.3, 0.62, 0, Math.PI).add('cyl', '#987443', 0, 0.3, 0, 0.62, 0.035, 0.62)
            .add('cyl', '#b99158', 0, 0.32, 0, 0.55, 0.025, 0.55);
          for (let y = 0.06; y < 0.29; y += 0.07) s.add('cyl', '#c19b63', 0, y, 0, 0.59, 0.018, 0.59);
          break;
        case 'lantern':
          s.add('box', C.dark, 0, 0.14, 0, 0.22, 0.3, 0.22).add('box', '#f2c66d', 0, 0.14, 0, 0.17, 0.19, 0.17)
            .add('box', C.iron, 0, 0.14, 0.1, 0.025, 0.27, 0.025).add('box', C.iron, 0, 0.14, -0.1, 0.025, 0.27, 0.025)
            .add('box', C.dark, 0, 0.32, 0, 0.12, 0.06, 0.12).add('cyl', C.iron, 0, 0.38, 0, 0.15, 0.03, 0.15); break;
        case 'lockpicks':
          s.add('box', C.iron, 0, 0.02, 0.03, 0.03, 0.02, 0.24, 0, 0, 0.2).add('box', C.iron, 0.04, 0.02, -0.03, 0.03, 0.02, 0.22, 0, 0, -0.15)
            .add('box', C.bronze, -0.035, 0.025, 0.02, 0.015, 0.02, 0.08); break;
        case 'strongbox':
          s.add('box', '#4c4438', 0, 0.21, 0, 0.68, 0.42, 0.52).add('box', C.iron, 0, 0.21, 0.27, 0.7, 0.44, 0.03)
            .add('box', C.iron, 0, 0.21, -0.27, 0.7, 0.44, 0.03).add('box', C.iron, 0.34, 0.21, 0, 0.03, 0.44, 0.54)
            .add('box', C.iron, -0.34, 0.21, 0, 0.03, 0.44, 0.54).add('box', C.bronze, 0, 0.24, 0.28, 0.12, 0.16, 0.04);
          for (const x of [-0.28, 0.28]) for (const y of [0.06, 0.36]) s.add('cyl', '#b59a64', x, y, 0.29, 0.035, 0.035, 0.035);
          break;
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

  private roleAccessory(a: Actor) {
    if (!a.profession) return null;
    const geometry = this.cached(`role-${a.profession}`, () => {
      const s = new Shape();
      switch (a.profession) {
        case 'Keeper': s.add('octa', '#d8c582', 0, 1.55, 0.24, 0.2, 0.3, 0.08); break;
        case 'Merchant': s.add('box', '#74533b', 0.38, 0.95, -0.18, 0.42, 0.55, 0.25).add('box', '#b89559', 0.38, 1.2, 0.02, 0.22, 0.08, 0.06); break;
        case 'Warden': s.add('box', '#7b8587', 0, 1.35, 0.3, 0.54, 0.38, 0.08).add('box', '#a7aa9d', 0, 1.5, 0.36, 0.16, 0.17, 0.04); break;
        case 'Mason': s.add('box', '#a08a67', 0, 0.92, 0.27, 0.65, 0.17, 0.14).add('box', '#747675', 0.36, 0.76, 0.21, 0.1, 0.35, 0.12); break;
        case 'Woodcutter': s.add('box', '#6d4c2e', -0.45, 1.05, -0.15, 0.12, 0.7, 0.12).add('box', '#989b93', -0.45, 1.4, -0.15, 0.35, 0.14, 0.14); break;
        case 'Herbalist': s.add('box', '#607b53', -0.35, 0.88, 0, 0.35, 0.48, 0.22).add('cone4', '#86a46a', -0.35, 1.2, 0.1, 0.26, 0.36, 0.26); break;
        case 'Farmer': s.add('cyl', '#a88d51', 0, 2.04, 0, 0.55, 0.08, 0.55).add('cone4', '#a88d51', 0, 2.16, 0, 0.35, 0.22, 0.35); break;
        case 'Forager': s.add('box', '#5d6d48', 0, 1.13, -0.24, 0.55, 0.78, 0.12).add('box', '#8b7145', 0.37, 0.77, -0.15, 0.28, 0.4, 0.24); break;
        case 'Apprentice': s.add('box', '#dfd1ad', 0.3, 0.88, 0.19, 0.28, 0.34, 0.07).add('box', '#947856', 0.3, 1.04, 0.24, 0.25, 0.04, 0.03); break;
        case 'Smith': s.add('box', '#53483c', 0, 1.04, 0.27, 0.58, 0.82, 0.09).add('box', '#866d50', 0, 0.7, 0.32, 0.66, 0.12, 0.07); break;
        case 'Gardener': s.add('box', '#867553', 0.36, 0.87, -0.1, 0.38, 0.37, 0.27).add('cone4', '#5f8b4b', 0.36, 1.17, -0.1, 0.24, 0.38, 0.24); break;
        case 'Baker': s.add('box', '#ded5bb', 0, 1.03, 0.27, 0.6, 0.8, 0.05).add('cyl', '#ded5bb', 0, 2.07, 0, 0.34, 0.25, 0.34); break;
        case 'Scout': s.add('box', '#5d5037', 0.3, 1.02, -0.27, 0.26, 0.85, 0.18).add('box', '#ba9a5d', 0.3, 1.32, -0.39, 0.12, 0.42, 0.08); break;
        default: s.add('box', '#8b7859', 0, 1, -0.22, 0.42, 0.55, 0.08);
      }
      return s.build();
    });
    return new THREE.Mesh(geometry, this.vertexMat);
  }

  private createVisual(a: Actor): Visual {
    const v: Visual = { obj: new THREE.Group(), frame: 0, lx: NaN, ly: NaN, lz: NaN, lf: NaN, isStatic: false, phase: 0, yaw: a.facing };
    const humanoid = a.kind === 'player' || a.kind === 'villager' || (a.kind === 'foe' && (a.foeKind === 'brute' || a.foeKind === 'stalker'));
    if (humanoid) {
      const style = this.rigStyle(a);
      v.rig = buildRig(style);
      const accessory = this.roleAccessory(a);
      if (accessory) v.rig.root.add(accessory);
      const group = new THREE.Group();
      group.add(v.rig.root);
      if (a.kind === 'player') {
        const slash = new THREE.Mesh(this.cached('weapon-sweep', () => new THREE.RingGeometry(0.75, 1.08, 24, 1, 0.25, Math.PI * 0.75)), this.slashMat);
        slash.position.set(0, 0.95, 0.65); slash.rotation.x = -Math.PI / 2; slash.visible = false;
        group.add(slash); v.slash = slash;
      }
      v.obj = group;
      v.weaponLevel = this.world.weaponLevel;
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(0, 1.2, 0)]);
      const shot = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#bfe3ff' }));
      shot.visible = false;
      shot.frustumCulled = false;
      v.obj.add(shot);
      v.shot = shot;
    } else if ((a.kind === 'tree' || a.kind === 'ore') && spaceOf(a) === EXTERIOR_SPACE) {
      // One instanced draw per species variant and exterior cell.
      const cell = cellKey(a);
      const key = `${a.kind}${a.variant}:${cell}`;
      let pool = this.pools.get(key);
      if (!pool) {
        const count = this.world.actors.filter((x) => x.kind === a.kind && x.variant === a.variant
          && cellKey(x) === cell).length;
        pool = { mesh: new THREE.InstancedMesh(this.staticGeometry(a), this.vertexMat, Math.max(1, count)), next: 0, free: [], active: 0 };
        const [, cx, cz] = cell.split(':');
        tmpM.makeScale(0, 0, 0);
        for (let i = 0; i < pool.mesh.count; i++) pool.mesh.setMatrixAt(i, tmpM);
        pool.mesh.instanceMatrix.needsUpdate = true;
        pool.mesh.castShadow = a.kind === 'tree';
        pool.mesh.frustumCulled = true;
        pool.mesh.boundingSphere = new THREE.Sphere(
          new THREE.Vector3((Number(cx) + 0.5) * WORLD_UNITS_PER_CELL, 3, (Number(cz) + 0.5) * WORLD_UNITS_PER_CELL),
          WORLD_UNITS_PER_CELL * Math.SQRT2 / 2 + 8,
        );
        pool.mesh.visible = false;
        this.pools.set(key, pool);
        this.exteriorGroup.add(pool.mesh);
      }
      v.poolKey = key;
      if (!pool.free.length && pool.next >= pool.mesh.count) this.growPool(pool);
      v.poolIndex = pool.free.pop() ?? pool.next++;
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
      const type = a.itemType!;
      const detailed = new THREE.Mesh(this.itemGeometry(type), this.itemMaterial(type));
      detailed.castShadow = type === 'barrel' || type === 'crate' || type === 'strongbox';
      v.obj = detailed;
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
        const w = new THREE.Mesh(this.houseWindowsGeometry(), this.windowMat);
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
    (a.spaceId && a.spaceId !== EXTERIOR_SPACE ? this.interiorGroup : this.exteriorGroup).add(v.obj);
    return v;
  }

  private growPool(pool: Pool) {
    const old = pool.mesh;
    const mesh = new THREE.InstancedMesh(old.geometry, old.material, Math.max(2, old.count * 2));
    for (let i = 0; i < old.count; i++) { old.getMatrixAt(i, tmpM); mesh.setMatrixAt(i, tmpM); }
    tmpM.makeScale(0, 0, 0);
    for (let i = old.count; i < mesh.count; i++) mesh.setMatrixAt(i, tmpM);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = old.castShadow;
    mesh.frustumCulled = old.frustumCulled;
    mesh.boundingSphere = old.boundingSphere?.clone() ?? null;
    mesh.visible = old.visible;
    this.exteriorGroup.add(mesh);
    this.exteriorGroup.remove(old);
    old.dispose();
    pool.mesh = mesh;
  }

  private removeVisual(v: Visual) {
    const pool = v.poolKey ? this.pools.get(v.poolKey) : undefined;
    if (pool && v.poolIndex !== undefined) {
      if (v.poolAlive) {
        tmpM.makeScale(0, 0, 0);
        pool.mesh.setMatrixAt(v.poolIndex, tmpM);
        pool.mesh.instanceMatrix.needsUpdate = true;
        pool.active--;
        pool.mesh.visible = pool.active > 0;
      }
      pool.free.push(v.poolIndex);
    }
    if (v.shot) {
      v.shot.geometry.dispose();
      (v.shot.material as THREE.Material).dispose();
    }
    if (v.rig) { disposeRig(v.rig); v.rig.mesh.geometry.dispose(); v.rig.skeleton.dispose(); }
    v.obj.parent?.remove(v.obj);
  }

  private setInstance(a: Actor, v: Visual, alive: boolean, force = false) {
    const pool = this.pools.get(v.poolKey!);
    if (!pool || v.poolIndex === undefined || (!force && v.poolAlive === alive)) return;
    if (alive) tmpM.compose(
      tmpP.set(a.x, 0, a.z), tmpQ.setFromEuler(tmpE.set(0, a.variant * 1.7 + a.x * 0.13, 0)), tmpS.setScalar(1),
    );
    else tmpM.makeScale(0, 0, 0);
    pool.mesh.setMatrixAt(v.poolIndex, tmpM);
    pool.mesh.instanceMatrix.needsUpdate = true;
    pool.active += Number(alive) - Number(!!v.poolAlive);
    pool.mesh.visible = pool.active > 0;
    v.poolAlive = alive;
  }

  private animFor(a: Actor): AnimState {
    if (a.hp <= 0 && (a.kind === 'player' || a.kind === 'foe')) return 'dead';
    if (a.action) return ACTION_ANIM[a.action];
    const speed = Math.hypot(a.vx, a.vz);
    if (a.kind === 'player') {
      if (a.sittingOn) return 'sit';
      if (a.y > 0.05) return a.vy > 0 ? 'jump' : 'fall';
      if (a.blocking) return 'block';
      if (this.world.held()) return speed > 0.4 ? 'carryWalk' : 'carry';
      if (a.sneaking && speed > 0.3) return 'sneak';
      return speed > 5.4 ? 'run' : speed > 0.3 ? 'walk' : 'idle';
    }
    if (a.kind === 'villager') {
      if (a.capturedFor || a.activity === 'Captured') return 'captured';
      if (a.activity === 'Sitting') return 'sit';
      if (a.activity === 'Sneaking') return speed > 0.3 ? 'sneak' : 'idle';
      if (speed > 0.3) return speed > 3 ? 'run' : 'walk';
      switch (a.activity) {
        case 'Chopping': return 'gather';
        case 'Masonry': case 'Smithing': case 'Baking': case 'Forging': case 'Working for a meal': return 'work';
        case 'Tending fields': case 'Gardening': case 'Gathering herbs': case 'Foraging': case 'Looking for work': return 'tend';
        case 'Conversing': case 'Talking': case 'Minding the stall': case 'At the tavern': case 'Confronting': return 'talk';
        case 'Studying': case 'Eating': return 'sit';
        case 'Barring the door': return 'idle';
        default: return 'idle';
      }
    }
    return speed > 2.9 ? 'run' : speed > 0.3 ? 'walk' : 'idle';
  }

  private syncRagdolls() {
    const poses = this.world.ragdollPoses();
    const present = new Set(poses.map((pose) => pose.id));
    for (const [id, visual] of this.ragdollVisuals) if (!present.has(id)) {
      visual.group.parent?.remove(visual.group);
      this.ragdollVisuals.delete(id);
    }
    for (const pose of poses) {
      let visual = this.ragdollVisuals.get(pose.id);
      if (!visual) {
        const actor = this.world.byId(pose.id);
        if (!actor) continue;
        const style = this.rigStyle(actor);
        const group = new THREE.Group(), parts = new Map<RagdollPartName, THREE.Mesh>();
        for (const part of pose.parts) {
          const color = part.name === 'head' ? style.skin : part.name.endsWith('Leg') ? style.pants
            : part.name === 'creature' ? (actor.foeKind === 'slime' ? '#76964a' : '#8b7ea0') : style.coat;
          const mesh = new THREE.Mesh(PRIM.box, lambert(color));
          mesh.scale.set(...part.size);
          group.add(mesh); parts.set(part.name, mesh);
        }
        (this.world.currentSpace === EXTERIOR_SPACE ? this.exteriorGroup : this.interiorGroup).add(group);
        visual = { group, parts };
        this.ragdollVisuals.set(pose.id, visual);
      }
      for (const part of pose.parts) {
        const mesh = visual.parts.get(part.name);
        if (!mesh) continue;
        mesh.position.set(part.position.x, part.position.y, part.position.z);
        mesh.quaternion.set(part.rotation.x, part.rotation.y, part.rotation.z, part.rotation.w);
      }
    }
  }

  private sync(dt: number, focus: THREE.Vector3) {
    const frame = ++this.frame;
    const t = this.time;
    const interior = this.world.currentSpace !== EXTERIOR_SPACE;
    this.exteriorGroup.visible = !interior;
    this.interiorGroup.visible = interior;
    if (interior && !this.rooms.has(this.world.currentSpace)) this.createInteriorRooms(this.world.currentSpace);
    this.terrainLod?.update(this.world.player);
    if (!interior) {
      this.waterLod?.update(this.world.player, dt);
      this.preloader.sync(this.world.streamer.bufferedCells, this.world.streamer.loadedCells,
        this.world.renderRevision, this.world.player);
    }
    this.camera.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(this.projectionView.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse));
    const visibleActors = this.world.frustumCandidates(this.frustum);
    this.bakeStaticCells(interior);
    for (const tufts of this.grassCells.values()) tufts.visible = !interior;
    for (const [space, room] of this.rooms) room.visible = interior && space === this.world.currentSpace;

    // Physics cells are independent of drawing: keep the whole small exterior warm so
    // turning the camera or crossing a cell boundary never swaps in a proxy mesh.
    const actors = this.world.actors.filter((a) => spaceOf(a) === EXTERIOR_SPACE || spaceOf(a) === this.world.currentSpace);
    const visibleCells = new Set<string>(), visiblePools = new Set<string>();
    if (!interior) for (const actor of actors) if (visibleActors.has(actor.id) && spaceOf(actor) === EXTERIOR_SPACE) {
      if (isPrecombinedStatic(actor)) visibleCells.add(cellKey(actor));
      else if (actor.kind === 'tree' || actor.kind === 'ore') visiblePools.add(`${actor.kind}${actor.variant}:${cellKey(actor)}`);
    }
    for (const [key, batch] of this.staticBatches) batch.group.visible = !interior && visibleCells.has(key);
    const needsVisual = (a: Actor) => !isPrecombinedStatic(a) && (a.alive || a.kind === 'tree');
    const desired = new Map(actors.filter(needsVisual).map((a) => [a.id, a]));
    for (const [id, visual] of this.visuals) {
      const actor = desired.get(id);
      const poolKey = actor && `${actor.kind}${actor.variant}:${cellKey(actor)}`;
      if (!actor || (visual.poolKey && visual.poolKey !== poolKey)) {
        this.removeVisual(visual);
        this.visuals.delete(id);
      }
    }
    const missing = [...desired.values()].filter((a) => !this.visuals.has(a.id));
    const inView = new Map(missing.map((a) => [a.id, spaceOf(a) === this.world.currentSpace && (visibleActors.has(a.id) || this.actorInView(a))]));
    const priority = (a: Actor) => (inView.get(a.id) ? -1e9 : 0)
      + (a.kind === 'player' ? -100000 : a.kind === 'citadel' ? -50000 : a.kind === 'villager' ? -10000 : 0)
      + (a.x - focus.x) ** 2 + (a.z - focus.z) ** 2;
    missing.sort((a, b) => priority(a) - priority(b));
    const started = performance.now();
    let created = 0;
    for (const a of missing) {
      const urgent = this.firstSceneReady && inView.get(a.id);
      if (!urgent && (created >= 16 || (created > 0 && performance.now() - started > 4))) break;
      const v = this.createVisual(a);
      this.visuals.set(a.id, v);
      created++;
    }
    for (const a of actors) {
      const dx = a.x - focus.x, dz = a.z - focus.z;
      let v = this.visuals.get(a.id);
      if (!v) continue;
      if (v.rig && a.kind === 'player' && v.weaponLevel !== this.world.weaponLevel) {
        this.removeVisual(v);
        v = this.createVisual(a);
        this.visuals.set(a.id, v);
      }
      const parent = a.spaceId && a.spaceId !== EXTERIOR_SPACE ? this.interiorGroup : this.exteriorGroup;
      if (v.obj.parent !== parent) parent.add(v.obj);
      v.frame = frame;
      const inCurrentSpace = spaceOf(a) === this.world.currentSpace;
      if (v.poolKey) {
        v.obj.visible = inCurrentSpace;
        if (v.stump) v.stump.visible = !a.alive;
        const moved = a.x !== v.lx || a.y !== v.ly || a.z !== v.lz;
        this.setInstance(a, v, a.alive, moved);
        if (moved) {
          v.obj.position.set(a.x, a.y, a.z);
          v.obj.updateMatrix();
          v.lx = a.x; v.ly = a.y; v.lz = a.z;
        }
        continue;
      } else {
        v.obj.visible = inCurrentSpace && (a.alive || a.kind === 'player')
          && !(a.kind === 'villager' && a.activity === 'Sleeping');
      }
      if (a.kind === 'foe' && a.hp <= 0) v.obj.visible = false;
      if (a.kind === 'player' && a.hp <= 0 && this.world.hasRagdoll(a.id)) v.obj.visible = false;
      if (!v.obj.visible) continue;

      if (v.slash) {
        const action = a.action;
        const motion = action === 'attack1' || action === 'attack2' || action === 'attack3' ? sampleAttack(action, a.actionT ?? 0) : undefined;
        v.slash.visible = !!motion && motion.effect > 0.01;
        this.slashMat.opacity = motion ? Math.max(0, Math.min(0.75, motion.effect * 0.75)) : 0;
      }

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
        let lookYaw = 0;
        if (a.lookAt && state !== 'sleep') {
          const target = this.world.byId(a.lookAt);
          if (target) {
            const rel = angleDelta(v.yaw, Math.atan2(target.x - a.x, target.z - a.z));
            lookYaw = Math.max(-1, Math.min(1, rel)) * 0.8;
          }
        }
        const ground = this.world.characterGroundHeight(a.x, a.z, spaceOf(a));
        if (visibleActors.has(a.id) || dist2 < 3600 || (frame + a.variant) % 3 === 0) animateRig(v.rig, state, t + a.variant * 1.7, dt, {
          phase: v.phase, actionT: a.action ? a.actionT ?? 0 : 0, speed, lookYaw,
          grounded: ground !== null && Math.abs(a.y - ground) < 0.08 && Math.abs(a.vy) < 0.4,
          groundHeight: (x, z) => this.world.characterGroundHeight(x, z, spaceOf(a)),
        });
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
    this.syncRagdolls();
    this.readyCells.clear();
    for (const key of this.world.streamer.loadedCells) {
      const cellActors = this.world.streamer.actorsInCell(key);
      if (cellActors.every((a) => !isPrecombinedStatic(a) || (this.staticBatches.has(key) && !this.pendingBatchKeys.includes(key)))
        && cellActors.every((a) => !needsVisual(a) || this.visuals.has(a.id))) this.readyCells.add(key);
    }
    if (this.readyAtFrame < 0 && !this.pendingBatchKeys.length && this.terrainLod?.ready
      && [...desired.keys()].every((id) => this.visuals.has(id))) this.readyAtFrame = frame;
    for (const [key, pool] of this.pools) if (!pool.active && pool.free.length === pool.next) {
      this.exteriorGroup.remove(pool.mesh);
      pool.mesh.dispose();
      this.pools.delete(key);
    } else pool.mesh.visible = !interior && pool.active > 0 && visiblePools.has(key);
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
  private applyDisplayChanges() {
    if (this.pendingPixelRatio !== null) {
      this.pixelRatio = this.pendingPixelRatio;
      this.pendingPixelRatio = null;
      this.renderer.setPixelRatio(this.pixelRatio);
    }
    if (this.pendingResize) {
      this.pendingResize = false;
      this.resize();
    }
  }
  /** Keep rendering within a 30 Hz budget while simulation continues at full fidelity. */
  adaptQuality(frameMs: number) {
    if (!Number.isFinite(frameMs)) return;
    if (frameMs > 36) { this.slowFrames += frameMs > 70 ? 2 : 1; this.fastFrames = 0; }
    else if (frameMs < 23) { this.fastFrames++; this.slowFrames = 0; }
    else { this.slowFrames = 0; this.fastFrames = 0; }
    if (this.slowFrames >= 3) {
      this.slowFrames = 0;
      const current = this.pendingPixelRatio ?? this.pixelRatio;
      const next = Math.max(0.65, current * 0.8);
      if (next !== current) this.pendingPixelRatio = next;
    } else if (this.fastFrames >= 120 && (this.pendingPixelRatio ?? this.pixelRatio) < this.preferredRatio) {
      this.fastFrames = 0;
      this.pendingPixelRatio = Math.min(this.preferredRatio, (this.pendingPixelRatio ?? this.pixelRatio) + 0.1);
    }
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

  /** Swap simulations without tearing down the canvas, shaders or terrain. */
  setWorld(world: SandboxWorld) {
    this.preloader.dispose();
    this.world.disposeNavigation();
    this.world.disposePhysics();
    for (const visual of this.ragdollVisuals.values()) visual.group.parent?.remove(visual.group);
    this.ragdollVisuals.clear();
    for (const visual of this.visuals.values()) this.removeVisual(visual);
    this.visuals.clear();
    for (const pool of this.pools.values()) { this.exteriorGroup.remove(pool.mesh); pool.mesh.dispose(); }
    this.pools.clear();
    for (const key of this.staticBatches.keys()) this.removeStaticBatch(key);
    this.pendingBatchKeys.length = 0;
    for (const room of this.rooms.values()) this.interiorGroup.remove(room);
    for (const geometry of this.roomGeometries) geometry.dispose();
    this.rooms.clear(); this.roomGeometries.length = 0;
    if (this.ghost) { this.ghost.parent?.remove(this.ghost); this.ghost = null; this.ghostKind = null; }
    this.world = world;
    void world.initializeNavigation(createBrowserNavigation);
    void world.initializePhysics(this.preferredPhysics);
    this.preloader = this.makePreloader();
    this.beacon.position.set(world.citadel.x, 11, world.citadel.z);
    this.lastSpace = EXTERIOR_SPACE;
    this.readyCells.clear(); this.readyAtFrame = -1; this.firstSceneReady = false;
  }

  setGhost(kind: StructureKind | null, point: Point | null, valid: boolean) {
    if (!kind || !point) { if (this.ghost) this.ghost.visible = false; return; }
    if (!this.ghost || this.ghostKind !== kind) {
      if (this.ghost) this.ghost.parent?.remove(this.ghost);
      const fake = { kind: kind === 'barricade' ? 'barricade' : kind === 'outpost' ? 'camp' : 'tower', faction: 'citadel', structure: kind, variant: 0, radius: BUILDINGS[kind].radius } as Actor;
      this.ghost = new THREE.Mesh(this.staticGeometry(fake), this.ghostOk);
      this.ghostKind = kind;
      this.exteriorGroup.add(this.ghost);
    }
    this.ghost.visible = true;
    this.ghost.material = valid ? this.ghostOk : this.ghostBad;
    this.ghost.position.set(point.x, 0, point.z);
  }

  private updateCamera(dt: number, focus: THREE.Vector3) {
    const w = this.world;
    const p = w.player;
    const interior = w.currentSpace !== EXTERIOR_SPACE;
    const spaceChanged = w.currentSpace !== this.lastSpace;
    if (spaceChanged) {
      this.lastSpace = w.currentSpace;
      this.yaw = p.facing + (interior ? Math.PI * 0.85 : Math.PI);
      this.distance = interior ? 3.6 : 6.5;
      this.focusShot = null;
    }
    const desiredLook = new THREE.Vector3(p.x, p.y + 1.45, p.z);
    const cp = Math.cos(this.pitch);
    const desiredPos = new THREE.Vector3(p.x + Math.sin(this.yaw) * this.distance * cp, p.y + 1.6 + Math.sin(this.pitch) * this.distance, p.z + Math.cos(this.yaw) * this.distance * cp);
    let k = 1 - Math.exp(-dt * 9);
    let shake = 0;

    const event = w.cameraEvents.shift();
    if (event && this.mode === 'play' && !interior) this.focusShot = { target: event.target, t: 0, duration: event.duration };

    if (this.mode === 'title') {
      const a = this.time * 0.025;
      if (interior) { desiredPos.set(Math.cos(a) * 5, 3.1, Math.sin(a) * 5); desiredLook.set(0, 1.5, 0); }
      else { desiredPos.set(Math.cos(a) * 46, 21, Math.sin(a) * 46 - 2); desiredLook.set(0, 2.5, -2); }
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
      const shot = sampleCinematic(f.t / f.duration);
      const weight = Math.max(0, Math.min(1, shot.weight));
      desiredPos.lerp(new THREE.Vector3(f.target.x + shot.x, shot.y, f.target.z + shot.z), weight);
      desiredLook.lerp(new THREE.Vector3(f.target.x, shot.targetY, f.target.z), weight);
      shake += Math.max(0, shot.shake);
      if (f.t >= f.duration) this.focusShot = null;
    }
    if (p.action === 'attack1' || p.action === 'attack2' || p.action === 'attack3') {
      shake += sampleAttack(p.action, p.actionT ?? 0).shake * attackTiming(p.action).shakeScale;
    }
    if (spaceChanged) { this.camPos.copy(desiredPos); this.camLook.copy(desiredLook); }
    else { this.camPos.lerp(desiredPos, k); this.camLook.lerp(desiredLook, k); }
    this.camera.position.copy(this.camPos);
    this.camera.position.x += Math.sin(this.time * 43) * shake;
    this.camera.position.y += Math.cos(this.time * 37) * shake * 0.5;
    this.camera.lookAt(this.camLook);
    focus.copy(this.mode === 'title' && !interior ? new THREE.Vector3(0, 0, 0) : desiredLook);
  }

  private updateLighting(focus: THREE.Vector3) {
    if (this.world.currentSpace !== EXTERIOR_SPACE) {
      (this.scene.background as THREE.Color).set('#242720');
      (this.scene.fog as THREE.Fog).color.set('#242720');
      this.sun.intensity = 0.24;
      this.hemi.intensity = 0.9;
      this.beacon.intensity = 0;
      return;
    }
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
    this.applyDisplayChanges();
    this.time += dt;
    const focus = this.renderFocus;
    this.updateCamera(dt, focus);
    this.sync(dt, focus);
    this.updateLighting(focus);
    if (this.contextNeedsWarmup) {
      this.contextNeedsWarmup = false;
      this.warmSceneResources();
    }
    this.renderer.render(this.scene, this.camera);
    if (this.texturesReady && this.readyAtFrame >= 0 && this.frame > this.readyAtFrame) this.firstSceneReady = true;
  }

  restoreContext() {
    this.contextNeedsWarmup = true;
    this.render(0);
  }

  private warmSceneResources() {
    const states: { object: THREE.Object3D; visible: boolean; culled: boolean }[] = [];
    this.scene.traverse((object) => {
      states.push({ object, visible: object.visible, culled: object.frustumCulled });
      object.visible = true;
      object.frustumCulled = false;
    });
    const scissor = this.renderer.getScissor(new THREE.Vector4());
    const scissorTest = this.renderer.getScissorTest();
    try {
      // Upload and compile offscreen meshes while the loading backdrop still covers the canvas.
      this.renderer.setScissor(0, 0, 1, 1);
      this.renderer.setScissorTest(true);
      this.renderer.render(this.scene, this.camera);
    } finally {
      for (const state of states) {
        state.object.visible = state.visible;
        state.object.frustumCulled = state.culled;
      }
      this.renderer.setScissor(scissor);
      this.renderer.setScissorTest(scissorTest);
    }
  }

  prepareFrame() {
    if (this.firstSceneReady) return;
    this.applyDisplayChanges();
    this.mode = 'play';
    const focus = this.renderFocus;
    this.updateCamera(0.04, focus);
    this.sync(0.04, focus);
    if (!this.texturesReady || this.world.navigationStatus === 'loading' || this.world.physicsStatus === 'loading'
      || choreographyStatus === 'loading' || ozzStatus === 'loading'
      || this.readyAtFrame < 0 || this.frame <= this.readyAtFrame) return;
    this.updateLighting(focus);
    this.warmSceneResources();
    this.renderer.render(this.scene, this.camera);
    this.firstSceneReady = true;
  }

  isReady() { return this.firstSceneReady; }
  info() { return { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, pixelRatio: this.pixelRatio,
    ready: this.firstSceneReady, bufferedCells: this.preloader.bufferedCount, preparedCells: this.preloader.visualCount,
    collisionCells: this.preloader.cache.size, worker: this.preloader.usingWorker,
    precombinedCells: this.staticBatches.size, precombinedRefs: [...this.staticBatches.values()].reduce((n, batch) => n + batch.refs, 0),
    fullDetailActors: this.visuals.size, instancedCells: this.pools.size,
    bvhInstances: this.world.bvhInstances,
    bvhGeometries: [...this.geometryCache.values()].filter((geometry) => !!geometry.boundsTree).length
      + [...this.staticBatches.values()].reduce((sum, batch) => sum + batch.geometries.filter((geometry) => !!geometry.boundsTree).length, 0)
      + (this.terrainLod?.bvhCount ?? 0),
    navigation: this.world.navigationStatus, crowdAgents: this.world.navigationInfo?.agents ?? 0,
    navObstacles: this.world.navigationInfo?.obstacles ?? 0, navPathQueries: this.world.navigationInfo?.pathQueries ?? 0,
    physics: this.world.physicsStatus, physicsBackend: this.world.physicsInfo?.backend ?? 'none',
    physicsTick: this.world.physicsInfo?.tick ?? 0, ragdolls: this.world.physicsInfo?.ragdolls ?? 0,
    choreography: choreographyStatus,
    animationRuntime: ozzStatus, ozzRigs: [...this.visuals.values()].filter((visual) => !!visual.rig?.ozz).length,
    texturesReady: this.texturesReady, ktxTextures: this.compressedTextureCount, gpuCompressedTextures: this.gpuCompressedTextureCount,
    textureFallbacks: TEXTURE_NAMES.length - this.compressedTextureCount,
    terrainTiles: this.terrainLod?.tileCount ?? 0, terrainDraws: this.terrainLod?.drawCalls ?? 0,
    waterHigh: this.waterLod?.highDetailCount ?? 0, waterLow: this.waterLod?.lowDetailCount ?? 0 }; }

  dispose() {
    this.disposed = true;
    this.texturePack?.dispose();
    this.world.disposeNavigation();
    this.world.disposePhysics();
    this.preloader.dispose();
    window.removeEventListener('resize', this.resizeHandler);
    for (const visual of this.visuals.values()) this.removeVisual(visual);
    for (const pool of this.pools.values()) pool.mesh.dispose();
    for (const batch of this.staticBatches.values()) for (const geometry of batch.geometries) geometry.dispose();
    for (const geometry of this.roomGeometries) geometry.dispose();
    this.grassTexture?.dispose();
    this.terrainLod?.dispose();
    this.waterLod?.dispose();
    this.slashMat.dispose();
    const sharedItemTextures = new Set<THREE.Texture>(this.itemTextures.values());
    this.scene.traverse((o) => {
      if (o instanceof THREE.InstancedMesh || o instanceof THREE.Line) o.geometry.dispose();
      if (o instanceof THREE.Mesh) {
        const mat = o.material as THREE.Material & { map?: THREE.Texture | null };
        if (mat.map && !sharedItemTextures.has(mat.map)) mat.map.dispose();
      }
    });
    for (const g of this.geometryCache.values()) g.dispose();
    for (const material of this.itemMaterials.values()) material.dispose();
    for (const texture of this.itemTextures.values()) texture.dispose();
    this.renderer.dispose();
  }

  get playerId() { return PLAYER_ID; }
}
