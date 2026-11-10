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
  fullDetailIds: string[];
}

export interface CellJob { key: string; revision: number; refs: ArchiveRef[] }
export type CellResult =
  | { key: string; revision: number; stage: 'collision'; layer: CollisionLayer }
  | { key: string; revision: number; stage: 'visual'; layer: VisualLayer };

// The present meadow is flat. Collision remains available while visual references are prepared.
export function parseCollision(refs: ArchiveRef[]): CollisionLayer {
  const bodies: number[] = [];
  for (const ref of refs) if (ref.alive && ref.solid) bodies.push(ref.x, ref.z, ref.radius, ref.height);
  return { heights: new Float32Array(9 * 9), bodies: new Float32Array(bodies) };
}

// The renderer builds full-detail meshes; the worker only prepares a reference manifest.
export function parseVisual(refs: ArchiveRef[]): VisualLayer {
  return { fullDetailIds: refs.filter((ref) => ref.alive || ref.kind === 'tree').map((ref) => ref.id) };
}
