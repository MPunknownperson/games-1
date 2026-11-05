/**
 * PRESERVE Authoring System — Intermediate Representation (IR) layer.
 *
 * IRSerializer.ts serializes any IR node or descriptor to JSON. It contains
 * no syntax emission rules, no formatting rules, no language-specific
 * transformations — only deterministic, structured JSON output suitable for
 * future exporters, reports, or AI agents.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { SchemaDefinition } from '../schema/SchemaTypes';

/** Options controlling how serialization behaves. */
export interface SerializationOptions {
  /** When true, output is pretty-printed with indentation. */
  pretty?: boolean;
  /** When true, `undefined` values are omitted from output. */
  skipUndefined?: boolean;
  /** When true, arrays are sorted deterministically before serialization. */
  sortArrays?: boolean;
}

/** Default serialization options. */
export const DEFAULT_SERIALIZATION_OPTIONS: Readonly<SerializationOptions> = {
  pretty: true,
  skipUndefined: false,
  sortArrays: false,
};

/**
 * Serialize any IR-relevant value to a JSON string.
 * Accepts nodes, descriptors, arrays, and primitive objects.
 */
export function serializeToJson(
  value: unknown,
  options: SerializationOptions = DEFAULT_SERIALIZATION_OPTIONS,
): string {
  const cleaned = cleanForSerialization(value, options);
  return JSON.stringify(cleaned, null, options.pretty ? 2 : 0);
}

/**
 * Recursively clean an object for deterministic JSON serialization.
 * Removes undefined keys, optionally sorts arrays, and produces a deep copy.
 */
function cleanForSerialization(
  value: unknown,
  options: SerializationOptions,
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;

  if (Array.isArray(value)) {
    const array = value.map((item) => cleanForSerialization(item, options));
    return options.sortArrays ? [...array].sort(compareForSerialization) : array;
  }

  if (typeof value === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (options.skipUndefined && item === undefined) continue;
      cleaned[key] = cleanForSerialization(item, options);
    }
    return cleaned;
  }

  return value;
}

/** Stable comparison key for array sorting (used by `sortArrays`). */
function compareForSerialization(left: unknown, right: unknown): number {
  const leftStr = describeForComparison(left);
  const rightStr = describeForComparison(right);
  return leftStr.localeCompare(rightStr);
}

/** Convert any value to a stable comparison string. */
function describeForComparison(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/**
 * Serialize a schema definition to a JSON string.
 * This is a convenience wrapper over `serializeToJson` for the schema layer.
 */
export function serializeSchema(schema: SchemaDefinition, pretty = true): string {
  return serializeToJson(schema, { pretty, skipUndefined: false, sortArrays: false });
}

/**
 * Serialize an array of schema definitions deterministically.
 */
export function serializeSchemaCollection(schemas: readonly SchemaDefinition[], pretty = true): string {
  return serializeToJson(schemas, { pretty, skipUndefined: false, sortArrays: false });
}
