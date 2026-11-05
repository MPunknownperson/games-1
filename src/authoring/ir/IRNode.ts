/**
 * PRESERVE Authoring System — Intermediate Representation (IR) layer.
 *
 * IRNode defines the minimal identity of any node in the intermediate
 * representation. Every node carries a kind, identifier, and optional
 * parent reference. Nodes are plain data structures — no methods except
 * a stable identity helper — so every backend can traverse them uniformly
 * without importing gameplay, engine, or runtime code.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */

/** The kind of an IR node. Each kind maps to a concrete node type. */
export type IRNodeKind =
  | 'Module'
  | 'Namespace'
  | 'Import'
  | 'Export'
  | 'Class'
  | 'Interface'
  | 'Enum'
  | 'Function'
  | 'Variable'
  | 'Constant'
  | 'Property'
  | 'Method'
  | 'Parameter'
  | 'Comment'
  | 'Annotation'
  | 'Expression'
  | 'Literal'
  | 'TypeReference'
  | 'Block'
  | 'Return'
  | 'Assignment';

/**
 * A unique, deterministic identifier for a node within an IR tree.
 * Used for references, parent linkage, and deterministic JSON serialization.
 */
export interface IRIdentity {
  /** Stable identifier, typically derived deterministically from content. */
  readonly id: string;
  /** Kind of the node this identity refers to. */
  readonly kind: IRNodeKind;
}

/**
 * The base interface for every node in the intermediate representation.
 * Nodes contain only semantic information — never formatting, never language
 * syntax, never runtime references.
 */
export interface IRNode extends Readonly<IRIdentity> {
  /** Parent node identifier for tree traversal; `undefined` for root nodes. */
  readonly parentId?: string;
  /** Optional human-readable label (not a language identifier). */
  readonly label?: string;
  /** Documentation describing the node's purpose. */
  readonly documentation?: string;
  /** Tags for grouping and lookup (e.g., 'public', 'deprecated'). */
  readonly tags?: readonly string[];
  /** Children nodes contained by this node, when applicable. */
  readonly children?: readonly IRNode[];
  /** Additional arbitrary metadata without gameplay meaning. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Create a bare identity object for use in tests or composite nodes. */
export function identity(id: string, kind: IRNodeKind): Readonly<IRIdentity> {
  return { id, kind };
}
