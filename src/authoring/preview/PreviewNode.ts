/**
 * PRESERVE Authoring System — Preview Core.
 *
 * PreviewNode.ts defines the smallest preview representation. A node is pure
 * descriptive data: identifier, display name, kind, metadata, properties,
 * and child references. It contains no executable logic and no gameplay
 * meaning.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { PreviewMetadata } from './PreviewTypes';

/** The structural category of a preview node. */
export const PreviewNodeKind = {
  ROOT: 'ROOT',
  SCHEMA: 'SCHEMA',
  FIELD: 'FIELD',
  MODULE: 'MODULE',
  NAMESPACE: 'NAMESPACE',
  CLASS: 'CLASS',
  INTERFACE: 'INTERFACE',
  ENUM: 'ENUM',
  FUNCTION: 'FUNCTION',
  METHOD: 'METHOD',
  PROPERTY: 'PROPERTY',
  VARIABLE: 'VARIABLE',
  CONSTANT: 'CONSTANT',
  PARAMETER: 'PARAMETER',
  EXPRESSION: 'EXPRESSION',
  LITERAL: 'LITERAL',
  COMMENT: 'COMMENT',
  FILE: 'FILE',
  IMPORT: 'IMPORT',
  EXPORT: 'EXPORT',
  GENERATED_FILE: 'GENERATED_FILE',
  VALIDATION_RESULT: 'VALIDATION_RESULT',
  VALIDATION_ISSUE: 'VALIDATION_ISSUE',
  CONTAINER: 'CONTAINER',
  ARRAY_ITEM: 'ARRAY_ITEM',
  CUSTOM: 'CUSTOM',
} as const;

/** Union of every supported node kind. */
export type PreviewNodeKind = (typeof PreviewNodeKind)[keyof typeof PreviewNodeKind];

/**
 * The smallest unit in a preview tree.
 * A node is pure descriptive data — no functions, no gameplay semantics.
 */
export interface PreviewNode {
  /** Stable unique identifier within the tree. */
  readonly id: string;
  /** Short, human-readable label. */
  readonly displayName: string;
  /** Structural category of this node. */
  readonly kind: PreviewNodeKind;
  /** Optional descriptive metadata. */
  readonly metadata?: PreviewMetadata;
  /** Identifier of the parent node; undefined for root. */
  readonly parentId?: string;
  /** Identifiers of child nodes, in order. */
  readonly children: readonly string[];
  /** Flat property bag describing structural details. */
  readonly properties: Readonly<Record<string, string | number | boolean | null>>;
}

/** Input accepted when constructing a node. */
export interface PreviewNodeInput {
  id: string;
  displayName: string;
  kind: PreviewNodeKind;
  metadata?: PreviewMetadata;
  parentId?: string;
  children?: readonly string[];
  properties?: Record<string, string | number | boolean | null>;
}

/** Build a preview node from an input bag. */
export function createPreviewNode(input: PreviewNodeInput): PreviewNode {
  return {
    id: input.id,
    displayName: input.displayName,
    kind: input.kind,
    metadata: input.metadata,
    parentId: input.parentId,
    children: input.children ? [...input.children] : [],
    properties: input.properties ? { ...input.properties } : {},
  };
}
