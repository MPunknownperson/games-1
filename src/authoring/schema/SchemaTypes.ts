/**
 * PRESERVE Authoring System — Schema layer.
 *
 * SchemaTypes.ts defines every shared interface used to describe authoring
 * data. Schemas are pure, serializable, deterministic descriptions: they
 * contain structured data only and never contain functions, gameplay values
 * that execute, or references to runtime systems.
 *
 * This file imports nothing. It is the root of the schema dependency chain:
 *
 *   Schema -> Generator -> Validator -> Registry -> Preview -> Exporter
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */

/**
 * Semantic version expressed as structured data.
 * Kept as plain numbers so schemas remain JSON-serializable.
 */
export interface SemanticVersion {
  /** Breaking-change component. */
  readonly major: number;
  /** Backwards-compatible feature component. */
  readonly minor: number;
  /** Backwards-compatible fix component. */
  readonly patch: number;
}

/**
 * Category of authoring object a schema describes.
 *
 * New categories are added by extending this union. Because every consumer
 * treats the category as an opaque string key, adding a category never
 * requires modifying existing schema definitions.
 */
export type SchemaCategory =
  | 'tower'
  | 'enemy'
  | 'projectile'
  | 'theme'
  | 'decoration'
  | 'particle'
  | 'puzzle'
  | 'uiPanel'
  | 'audio'
  | 'localization'
  | 'achievement'
  | 'relic'
  | 'card'
  | 'quest'
  | 'wave'
  | 'difficulty';

/** Publication state of a schema definition. */
export type SchemaStatus = 'draft' | 'review' | 'stable' | 'deprecated' | 'archived';

/**
 * A declared dependency from one schema onto another.
 * Dependencies are metadata only; nothing is resolved or loaded.
 */
export interface SchemaDependency {
  /** Identifier of the schema being depended upon. */
  readonly schemaId: string;
  /** Minimum acceptable version of the dependency, if constrained. */
  readonly minimumVersion?: SemanticVersion;
  /** When true, the dependency is advisory rather than mandatory. */
  readonly optional?: boolean;
  /** Human-readable explanation of why the dependency exists. */
  readonly reason?: string;
}

/**
 * Compatibility declaration describing which engine versions a schema targets.
 * Purely informational; nothing is enforced at runtime.
 */
export interface SchemaCompatibility {
  /** Lowest engine version known to work with this schema. */
  readonly minimumEngineVersion?: SemanticVersion;
  /** Highest engine version known to work with this schema. */
  readonly maximumEngineVersion?: SemanticVersion;
  /** Free-form notes about compatibility caveats. */
  readonly notes?: string;
}

/**
 * Descriptive metadata attached to a schema.
 * Contains no gameplay values whatsoever.
 */
export interface SchemaMetadata {
  /** Long-form documentation describing the object being authored. */
  readonly documentation: string;
  /** Human-facing label shown in tooling. */
  readonly displayName: string;
  /** Logical icon identifier resolved by tooling; never a file path. */
  readonly iconReference?: string;
  /** Person or system credited with authoring the schema. */
  readonly author: string;
  /** Version of the metadata payload itself. */
  readonly version: SemanticVersion;
  /** Category the described object belongs to. */
  readonly category: SchemaCategory;
  /** Search keywords used by tooling and future AI agents. */
  readonly keywords: readonly string[];
  /** Other schemas this schema references. */
  readonly dependencies: readonly SchemaDependency[];
  /** Engine compatibility window. */
  readonly compatibility: SchemaCompatibility;
  /** Marks unstable behavior that may change without notice. */
  readonly experimental: boolean;
  /** Marks the schema as superseded; see {@link deprecationReason}. */
  readonly deprecated: boolean;
  /** Explanation shown when {@link deprecated} is true. */
  readonly deprecationReason?: string;
}

/**
 * A field describing one authored property.
 *
 * Fields are declarative descriptions only. `defaultValue` holds serializable
 * data; it is never a function and is never executed.
 */
export interface SchemaField {
  /** Machine-readable field name, written without abbreviations. */
  readonly name: string;
  /** Human-facing label for tooling. */
  readonly displayName: string;
  /** Primitive shape of the value this field holds. */
  readonly valueType: 'string' | 'number' | 'boolean' | 'stringList' | 'numberList' | 'reference';
  /** Explanation of the field's purpose. */
  readonly description: string;
  /** Whether authoring tools must supply a value. */
  readonly required: boolean;
  /** Serializable default. Never a function. */
  readonly defaultValue?: string | number | boolean | readonly string[] | readonly number[] | null;
  /** For `reference` fields, the category of schema being referenced. */
  readonly referenceCategory?: SchemaCategory;
}

/**
 * The complete, serializable description of one authoring object type.
 *
 * Every schema is deterministic: given identical inputs the same object is
 * produced, and the object can be round-tripped through JSON without loss.
 */
export interface SchemaDefinition {
  /** Stable unique identifier, typically `category.name`. */
  readonly id: string;
  /** Machine-readable name written without abbreviations. */
  readonly name: string;
  /** Human-facing label shown in tooling. */
  readonly displayName: string;
  /** Category the described object belongs to. */
  readonly category: SchemaCategory;
  /** Version of this schema definition. */
  readonly version: SemanticVersion;
  /** Person or system credited with authoring the schema. */
  readonly author: string;
  /** Short summary of what the schema describes. */
  readonly description: string;
  /** Tags used for grouping and lookup. */
  readonly tags: readonly string[];
  /** ISO-8601 timestamp recorded when the schema was created. */
  readonly createdAt: string;
  /** ISO-8601 timestamp recorded when the schema was last modified. */
  readonly updatedAt: string;
  /** Publication state of the schema. */
  readonly status: SchemaStatus;
  /** Descriptive metadata payload. */
  readonly metadata: SchemaMetadata;
  /** Declarative field descriptions for the authored object. */
  readonly fields: readonly SchemaField[];
}

/** Serializable snapshot of a manifest export. */
export interface SchemaManifestData {
  /** Version of the manifest format itself. */
  readonly manifestVersion: SemanticVersion;
  /** ISO-8601 timestamp recorded when the manifest was exported. */
  readonly generatedAt: string;
  /** Total number of schemas contained in the export. */
  readonly schemaCount: number;
  /** Every schema known to the manifest at export time. */
  readonly schemas: readonly SchemaDefinition[];
}
