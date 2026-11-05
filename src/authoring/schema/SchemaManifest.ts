/**
 * PRESERVE Authoring System — Schema layer.
 *
 * SchemaManifest.ts is the index of all known schemas. It composes a
 * {@link SchemaRegistry} for storage and adds lookup by version, tag, category,
 * and dependency, plus deterministic export to JSON (and a YAML-ready plain
 * object for future exporters).
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type {
  SchemaCategory,
  SchemaDefinition,
  SchemaManifestData,
  SemanticVersion,
} from './SchemaTypes';
import { SchemaRegistry, DuplicateSchemaError } from './SchemaRegistry';
import { compare, compatible, equals, formatVersion, createVersion } from './SchemaVersion';

export { DuplicateSchemaError };

/** Version of the manifest export format. */
export const MANIFEST_FORMAT_VERSION: SemanticVersion = createVersion(1, 0, 0);

/** Options controlling manifest export. */
export interface ManifestExportOptions {
  /**
   * Fixed ISO-8601 timestamp for `generatedAt`. Supplying this makes the
   * export byte-for-byte deterministic.
   */
  timestamp?: string;
  /** When true (default), schemas are sorted by identifier for stable output. */
  sorted?: boolean;
}

/**
 * The authoritative index of known schemas.
 * Composition-friendly: holds a registry rather than extending it.
 */
export class SchemaManifest {
  private readonly registry: SchemaRegistry;

  constructor(registry?: SchemaRegistry) {
    this.registry = registry ?? new SchemaRegistry();
  }

  /** Access the underlying storage registry. */
  getRegistry(): SchemaRegistry {
    return this.registry;
  }

  /**
   * Add a schema to the index.
   * @throws {DuplicateSchemaError} when the identifier already exists.
   */
  register(schema: SchemaDefinition): SchemaDefinition {
    return this.registry.register(schema);
  }

  /** Add several schemas in order. Stops at the first duplicate. */
  registerAll(schemas: readonly SchemaDefinition[]): void {
    for (const schema of schemas) this.registry.register(schema);
  }

  /** Retrieve a schema by identifier. O(1). */
  get(schemaId: string): SchemaDefinition | undefined {
    return this.registry.get(schemaId);
  }

  /** Whether the identifier is present. O(1). */
  has(schemaId: string): boolean {
    return this.registry.has(schemaId);
  }

  /** Remove a schema by identifier. */
  unregister(schemaId: string): boolean {
    return this.registry.unregister(schemaId);
  }

  /** List every indexed schema. */
  list(): readonly SchemaDefinition[] {
    return this.registry.list();
  }

  /** Number of indexed schemas. */
  size(): number {
    return this.registry.size();
  }

  /** Remove every indexed schema. */
  clear(): void {
    this.registry.clear();
  }

  /** List schemas in a category. */
  findByCategory(category: SchemaCategory): readonly SchemaDefinition[] {
    return this.registry.listByCategory(category);
  }

  /** List schemas carrying a tag. */
  findByTag(tag: string): readonly SchemaDefinition[] {
    return this.registry.listByTag(tag);
  }

  /** List schemas whose version exactly equals the supplied version. */
  findByVersion(version: SemanticVersion): readonly SchemaDefinition[] {
    return this.registry.list().filter((schema) => equals(schema.version, version));
  }

  /**
   * List schemas whose version satisfies the supplied requirement under
   * semantic-versioning rules (matching major, not older).
   */
  findCompatibleWith(required: SemanticVersion): readonly SchemaDefinition[] {
    return this.registry.list().filter((schema) => compatible(schema.version, required));
  }

  /** List schemas that declare a dependency on the given identifier. */
  findDependents(schemaId: string): readonly SchemaDefinition[] {
    return this.registry
      .list()
      .filter((schema) => schema.metadata.dependencies.some((dependency) => dependency.schemaId === schemaId));
  }

  /** List the direct dependency identifiers declared by a schema. */
  findDependencies(schemaId: string): readonly string[] {
    const schema = this.registry.get(schemaId);
    if (!schema) return [];
    return schema.metadata.dependencies.map((dependency) => dependency.schemaId);
  }

  /**
   * Resolve the full transitive dependency closure for a schema.
   * Cycles are handled safely; each identifier appears at most once.
   */
  resolveDependencyClosure(schemaId: string): readonly string[] {
    const seen = new Set<string>();
    const queue = [...this.findDependencies(schemaId)];
    while (queue.length > 0) {
      const current = queue.shift() as string;
      if (seen.has(current)) continue;
      seen.add(current);
      queue.push(...this.findDependencies(current));
    }
    return Array.from(seen);
  }

  /** List every category that currently holds at least one schema. */
  categories(): readonly SchemaCategory[] {
    return this.registry.categories();
  }

  /**
   * Produce a serializable snapshot of the manifest.
   * Output is deterministic when `sorted` is enabled and a timestamp supplied.
   */
  export(options: ManifestExportOptions = {}): SchemaManifestData {
    const sorted = options.sorted ?? true;
    const schemas = [...this.registry.list()];
    if (sorted) schemas.sort((left, right) => left.id.localeCompare(right.id));
    return {
      manifestVersion: MANIFEST_FORMAT_VERSION,
      generatedAt: options.timestamp ?? new Date().toISOString(),
      schemaCount: schemas.length,
      schemas,
    };
  }

  /** Serialize the manifest to a JSON string. */
  toJSON(options: ManifestExportOptions = {}): string {
    return JSON.stringify(this.export(options), null, 2);
  }

  /**
   * Produce a plain nested object suitable for a future YAML exporter.
   * No YAML library is used or required here.
   */
  toPlainObject(options: ManifestExportOptions = {}): Record<string, unknown> {
    const data = this.export(options);
    return {
      manifestVersion: formatVersion(data.manifestVersion),
      generatedAt: data.generatedAt,
      schemaCount: data.schemaCount,
      schemas: data.schemas.map((schema) => ({
        id: schema.id,
        name: schema.name,
        displayName: schema.displayName,
        category: schema.category,
        version: formatVersion(schema.version),
        author: schema.author,
        description: schema.description,
        tags: [...schema.tags],
        status: schema.status,
        createdAt: schema.createdAt,
        updatedAt: schema.updatedAt,
      })),
    };
  }

  /** Rebuild a manifest from a previously exported snapshot. */
  static fromData(data: SchemaManifestData): SchemaManifest {
    const manifest = new SchemaManifest();
    manifest.registerAll(data.schemas);
    return manifest;
  }

  /** Return schemas ordered oldest to newest by version. */
  listSortedByVersion(): readonly SchemaDefinition[] {
    return [...this.registry.list()].sort((left, right) => compare(left.version, right.version));
  }
}
