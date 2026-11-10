import { ITEMS, type ItemType } from './items';
import { cellKey, spaceOf, type CellEntity } from './cells';

export interface BaseObject {
  id: string;
  kind: string;
  model: string;
  weight: number;
  value: number;
}
export interface ObjectReference {
  refId: string;
  baseId: string;
  spaceId: string;
  cellId: string;
  transform: { x: number; y: number; z: number; rotation: number; scale: number };
}
export interface ChangeForm<T> {
  refId: string;
  fields?: Partial<T>;
  unset?: (keyof T)[];
  deleted?: boolean;
}

// These are shared content templates. References and saves only need their IDs.
export const BASE_OBJECTS = new Map<string, BaseObject>(
  (Object.entries(ITEMS) as [ItemType, typeof ITEMS[ItemType]][]).map(([type, item]) => [
    `item:${type}`, { id: `item:${type}`, kind: 'item', model: `procedural/items/${type}`, weight: item.mass, value: item.value },
  ]),
);

export function baseIdFor(actor: { kind: string; itemType?: ItemType; variant?: number; structure?: string; faction?: string }) {
  if (actor.itemType) return `item:${actor.itemType}`;
  return `world:${actor.kind}:${actor.variant ?? 0}:${actor.structure ?? ''}:${actor.faction ?? ''}`;
}
export function referenceFor(actor: CellEntity & { kind: string; itemType?: ItemType; variant?: number; structure?: string; faction?: string; y: number; facing: number; scale?: number }): ObjectReference {
  const baseId = baseIdFor(actor);
  if (!BASE_OBJECTS.has(baseId)) BASE_OBJECTS.set(baseId, {
    id: baseId, kind: actor.kind, model: `procedural/world/${actor.kind}`, weight: 0, value: 0,
  });
  return { refId: actor.id, baseId, spaceId: spaceOf(actor), cellId: cellKey(actor),
    transform: { x: actor.x, y: actor.y, z: actor.z, rotation: actor.facing, scale: actor.scale ?? 1 } };
}

/** Compare live references against seeded master records, including removals and moved cells. */
export function createChangeForms<T extends { id: string }>(baseline: Map<string, T>, current: T[]) {
  const changeForms: Record<string, ChangeForm<T>> = {};
  const spawned: T[] = [];
  const seen = new Set<string>();
  for (const actor of current) {
    seen.add(actor.id);
    const original = baseline.get(actor.id);
    if (!original) { spawned.push(actor); continue; }
    const fields: Partial<T> = {};
    const unset: (keyof T)[] = [];
    for (const key of new Set([...Object.keys(original), ...Object.keys(actor)] as (keyof T)[])) {
      if (JSON.stringify(original[key]) === JSON.stringify(actor[key])) continue;
      if (actor[key] === undefined) unset.push(key);
      else fields[key] = actor[key];
    }
    if (Object.keys(fields).length || unset.length) changeForms[actor.id] = { refId: actor.id, fields, unset };
  }
  for (const id of baseline.keys()) if (!seen.has(id)) changeForms[id] = { refId: id, deleted: true };
  return { changeForms, spawned };
}

export function applyChangeForms<T extends { id: string }>(actors: T[], changes: Record<string, ChangeForm<T>>, spawned: T[] = []): T[] {
  const result: T[] = [];
  for (const actor of actors) {
    const change = changes[actor.id];
    if (change?.deleted) continue;
    if (change?.fields) Object.assign(actor, change.fields);
    for (const key of change?.unset ?? []) delete actor[key];
    result.push(actor);
  }
  return result.concat(spawned);
}