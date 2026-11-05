/**
 * PRESERVE Authoring System — Preview Core.
 *
 * PreviewTypes.ts declares the shared vocabulary used across the preview layer:
 * target kinds, display formats, inspection statuses, metadata bags, and
 * configuration options. Every type is plain data and JSON-serializable.
 *
 * The preview inspects *structure* only — it has no knowledge of towers,
 * enemies, weapons, damage, health, levels, themes, balance, or UI.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */

/** The kind of preview data being inspected. */
export const PreviewKind = {
  /** A schema definition from the Schema & Manifest layer. */
  SCHEMA: 'SCHEMA',
  /** An Intermediate Representation tree. */
  IR: 'IR',
  /** A set of generated source files. */
  GENERATION: 'GENERATION',
  /** A validation report produced by the Validation layer. */
  VALIDATION: 'VALIDATION',
  /** An arbitrary serializable payload for custom inspection. */
  CUSTOM: 'CUSTOM',
} as const;

/** Union of every supported preview kind. */
export type PreviewKind = (typeof PreviewKind)[keyof typeof PreviewKind];

/** How a preview consumer prefers the data formatted. */
export const PreviewFormat = {
  /** Full tree with all nodes, properties, and metadata. */
  TREE: 'TREE',
  /** Compact single-line summary per node. */
  COMPACT: 'COMPACT',
  /** JSON representation of the preview tree. */
  JSON: 'JSON',
  /** Human-readable plain text (tree-style listing). */
  TEXT: 'TEXT',
} as const;

/** Union of every supported output format. */
export type PreviewFormat = (typeof PreviewFormat)[keyof typeof PreviewFormat];

/** Lifecycle status of a preview object or session. */
export const PreviewStatus = {
  /** Preview is being assembled. */
  BUILDING: 'BUILDING',
  /** Preview is complete and ready for inspection. */
  READY: 'READY',
  /** Preview has been updated since the last snapshot. */
  STALE: 'STALE',
  /** Preview session has been closed. */
  CLOSED: 'CLOSED',
} as const;

/** Union of every supported status. */
export type PreviewStatus = (typeof PreviewStatus)[keyof typeof PreviewStatus];

/** Descriptive metadata attached to a preview node. */
export interface PreviewMetadata {
  /** Stable source identifier (e.g. schema id, request id, file path). */
  readonly sourceId?: string;
  /** Human-facing label describing what this preview represents. */
  readonly label?: string;
  /** Version information of the data being previewed. */
  readonly version?: string;
  /** Free-form, serialisable key-value pairs. */
  readonly properties?: Readonly<Record<string, unknown>>;
}

/** Input describing what data the preview should inspect. */
export interface PreviewTarget {
  /** Which category of data is being previewed. */
  readonly kind: PreviewKind;
  /** The payload itself (schema, IR, generation result, or arbitrary object). */
  readonly data: unknown;
  /** Optional logical label for the target. */
  readonly label?: string;
}

/** Options controlling how a preview is constructed. */
export interface PreviewOptions {
  /** Maximum depth of tree expansion. 0 = unlimited. Defaults to 0. */
  readonly maxDepth?: number;
  /** Maximum number of sibling nodes at any level. 0 = unlimited. Defaults to 0. */
  readonly maxSiblings?: number;
  /** Whether to include raw data dumps in node metadata. Defaults to false. */
  readonly includeRawData?: boolean;
  /** When true, array items are summarised instead of expanded. Defaults to false. */
  readonly summariseArrays?: boolean;
  /** Fixed timestamp for deterministic preview construction. */
  readonly timestamp?: string;
}
