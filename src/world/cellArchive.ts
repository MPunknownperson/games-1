export interface ArchiveRef {
  id: string;
  kind: string;
  x: number;
  z: number;
  radius: number;
  height: number;
  solid: boolean;
  alive: boolean;
  neverFade?: boolean;
}

export interface CollisionLayer {
  heights: Float32Array;
  bodies: Float32Array;
}

export interface VisualLayer {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  treePositions: Float32Array;
  treeUvs: Float32Array;
  treeColors: Float32Array;
  textureKey: string;
}

export interface CellJob { key: string; revision: number; refs: ArchiveRef[] }
export type CellResult =
  | { key: string; revision: number; stage: 'collision'; layer: CollisionLayer }
  | { key: string; revision: number; stage: 'visual'; layer: VisualLayer };

// The present meadow is flat. This independent heightfield remains ready even if a model is not.
export function parseCollision(refs: ArchiveRef[]): CollisionLayer {
  const bodies: number[] = [];
  for (const ref of refs) if (ref.alive && ref.solid) bodies.push(ref.x, ref.z, ref.radius, ref.height);
  return { heights: new Float32Array(9 * 9), bodies: new Float32Array(bodies) };
}

export function parseVisual(refs: ArchiveRef[]): VisualLayer {
  const positions: number[] = [], normals: number[] = [], colors: number[] = [];
  const treePositions: number[] = [], treeUvs: number[] = [], treeColors: number[] = [];
  const color = (hex: string) => {
    const n = Number.parseInt(hex.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
      .map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  };
  const tri = (a: number[], b: number[], c: number[], tint: string) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz) || 1;
    const rgb = color(tint);
    for (const p of [a, b, c]) { positions.push(...p); normals.push(nx / length, ny / length, nz / length); colors.push(...rgb); }
  };
  const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, tint: string) => {
    const x0 = x - sx / 2, x1 = x + sx / 2, y0 = y - sy / 2, y1 = y + sy / 2, z0 = z - sz / 2, z1 = z + sz / 2;
    const faces = [
      [[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]],
      [[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]],
      [[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]],
      [[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]],
      [[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]],
      [[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]],
    ];
    for (const [a,b,c,d] of faces) { tri(a,b,c,tint); tri(a,c,d,tint); }
  };
  const pyramid = (x: number, y: number, z: number, width: number, height: number, tint: string) => {
    const r = width / 2, bottom = y - height / 2, top = [x, y + height / 2, z];
    const corners = [[x-r,bottom,z-r],[x+r,bottom,z-r],[x+r,bottom,z+r],[x-r,bottom,z+r]];
    for (let i = 0; i < 4; i++) tri(corners[i], corners[(i+1)%4], top, tint);
    tri(corners[0],corners[2],corners[1],tint); tri(corners[0],corners[3],corners[2],tint);
  };
  const treeQuad = (x: number, z: number, width: number, height: number, axis: 'x' | 'z', tint: number[]) => {
    const half = width / 2;
    const points = axis === 'x'
      ? [[x-half,0,z],[x+half,0,z],[x+half,height,z],[x-half,height,z]]
      : [[x,0,z-half],[x,0,z+half],[x,height,z+half],[x,height,z-half]];
    const uv = [[0,0],[1,0],[1,1],[0,1]];
    for (const i of [0,1,2,0,2,3]) { treePositions.push(...points[i]); treeUvs.push(...uv[i]); treeColors.push(...tint); }
  };
  for (const ref of refs) {
    if (!ref.alive || ref.neverFade) continue;
    const { x, z } = ref;
    switch (ref.kind) {
      case 'tree': {
        const tint = ref.id.length % 2 ? [0.83, 0.96, 0.8] : [1, 1, 1];
        treeQuad(x, z, 2.8, 5.4, 'x', tint); treeQuad(x, z, 2.8, 5.4, 'z', tint);
        break;
      }
      case 'ore': box(x, 0.55, z, 1.6, 1.1, 1.6, '#848980'); break;
      case 'house': case 'tavern':
        box(x, 1.7, z, 4.3, 3.4, 4.1, '#b1a58d'); pyramid(x, 4, z, 5.7, 1.6, '#6e6860'); break;
      case 'camp': pyramid(x, 1.5, z, 3.1, 3, '#886c4c'); break;
      case 'citadel': box(x, 4.5, z, 4, 9, 4, '#8b8b80'); break;
      case 'tower': box(x, 2.5, z, 2.5, 5, 2.5, '#8b8b80'); break;
      case 'dungeon': case 'ruin': box(x, 1.25, z, 2.5, 2.5, 2.5, '#8b8b80'); break;
    }
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), colors: new Float32Array(colors),
    treePositions: new Float32Array(treePositions), treeUvs: new Float32Array(treeUvs), treeColors: new Float32Array(treeColors),
    textureKey: 'meadow-tree-atlas' };
}