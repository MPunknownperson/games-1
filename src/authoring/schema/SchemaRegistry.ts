/**
 * PRESERVE Authoring System — Schema layer.
 *
 * SchemaRegistry.ts stores schema definitions in memory. It performs no
 * filesystem scanning, imports no runtime or engine code, and holds no global
 * mutable state — every instance owns its own storage.
 *
 * Lookup by identifier is O(1). Lookups by category and tag are backed by
 * secondary indexes so they are also O(1) in the number of stored schemas.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { SchemaCategory, SchemaDefinition } from './SchemaTypes';

/** Raised when registering an identifier that is already present. */
export class DuplicateSchemaError extends Error {
  /** Identifier that caused the collision. */
  readonly schemaId: string;
  constructor(schemaId: string) {
    super(`A schema with id "${schemaId}" is already registered.`);
    this.name = 'DuplicateSchemaError';
    this.schemaId = schemaId;
  }
}

/**
 * In-memory store of {@link SchemaDefinition} objects.
 * Composition-friendly: hold an instance rather than subclassing.
 */
export class SchemaRegistry {
  private readonly schemasById = new Map<string, SchemaDefinition>();
  private readonly idsByCategory = new Map<SchemaCategory, Set<string>>();
  private readonly idsByTag = new Map<string, Set<string>>();

  /**
   * Store a schema.
   * @throws {DuplicateSchemaError} when the identifier already exists.
   * @returns the stored schema.
   */
  register(schema: SchemaDefinition): SchemaDefinition {
    if (this.schemasById.has(schema.id)) {
      throw new DuplicateSchemaError(schema.id);
    }
    this.schemasById.set(schema.id, schema);
    this.addToIndexes(schema);
    return schema;
  }

  /**
   * Store a schema, replacing any existing entry with the same identifier.
   * @returns the stored schema.
   */
  set(schema: SchemaDefinition): SchemaDefinition {
    const existing = this.schemasById.get(schema.id);
    if (existing) this.removeFromIndexes(existing);
    this.schemasById.set(schema.id, schema);
    this.addToIndexes(schema);
    return schema;
  }

  /** Retrieve a schema by identifier. O(1). */
  get(schemaId: string): SchemaDefinition | undefined {
    return this.schemasById.get(schemaId);
  }

  /** Whether a schema with the given identifier is stored. O(1). */
  has(schemaId: string): boolean {
    return this.schemasById.has(schemaId);
  }

  /**
   * Remove a schema by identifier.
   * @returns true when an entry was removed.
   */
  unregister(schemaId: string): boolean {
    const existing = this.schemasById.get(schemaId);
    if (!existing) return false;
    this.removeFromIndexes(existing);
    return this.schemasById.delete(schemaId);
  }

  /** List every stored schema. */
  list(): readonly SchemaDefinition[] {
    return Array.from(this.schemasById.values());
  }

  /** List every stored identifier. */
  ids(): readonly string[] {
    return Array.from(this.schemasById.keys());
  }

  /** List schemas belonging to a category. */
  listByCategory(category: SchemaCategory): readonly SchemaDefinition[] {
    return this.resolve(this.idsByCategory.get(category));
  }

  /** List schemas carrying a tag. */
  listByTag(tag: string): readonly SchemaDefinition[] {
    return this.resolve(this.idsByTag.get(tag));
  }

  /** List every category that currently has at least one schema. */
  categories(): readonly SchemaCategory[] {
    return Array.from(this.idsByCategory.keys());
  }

  /** Remove every stored schema and clear all indexes. */
  clear(): void {
    this.schemasById.clear();
    this.idsByCategory.clear();
    this.idsByTag.clear();
  }

  /** Number of stored schemas. */
  size(): number {
    return this.schemasById.size;
  }

  /** Translate a set of identifiers into schema objects. */
  private resolve(ids: Set<string> | undefined): readonly SchemaDefinition[] {
    if (!ids) return [];
    const output: SchemaDefinition[] = [];
    for (const id of ids) {
      const schema = this.schemasById.get(id);
      if (schema) output.push(schema);
    }
    return output;
  }

  /** Add a schema to the category and tag indexes. */
  private addToIndexes(schema: SchemaDefinition): void {
    let categorySet = this.idsByCategory.get(schema.category);
    if (!categorySet) {
      categorySet = new Set();
      this.idsByCategory.set(schema.category, categorySet);
    }
    categorySet.add(schema.id);

    for (const tag of schema.tags) {
      let tagSet = this.idsByTag.get(tag);
      if (!tagSet) {
        tagSet = new Set();
        this.idsByTag.set(tag, tagSet);
      }
      tagSet.add(schema.id);
    }
  }

  /** Remove a schema from the category and tag indexes. */
  private removeFromIndexes(schema: SchemaDefinition): void {
    const categorySet = this.idsByCategory.get(schema.category);
    if (categorySet) {
      categorySet.delete(schema.id);
      if (categorySet.size === 0) this.idsByCategory.delete(schema.category);
    }
    for (const tag of schema.tags) {
      const tagSet = this.idsByTag.get(tag);
      if (!tagSet) continue;
      tagSet.delete(schema.id);
      if (tagSet.size === 0) this.idsByTag.delete(tag);
    }
  }
}
