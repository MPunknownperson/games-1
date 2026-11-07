/**
 * An isolated, instance-based registry of asset definitions.
 *
 * - No global singleton: each registry is independent.
 * - Stores deep copies, so callers cannot mutate registered content by reference.
 * - Listings are always sorted by asset id, so output order is deterministic.
 * - Structural checks only. Cross-asset validation is done by AssetValidator.
 */
import { ASSET_ID_PATTERN, compareStrings, type AssetCategory } from "./AssetTypes";
import { cloneDefinition, type AssetDefinition } from "./AssetDefinition";

export type RegistryErrorCode = "INVALID_ID" | "DUPLICATE_ID";

export type RegistryResult =
  | { ok: true }
  | { ok: false; code: RegistryErrorCode; message: string };

function failure(code: RegistryErrorCode, message: string): RegistryResult {
  return { ok: false, code, message };
}

export class AssetRegistry {
  private readonly assets = new Map<string, AssetDefinition>();

  /** Adds a copy of the definition. Rejects invalid or duplicate ids. */
  register(definition: AssetDefinition): RegistryResult {
    const id = definition.metadata.id;
    if (!ASSET_ID_PATTERN.test(id)) {
      return failure("INVALID_ID", `Asset id "${id}" is not a valid identifier.`);
    }
    if (this.assets.has(id)) {
      return failure("DUPLICATE_ID", `Asset id "${id}" is already registered.`);
    }
    this.assets.set(id, cloneDefinition(definition));
    return { ok: true };
  }

  /** Removes an asset. Returns true when something was removed. */
  remove(id: string): boolean {
    return this.assets.delete(id);
  }

  has(id: string): boolean {
    return this.assets.has(id);
  }

  /** Returns a copy of the asset, or undefined when the id is unknown. */
  get(id: string): AssetDefinition | undefined {
    const found = this.assets.get(id);
    return found === undefined ? undefined : cloneDefinition(found);
  }

  /** Sorted list of registered ids. */
  ids(): string[] {
    return [...this.assets.keys()].sort(compareStrings);
  }

  /** Copies of all assets, sorted by id. */
  list(): AssetDefinition[] {
    return [...this.assets.entries()]
      .sort(([a], [b]) => compareStrings(a, b))
      .map(([, definition]) => cloneDefinition(definition));
  }

  /** Copies of assets in one category, sorted by id. */
  listByCategory(category: AssetCategory): AssetDefinition[] {
    return this.list().filter((definition) => definition.metadata.category === category);
  }

  get size(): number {
    return this.assets.size;
  }
}
