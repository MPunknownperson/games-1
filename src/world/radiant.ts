import type { Actor, Point } from './simulation';
import type { ItemType } from './items';
import { RADIANT_SITES, type WorldLocation } from './narrative';

export type SitePhase = 'uncleared' | 'cleared' | 'occupied' | 'recovering' | 'reset';
export interface SiteState {
  phase: SitePhase;
  questId?: string;
  readyAt?: number;
  lastUsed?: number;
}

export interface LocationAlias {
  locationId: string;
  locationName: string;
  actorId: string;
  point: Point;
  kind: WorldLocation['kind'];
  difficulty: number;
}

export const RADIANT_ITEMS: ItemType[] = ['book', 'hammer', 'lantern', 'candle'];

/** Match an objective to a discovered, safe and unreserved place at acceptance time. */
export function matchLocationAliases(
  visited: string[], states: Record<string, SiteState>, actors: Actor[], origin: Point, readiness: number, sequence: number,
): LocationAlias[] {
  const options = RADIANT_SITES.flatMap((site, index) => {
    const state = states[site.id];
    if (!visited.includes(site.id) || (state?.phase !== 'cleared' && state?.phase !== 'reset')) return [];
    const anchor = actors.find((a) => a.locationId === site.id && (a.kind === 'camp' || a.kind === 'dungeon'));
    if (!anchor) return [];
    const alias: LocationAlias = {
      locationId: site.id, locationName: site.name, actorId: anchor.id, point: { ...site.point },
      kind: site.kind, difficulty: site.difficulty,
    };
    const distance = Math.hypot(origin.x - site.point.x, origin.z - site.point.z);
    const reuse = state.lastUsed === undefined ? 0 : 18;
    return [{ alias, score: Math.abs(readiness - site.difficulty) * 8 + distance * 0.07 + reuse + ((index + sequence) % RADIANT_SITES.length) * 0.12 }];
  });
  options.sort((a, b) => a.score - b.score || a.alias.locationId.localeCompare(b.alias.locationId));
  return options.map((option) => option.alias);
}