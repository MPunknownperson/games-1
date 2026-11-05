/**
 * PRESERVE Authoring System — Schema layer.
 *
 * SchemaMetadata.ts provides construction and inspection helpers for the
 * descriptive metadata attached to a schema. Metadata contains documentation,
 * display information, authorship, categorisation, dependencies, compatibility,
 * and lifecycle flags — never gameplay values.
 *
 * All helpers are pure functions returning new, serializable objects.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type {
  SchemaCategory,
  SchemaCompatibility,
  SchemaDependency,
  SchemaMetadata,
  SemanticVersion,
} from './SchemaTypes';
import { INITIAL_VERSION, compatible } from './SchemaVersion';

export type { SchemaMetadata, SchemaDependency, SchemaCompatibility };

/** Options accepted when constructing metadata. Unspecified fields use defaults. */
export interface MetadataOptions {
  documentation?: string;
  displayName?: string;
  iconReference?: string;
  author?: string;
  version?: SemanticVersion;
  keywords?: readonly string[];
  dependencies?: readonly SchemaDependency[];
  compatibility?: SchemaCompatibility;
  experimental?: boolean;
  deprecated?: boolean;
  deprecationReason?: string;
}

/** Author recorded when none is supplied. */
export const UNKNOWN_AUTHOR = 'unknown';

/**
 * Build a complete {@link SchemaMetadata} object.
 * Every field receives a deterministic default so the result is always valid
 * and fully serializable.
 */
export function createMetadata(category: SchemaCategory, options: MetadataOptions = {}): SchemaMetadata {
  return {
    documentation: options.documentation ?? '',
    displayName: options.displayName ?? '',
    iconReference: options.iconReference,
    author: options.author ?? UNKNOWN_AUTHOR,
    version: options.version ?? INITIAL_VERSION,
    category,
    keywords: options.keywords ? [...options.keywords] : [],
    dependencies: options.dependencies ? [...options.dependencies] : [],
    compatibility: options.compatibility ?? {},
    experimental: options.experimental ?? false,
    deprecated: options.deprecated ?? false,
    deprecationReason: options.deprecationReason,
  };
}

/**
 * Return a copy of `metadata` with the supplied changes applied.
 * The original object is never mutated.
 */
export function withMetadataChanges(
  metadata: SchemaMetadata,
  changes: Partial<Omit<SchemaMetadata, 'category'>>,
): SchemaMetadata {
  return { ...metadata, ...changes };
}

/** Return a copy of `metadata` with an additional dependency appended. */
export function withDependency(metadata: SchemaMetadata, dependency: SchemaDependency): SchemaMetadata {
  return { ...metadata, dependencies: [...metadata.dependencies, dependency] };
}

/** Return a copy of `metadata` with the named dependency removed. */
export function withoutDependency(metadata: SchemaMetadata, schemaId: string): SchemaMetadata {
  return {
    ...metadata,
    dependencies: metadata.dependencies.filter((dependency) => dependency.schemaId !== schemaId),
  };
}

/** Return a copy of `metadata` marked deprecated with the supplied reason. */
export function markDeprecated(metadata: SchemaMetadata, reason: string): SchemaMetadata {
  return { ...metadata, deprecated: true, deprecationReason: reason };
}

/** Return a copy of `metadata` marked experimental or stable. */
export function markExperimental(metadata: SchemaMetadata, experimental = true): SchemaMetadata {
  return { ...metadata, experimental };
}

/** Whether `metadata` declares a dependency on the given schema identifier. */
export function hasDependency(metadata: SchemaMetadata, schemaId: string): boolean {
  return metadata.dependencies.some((dependency) => dependency.schemaId === schemaId);
}

/** List identifiers of every mandatory (non-optional) dependency. */
export function listRequiredDependencyIds(metadata: SchemaMetadata): readonly string[] {
  return metadata.dependencies
    .filter((dependency) => dependency.optional !== true)
    .map((dependency) => dependency.schemaId);
}

/**
 * Whether the supplied engine version falls inside the declared compatibility
 * window. Unspecified bounds are treated as unbounded.
 */
export function isEngineVersionSupported(metadata: SchemaMetadata, engineVersion: SemanticVersion): boolean {
  const { minimumEngineVersion, maximumEngineVersion } = metadata.compatibility;
  if (minimumEngineVersion && !compatible(engineVersion, minimumEngineVersion)) return false;
  if (maximumEngineVersion && engineVersion.major > maximumEngineVersion.major) return false;
  return true;
}
