/**
 * PRESERVE Authoring System — Intermediate Representation (IR) layer.
 *
 * IRTypes.ts defines the shared type-level contracts used across the IR.
 * It introduces no syntax, no formatting rules, no language emission, and no
 * gameplay concepts. All types are deterministic and serializable.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { IRNodeKind } from './IRNode';

/**
 * Classification categories for nodes. The category is metadata, not syntax —
 * it helps future generators and tools select which backend or writer applies.
 */
export type IRCategory = 'structural' | 'behavioral' | 'data' | 'metadata' | 'presentation' | 'documentation';

/**
 * Access modifier describing visibility of a member or node. Not a language
 * keyword — just a semantic descriptor for generators.
 */
export type AccessModifier = 'public' | 'private' | 'protected' | 'internal';

/** Primitive type descriptors used in field and parameter declarations. */
export type PrimitiveTypeName = 'string' | 'number' | 'boolean' | 'void' | 'any' | 'unknown';

/** Generic parameter descriptor for parameterized types like `List<string>`. */
export interface GenericParameterDescriptor {
  readonly parameterName: string;
  readonly constraint?: PrimitiveTypeName | IRNodeKind;
  readonly variance?: 'invariant' | 'covariant' | 'contravariant';
}

/** Full descriptor for a type reference used in declarations. */
export interface TypeDescriptor {
  /** Name of the referenced type. Never a language syntax token. */
  readonly typeName: string;
  /** Category classification of the referenced type. */
  readonly category?: IRCategory;
  /** Whether this is an array or list of the named type. */
  readonly isArray: boolean;
  /** Whether this is an optional (nullable) value. */
  readonly isOptional: boolean;
  /** Generic arguments, when the named type is parameterized. */
  readonly genericArguments?: readonly TypeDescriptor[];
}

/**
 * Metadata descriptor for a declaration node that needs categorization or
 * grouping tags. Used by generators to select appropriate writers.
 */
export interface DeclarationKindDescriptor {
  /** The declaration kind this descriptor applies to. */
  readonly kind: IRNodeKind;
  /** Human-readable category label. */
  readonly category: IRCategory;
  /** Tags used for grouping and lookup. */
  readonly tags?: readonly string[];
  /** Optional documentation about the descriptor's purpose. */
  readonly documentation?: string;
}
