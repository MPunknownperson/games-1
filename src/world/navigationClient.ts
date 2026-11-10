import { WorldNavigation } from './navigation';
import type { Actor } from './simulation';

/** Yield to the loading screen before building this small world's navigation mesh. */
export async function createBrowserNavigation(actors: Actor[]) {
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  return WorldNavigation.create(actors);
}