import type { Point } from './simulation';

export interface WorldLocation {
  id: string;
  name: string;
  kind: 'settlement' | 'dungeon' | 'cave' | 'camp' | 'grove';
  point: Point;
  radius: number;
  difficulty: number;
}

export const WORLD_LOCATIONS: WorldLocation[] = [
  { id: 'village', name: 'First Meadow', kind: 'settlement', point: { x: 0, z: 1 }, radius: 27, difficulty: 0 },
  { id: 'old-mill-cellar', name: 'Old Mill Cellar', kind: 'dungeon', point: { x: -44, z: 33.5 }, radius: 10, difficulty: 1 },
  { id: 'hollowroot-vault', name: 'Hollowroot Vault', kind: 'cave', point: { x: 62, z: -44 }, radius: 9, difficulty: 2 },
  { id: 'sunken-watch', name: 'Sunken Watch', kind: 'dungeon', point: { x: -66, z: -51 }, radius: 10, difficulty: 3 },
  { id: 'echo-grove', name: 'Echo Grove', kind: 'grove', point: { x: 27, z: -19 }, radius: 8, difficulty: 1 },
  { id: 'southern-camp', name: 'Southern Wild Camp', kind: 'camp', point: { x: 5, z: 57 }, radius: 14, difficulty: 2 },
];

export const DUNGEON_SITES = WORLD_LOCATIONS.filter((place) => place.kind === 'dungeon' || place.kind === 'cave');
export const RADIANT_SITES = WORLD_LOCATIONS.filter((place) => place.kind === 'dungeon' || place.kind === 'cave' || place.kind === 'camp');
