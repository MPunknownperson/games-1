import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { prepareMeshBVH } from './meshAcceleration';

export const TERRAIN_LOD_LEVELS = [4, 8, 16, 32] as const;
export type TerrainLodLevel = typeof TERRAIN_LOD_LEVELS[number];
export interface TerrainTile { x: number; z: number; size: number; level: TerrainLodLevel }

const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v));

/** The playable valley stays flat for the existing collision model; only outer hills rise. */
export function terrainHeight(x: number, z: number) {
  const r = Math.hypot(x, z);
  if (r <= 105) return 0;
  const fade = clamp((r - 105) / 35, 0, 1);
  return fade * Math.max(0, 12 + 7 * Math.sin(x * 0.035) * Math.cos(z * 0.027) + 5 * Math.sin(z * 0.023));
}

export function selectTerrainTiles(_camera: { x: number; z: number }): TerrainTile[] {
  const result: TerrainTile[] = [];
  for (let x = -256; x < 256; x += 64) for (let z = -256; z < 256; z += 64) {
    result.push({ x, z, size: 64, level: 32 });
  }
  return result;
}

export function terrainTileGeometry(tile: TerrainTile): THREE.BufferGeometry {
  const corners = [
    [tile.x, tile.z], [tile.x + tile.size, tile.z], [tile.x, tile.z + tile.size], [tile.x + tile.size, tile.z + tile.size],
  ].map(([x, z]) => Math.hypot(x, z) <= 105);
  const flat = corners.every(Boolean);
  if (flat) return new THREE.BufferGeometry();
  const n = tile.level;
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const addVertex = (x: number, z: number, drop = 0) => {
    positions.push(x, terrainHeight(x, z) + 0.012 - drop, z);
    uvs.push((x + 210) / 420, (z + 210) / 420);
    return positions.length / 3 - 1;
  };
  for (let row = 0; row <= n; row++) for (let col = 0; col <= n; col++) {
    addVertex(tile.x + (col / n) * tile.size, tile.z + (row / n) * tile.size);
  }
  const at = (row: number, col: number) => row * (n + 1) + col;
  for (let row = 0; row < n; row++) for (let col = 0; col < n; col++) {
    const a = at(row, col), b = at(row, col + 1), c = at(row + 1, col), d = at(row + 1, col + 1);
    if ([a, b, c, d].every((index) => Math.hypot(positions[index * 3], positions[index * 3 + 2]) <= 105)) continue;
    indices.push(a, c, b, b, c, d);
  }
  // Matching edge heights plus skirts conceal T-junctions between coarse and fine tiles.
  const sides = [
    Array.from({ length: n + 1 }, (_, i) => at(0, i)),
    Array.from({ length: n + 1 }, (_, i) => at(n, i)),
    Array.from({ length: n + 1 }, (_, i) => at(i, 0)),
    Array.from({ length: n + 1 }, (_, i) => at(i, n)),
  ];
  for (const side of sides) {
    const skirt = side.map((index) => addVertex(positions[index * 3], positions[index * 3 + 2], 3));
    for (let i = 0; i < n; i++) indices.push(side[i], side[i + 1], skirt[i], skirt[i], side[i + 1], skirt[i + 1]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export class TerrainLod {
  readonly group = new THREE.Group();
  private current?: THREE.Group;
  private currentGeometries: THREE.BufferGeometry[] = [];
  private next = new THREE.Group();
  private nextGeometries: THREE.BufferGeometry[] = [];
  private tiles = new Map<string, THREE.BufferGeometry>();
  private pending: TerrainTile[] = [];
  private waitingGroups: TerrainTile[][] = [];
  private selected: TerrainTile[] = [];
  private signature = '';
  private material: THREE.MeshBasicMaterial;

  constructor(texture: THREE.Texture) {
    this.material = new THREE.MeshBasicMaterial({ map: texture, color: '#93a58a', side: THREE.DoubleSide, fog: true,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  }

  update(camera: { x: number; z: number }) {
    const selected = selectTerrainTiles(camera);
    const signature = selected.map((t) => `${t.x}:${t.z}:${t.size}:${t.level}`).join('|');
    if (signature !== this.signature) {
      this.signature = signature;
      this.selected = selected;
      this.pending = selected.filter((t) => !this.tiles.has(`${t.x}:${t.z}:${t.size}:${t.level}`));
      const groups = new Map<string, TerrainTile[]>();
      for (const tile of selected) {
        const key = `${Math.floor((tile.x + 256) / 128)}:${Math.floor((tile.z + 256) / 128)}`;
        const group = groups.get(key) ?? [];
        group.push(tile);
        groups.set(key, group);
      }
      this.waitingGroups = [...groups.values()];
      this.nextGeometries.forEach((g) => g.dispose());
      this.nextGeometries = [];
      this.next = new THREE.Group();
    }
    const start = performance.now();
    let built = 0;
    while (this.pending.length && built < 2 && performance.now() - start < 3) {
      const tile = this.pending.shift()!;
      this.tiles.set(`${tile.x}:${tile.z}:${tile.size}:${tile.level}`, terrainTileGeometry(tile));
      built++;
    }
    if (this.pending.length || !this.waitingGroups.length) return;
    const tiles = this.waitingGroups.shift()!;
    if (tiles.length) {
      const parts = tiles.map((tile) => this.tiles.get(`${tile.x}:${tile.z}:${tile.size}:${tile.level}`)!)
        .filter((geometry) => !!geometry.getAttribute('position'));
      if (parts.length) {
        const geometry = mergeGeometries(parts, false);
        if (geometry) { geometry.computeBoundingSphere(); prepareMeshBVH(geometry); this.nextGeometries.push(geometry); this.next.add(new THREE.Mesh(geometry, this.material)); }
      }
    }
    if (this.waitingGroups.length) return;
    if (this.current) this.group.remove(this.current);
    this.currentGeometries.forEach((g) => g.dispose());
    this.currentGeometries = this.nextGeometries;
    this.nextGeometries = [];
    this.current = this.next;
    this.group.add(this.current);
  }

  get tileCount() { return this.selected.length; }
  get drawCalls() { return this.current?.children.length ?? 0; }
  get bvhCount() { return this.currentGeometries.filter((geometry) => !!geometry.boundsTree).length; }
  get ready() { return !!this.current; }

  setTexture(texture: THREE.Texture) {
    this.material.map = texture;
    this.material.needsUpdate = true;
  }

  dispose() {
    this.currentGeometries.forEach((g) => g.dispose());
    this.nextGeometries.forEach((g) => g.dispose());
    for (const geometry of this.tiles.values()) geometry.dispose();
    this.material.dispose();
  }
}