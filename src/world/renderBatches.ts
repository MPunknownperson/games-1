import type { Actor } from './simulation';
import { EXTERIOR_SPACE, spaceOf } from './cells';

const IMMUTABLE_STATIC = new Set<Actor['kind']>([
  'house', 'tavern', 'dungeon', 'ruin', 'pillar', 'roof', 'post', 'well', 'stall', 'table', 'bell', 'note', 'ore',
]);

/** Ore geometry is fixed until depletion; the cell batch rebuilds when a node dies. */
export function isPrecombinedStatic(actor: Actor) {
  return actor.alive && !actor.neverFade && spaceOf(actor) === EXTERIOR_SPACE && IMMUTABLE_STATIC.has(actor.kind);
}