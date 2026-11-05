/**
 * PRESERVE Authoring System — testing infrastructure.
 *
 * MockRegistry.ts provides a generic, in-memory fake registry. It lets future
 * authoring modules simulate registration, lookup, duplicate detection, and
 * removal without touching the real {@link FileRegistry} or any filesystem.
 *
 * Unlike the real FileRegistry (which silently replaces on duplicate), this
 * mock throws on duplicate ids so tests can assert duplicate detection.
 *
 * Development-only; never imported by the runtime game.
 */

/** Error thrown when registering an id that already exists. */
export class DuplicateEntryError extends Error {
  readonly id: string;
  constructor(id: string) {
    super(`An entry with id "${id}" is already registered.`);
    this.name = 'DuplicateEntryError';
    this.id = id;
  }
}

/**
 * A minimal generic registry keyed by string id. Composition-friendly; hold an
 * instance rather than subclassing. All state is instance-local.
 */
export class MockRegistry<T> {
  private readonly entries = new Map<string, T>();

  /**
   * Register an entry under `id`.
   * @throws {DuplicateEntryError} when `id` is already present.
   * @returns the stored entry.
   */
  register(id: string, entry: T): T {
    if (this.entries.has(id)) {
      throw new DuplicateEntryError(id);
    }
    this.entries.set(id, entry);
    return entry;
  }

  /** Look up an entry by id. */
  get(id: string): T | undefined {
    return this.entries.get(id);
  }

  /** Whether an entry with the given id exists. */
  has(id: string): boolean {
    return this.entries.has(id);
  }

  /**
   * Remove an entry by id.
   * @returns true when an entry was removed.
   */
  unregister(id: string): boolean {
    return this.entries.delete(id);
  }

  /** Replace an entry regardless of presence (returns the stored entry). */
  set(id: string, entry: T): T {
    this.entries.set(id, entry);
    return entry;
  }

  /** List all registered entries. */
  list(): readonly T[] {
    return Array.from(this.entries.values());
  }

  /** List all registered ids. */
  ids(): readonly string[] {
    return Array.from(this.entries.keys());
  }

  /** Remove every entry. */
  clear(): void {
    this.entries.clear();
  }

  /** Number of registered entries. */
  size(): number {
    return this.entries.size;
  }
}
