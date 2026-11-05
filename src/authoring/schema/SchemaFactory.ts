/**
 * PRESERVE Authoring System — Schema layer.
 *
 * SchemaFactory.ts creates empty, well-formed schema objects. It is a factory
 * only: it never validates, never inspects gameplay, and never writes files.
 * Any category — including ones added later — is supported without modifying
 * this file, because construction is driven entirely by the supplied category.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type {
  SchemaCategory,
  SchemaDefinition,
  SchemaField,
  SchemaStatus,
  SemanticVersion,
} from './SchemaTypes';
import { INITIAL_VERSION } from './SchemaVersion';
import { createMetadata, type MetadataOptions } from './SchemaMetadata';

/** Options accepted when creating a schema. Unspecified fields use defaults. */
export interface SchemaCreateOptions {
  /** Explicit identifier. Defaults to `category.name`. */
  id?: string;
  /** Human-facing label. Defaults to the machine name. */
  displayName?: string;
  /** Version of the definition. Defaults to 1.0.0. */
  version?: SemanticVersion;
  /** Credited author. */
  author?: string;
  /** Short summary of the described object. */
  description?: string;
  /** Grouping and lookup tags. */
  tags?: readonly string[];
  /** Publication state. Defaults to 'draft'. */
  status?: SchemaStatus;
  /** Declarative field descriptions. */
  fields?: readonly SchemaField[];
  /** Overrides for the descriptive metadata payload. */
  metadata?: MetadataOptions;
  /**
   * Fixed ISO-8601 timestamp used for `createdAt` and `updatedAt`.
   * Supplying this makes creation fully deterministic, which is useful for
   * reproducible exports and tests.
   */
  timestamp?: string;
}

/** Status assigned to freshly created schemas. */
export const DEFAULT_STATUS: SchemaStatus = 'draft';

/** Build the canonical identifier for a schema. */
export function buildSchemaId(category: SchemaCategory, name: string): string {
  return `${category}.${name}`;
}

/**
 * Create an empty, structurally complete {@link SchemaDefinition}.
 *
 * The returned object is plain data: fully serializable, deterministic when a
 * `timestamp` is supplied, and free of functions.
 */
export function createSchema(
  category: SchemaCategory,
  name: string,
  options: SchemaCreateOptions = {},
): SchemaDefinition {
  const timestamp = options.timestamp ?? new Date().toISOString();
  const displayName = options.displayName ?? name;
  const version = options.version ?? INITIAL_VERSION;
  const author = options.author ?? 'unknown';

  return {
    id: options.id ?? buildSchemaId(category, name),
    name,
    displayName,
    category,
    version,
    author,
    description: options.description ?? '',
    tags: options.tags ? [...options.tags] : [],
    createdAt: timestamp,
    updatedAt: timestamp,
    status: options.status ?? DEFAULT_STATUS,
    metadata: createMetadata(category, {
      displayName,
      author,
      version,
      ...options.metadata,
    }),
    fields: options.fields ? [...options.fields] : [],
  };
}

/**
 * Create a field description.
 * Fields hold serializable defaults only and never contain functions.
 */
export function createField(
  name: string,
  valueType: SchemaField['valueType'],
  options: Partial<Omit<SchemaField, 'name' | 'valueType'>> = {},
): SchemaField {
  return {
    name,
    displayName: options.displayName ?? name,
    valueType,
    description: options.description ?? '',
    required: options.required ?? false,
    defaultValue: options.defaultValue,
    referenceCategory: options.referenceCategory,
  };
}

/**
 * Return a copy of `schema` with the supplied changes applied and `updatedAt`
 * refreshed. Identity fields (`id`, `category`, `createdAt`) cannot change.
 */
export function withSchemaChanges(
  schema: SchemaDefinition,
  changes: Partial<Omit<SchemaDefinition, 'id' | 'category' | 'createdAt'>>,
  timestamp?: string,
): SchemaDefinition {
  return {
    ...schema,
    ...changes,
    updatedAt: timestamp ?? new Date().toISOString(),
  };
}

/** Return a copy of `schema` with an additional field appended. */
export function withField(schema: SchemaDefinition, field: SchemaField, timestamp?: string): SchemaDefinition {
  return withSchemaChanges(schema, { fields: [...schema.fields, field] }, timestamp);
}

/**
 * Produce a deep, structurally identical copy of a schema.
 * Uses JSON round-tripping, which also proves the schema is serializable.
 */
export function cloneSchema(schema: SchemaDefinition): SchemaDefinition {
  return JSON.parse(JSON.stringify(schema)) as SchemaDefinition;
}
