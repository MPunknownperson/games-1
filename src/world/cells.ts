export const ENGINE_UNITS_PER_CELL = 4096;
export const WORLD_UNITS_PER_CELL = 57.6;
export const uGridsToLoad = 5;
export const uExteriorCellBuffer = 36;
export const EXTERIOR_SPACE = 'exterior';

export interface CellEntity { id: string; x: number; z: number; spaceId?: string }
export type CellCoordinate = { x: number; z: number };

export const spaceOf = (entity: { spaceId?: string }) => entity.spaceId ?? EXTERIOR_SPACE;
export const sameSpace = (a: { spaceId?: string }, b: { spaceId?: string }) => spaceOf(a) === spaceOf(b);
export const exteriorCell = (point: { x: number; z: number }): CellCoordinate => ({
  x: Math.floor(point.x / WORLD_UNITS_PER_CELL), z: Math.floor(point.z / WORLD_UNITS_PER_CELL),
});
export const cellKey = (entity: CellEntity): string => {
  const space = spaceOf(entity);
  if (space !== EXTERIOR_SPACE) return space;
  const { x, z } = exteriorCell(entity);
  return `${EXTERIOR_SPACE}:${x}:${z}`;
};
export const interiorSpace = (entranceId: string) => `interior:${entranceId}`;

/** The index stores references, not cloned actors. Moving a reference only changes its cell membership. */
export class CellStream<T extends CellEntity> {
  readonly loadedCells = new Set<string>();
  readonly bufferedCells = new Set<string>();
  readonly exteriorCells = new Set<string>();
  currentSpace = EXTERIOR_SPACE;
  uGridsToLoad = uGridsToLoad;
  uExteriorCellBuffer = uExteriorCellBuffer;
  private center = '';
  private cells = new Map<string, Set<T>>();
  private memberships = new Map<string, { key: string; actor: T }>();

  reconcile(actors: T[]) {
    const seen = new Set<string>();
    for (const actor of actors) {
      seen.add(actor.id);
      const key = cellKey(actor), previous = this.memberships.get(actor.id);
      if (previous?.key === key && previous.actor === actor) continue;
      if (previous) {
        const oldCell = this.cells.get(previous.key);
        oldCell?.delete(previous.actor);
        if (oldCell?.size === 0) this.cells.delete(previous.key);
      }
      let cell = this.cells.get(key);
      if (!cell) { cell = new Set<T>(); this.cells.set(key, cell); }
      cell.add(actor);
      this.memberships.set(actor.id, { key, actor });
    }
    for (const [id, entry] of this.memberships) {
      if (seen.has(id)) continue;
      const oldCell = this.cells.get(entry.key);
      oldCell?.delete(entry.actor);
      if (oldCell?.size === 0) this.cells.delete(entry.key);
      this.memberships.delete(id);
    }
    this.exteriorCells.clear();
    for (const [key, cell] of this.cells) if (cell.size && key.startsWith(`${EXTERIOR_SPACE}:`)) this.exteriorCells.add(key);
  }

  update(position: CellEntity, grids = this.uGridsToLoad, bufferSize = this.uExteriorCellBuffer, motion: { x: number; z: number } = { x: 0, z: 0 }): boolean {
    const space = spaceOf(position);
    const width = Math.max(1, Math.min(9, Math.floor(grids) | 1));
    const bufferWidth = Math.max(width + 1, Math.ceil(Math.sqrt(Math.max(bufferSize, width * width + 1))));
    const { x, z } = exteriorCell(position);
    const spare = bufferWidth - width;
    const fractionX = position.x / WORLD_UNITS_PER_CELL - x;
    const fractionZ = position.z / WORLD_UNITS_PER_CELL - z;
    const extraNegativeX = motion.x < -0.05 && fractionX < 0.48 ? spare : motion.x > 0.05 && fractionX > 0.52 ? 0 : Math.floor(spare / 2);
    const extraNegativeZ = motion.z < -0.05 && fractionZ < 0.48 ? spare : motion.z > 0.05 && fractionZ > 0.52 ? 0 : Math.floor(spare / 2);
    const startX = x - Math.floor(width / 2) - extraNegativeX;
    const startZ = z - Math.floor(width / 2) - extraNegativeZ;
    const center = space === EXTERIOR_SPACE ? `${space}:${x}:${z}:${width}:${startX}:${startZ}:${bufferWidth}` : space;
    if (center === this.center) return false;
    this.center = center;
    this.currentSpace = space;
    this.loadedCells.clear();
    this.bufferedCells.clear();
    if (space !== EXTERIOR_SPACE) { this.loadedCells.add(space); this.bufferedCells.add(space); }
    else for (let dx = -Math.floor(width / 2); dx <= Math.floor(width / 2); dx++) {
      for (let dz = -Math.floor(width / 2); dz <= Math.floor(width / 2); dz++) {
        this.loadedCells.add(`${EXTERIOR_SPACE}:${x + dx}:${z + dz}`);
      }
    }
    if (space === EXTERIOR_SPACE) for (let dx = 0; dx < bufferWidth; dx++) {
      for (let dz = 0; dz < bufferWidth; dz++) this.bufferedCells.add(`${EXTERIOR_SPACE}:${startX + dx}:${startZ + dz}`);
    }
    return true;
  }

  isLoaded(actor: CellEntity) { return spaceOf(actor) === this.currentSpace && this.loadedCells.has(cellKey(actor)); }
  isBuffered(actor: CellEntity) { return spaceOf(actor) === this.currentSpace && this.bufferedCells.has(cellKey(actor)); }
  loadedActors(): T[] {
    const loaded: T[] = [];
    for (const key of this.loadedCells) for (const actor of this.cells.get(key) ?? []) loaded.push(actor);
    return loaded;
  }
  bufferedActors(): T[] {
    const buffered: T[] = [];
    for (const key of this.bufferedCells) for (const actor of this.cells.get(key) ?? []) buffered.push(actor);
    return buffered;
  }
  actorsInCell(key: string): T[] { return [...(this.cells.get(key) ?? [])]; }
}