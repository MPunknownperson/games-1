/**
 * PRESERVE Authoring System — Intermediate Representation (IR) layer.
 *
 * IRLiteral.ts defines literal value structures used within expressions, fields,
 * property initializers, and annotations. Every literal is plain data: no
 * syntax tokens, no formatting rules, no evaluation semantics.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { PrimitiveTypeName } from './IRTypes';

/** Discriminator for literal kinds. */
export type LiteralKind = 'string' | 'number' | 'boolean' | 'null' | 'array' | 'object';

/** A literal value described in a language-agnostic way. */
export interface LiteralDescriptor {
  readonly kind: LiteralKind;
  /** For primitive kinds, the value is stored directly (as a serializable form). */
  readonly value?: string | number | boolean | null | readonly LiteralDescriptor[] | Readonly<Record<string, LiteralDescriptor>>;
  /** Type descriptor for array element types or object value types. */
  readonly valueDescriptor?: PrimitiveTypeName;
  /** Optional tags for grouping or lookup. */
  readonly tags?: readonly string[];
}

/** Create a primitive literal descriptor. */
export function literalString(value: string): LiteralDescriptor {
  return { kind: 'string', value, tags: ['primitive', 'text'] };
}

/** Create a numeric literal descriptor. */
export function literalNumber(value: number): LiteralDescriptor {
  return { kind: 'number', value, tags: ['primitive', 'numeric'] };
}

/** Create a boolean literal descriptor. */
export function literalBoolean(value: boolean): LiteralDescriptor {
  return { kind: 'boolean', value, tags: ['primitive', 'boolean'] };
}

/** Create a null literal descriptor. */
export function literalNull(): LiteralDescriptor {
  return { kind: 'null', value: null, tags: ['primitive', 'null'] };
}

/** Create an array literal descriptor from a list of element descriptors. */
export function literalArray(elements: readonly LiteralDescriptor[]): LiteralDescriptor {
  return { kind: 'array', value: [...elements], tags: ['collection'] };
}

/** Create an object literal descriptor from a key-to-descriptor mapping. */
export function literalObject(properties: Readonly<Record<string, LiteralDescriptor>>): LiteralDescriptor {
  return { kind: 'object', value: { ...properties }, tags: ['structured'] };
}
