/**
 * PRESERVE Authoring System — Export Core.
 *
 * ExportPackage.ts is the container holding package identity, described
 * entries, declared dependencies, and the ability to produce a manifest.
 *
 * Ordering is deterministic: `listEntries()` and manifest generation sort by
 * identifier, so identical content always serializes identically.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import { compareEntries, type ExportEntry } from './ExportEntry';
import { createExportManifest, type ExportManifest } from './ExportManifest';
import {
  createExportVersion,
  type ExportAuthor,
  type ExportCompatibility,
  type ExportDependency,
  type ExportMetadata,
  type ExportVersion,
} from './ExportTypes';

/** Raised when adding an entry whose identifier already exists. */
export class DuplicateEntryError extends Error {
  /** Identifier that caused the collision. */
  readonly entryId: string;
  constructor(entryId: string) {
    super(`An export entry with id "${entryId}" already exists in this package.`);
    this.name = 'DuplicateEntryError';
    this.entryId = entryId;
  }
}

/** Options accepted when constructing a package. */
export interface ExportPackageOptions {
  packageName?: string;
  version?: ExportVersion;
  author?: ExportAuthor;
  metadata?: ExportMetadata;
  compatibility?: ExportCompatibility;
}

/**
 * Container describing one export package.
 * Composition-friendly: hold an instance; do not subclass.
 */
export class ExportPackage {
  readonly packageId: string;
  readonly packageName: string;
  readonly version: ExportVersion;
  readonly author: ExportAuthor;
  readonly metadata: ExportMetadata;
  readonly compatibility: ExportCompatibility;

  private readonly entries = new Map<string, ExportEntry>();
  private readonly dependencies = new Map<string, ExportDependency>();

  constructor(packageId: string, options: ExportPackageOptions = {}) {
    this.packageId = packageId;
    this.packageName = options.packageName ?? packageId;
    this.version = options.version ?? createExportVersion(1, 0, 0);
    this.author = options.author ?? { name: 'unknown' };
    this.metadata = options.metadata ?? {};
    this.compatibility = options.compatibility ?? {};
  }

  /**
   * Add an entry to the package.
   * @throws {DuplicateEntryError} when the identifier is already present.
   */
  addEntry(entry: ExportEntry): ExportEntry {
    if (this.entries.has(entry.id)) throw new DuplicateEntryError(entry.id);
    this.entries.set(entry.id, entry);
    return entry;
  }

  /** Add an entry, replacing any existing entry with the same identifier. */
  setEntry(entry: ExportEntry): ExportEntry {
    this.entries.set(entry.id, entry);
    return entry;
  }

  /**
   * Remove an entry by identifier.
   * @returns true when an entry was removed.
   */
  removeEntry(entryId: string): boolean {
    return this.entries.delete(entryId);
  }

  /** Retrieve an entry by identifier. O(1). */
  getEntry(entryId: string): ExportEntry | undefined {
    return this.entries.get(entryId);
  }

  /** Whether an entry with the given identifier exists. O(1). */
  hasEntry(entryId: string): boolean {
    return this.entries.has(entryId);
  }

  /** List every entry, sorted by identifier for deterministic ordering. */
  listEntries(): readonly ExportEntry[] {
    return Array.from(this.entries.values()).sort(compareEntries);
  }

  /** List entries belonging to a specific category. */
  listEntriesByCategory(category: ExportEntry['category']): readonly ExportEntry[] {
    return this.listEntries().filter((entry) => entry.category === category);
  }

  /** Number of entries in the package. */
  entryCount(): number {
    return this.entries.size;
  }

  /** Declare a dependency. Repeated identifiers replace the prior declaration. */
  addDependency(dependency: ExportDependency): void {
    this.dependencies.set(dependency.id, dependency);
  }

  /** Remove a declared dependency. */
  removeDependency(dependencyId: string): boolean {
    return this.dependencies.delete(dependencyId);
  }

  /** List declared dependencies, sorted by identifier. */
  listDependencies(): readonly ExportDependency[] {
    return Array.from(this.dependencies.values()).sort((a, b) => a.id.localeCompare(b.id));
  }

  /** Remove every entry and dependency. */
  clear(): void {
    this.entries.clear();
    this.dependencies.clear();
  }

  /**
   * Produce a manifest describing this package.
   * Supply `timestamp` for byte-stable output.
   */
  toManifest(timestamp?: string): ExportManifest {
    return createExportManifest({
      packageId: this.packageId,
      packageName: this.packageName,
      version: this.version,
      author: this.author,
      metadata: this.metadata,
      entries: this.listEntries(),
      dependencies: this.listDependencies(),
      compatibility: this.compatibility,
      timestamp,
      sorted: true,
    });
  }

  /** Return a plain, JSON-serializable snapshot of the package. */
  toJSON(timestamp?: string): ExportManifest {
    return this.toManifest(timestamp);
  }
}
