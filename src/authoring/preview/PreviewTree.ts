/**
 * PRESERVE Authoring System — Preview Core.
 *
 * PreviewTree.ts manages the container of preview nodes: insertion, lookup,
 * traversal, filtering, and deterministic serialization. Every tree is
 * immutable from the consumer's perspective; mutation only happens through
 * the builder.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { PreviewNode } from './PreviewNode';

/**
 * Ordered map of nodes by identifier.
 * Provides O(1) lookup by id, parent-child traversal, and filtering.
 */
export class PreviewTree {
  private readonly nodes = new Map<string, PreviewNode>();
  private readonly childIds = new Map<string, string[]>();
  private _rootId: string | undefined;

  /** Add or replace a node. Children are tracked for traversal. */
  setNode(node: PreviewNode): void {
    this.nodes.set(node.id, node);
    if (node.parentId === undefined) {
      this._rootId = node.id;
    } else {
      const siblings = this.childIds.get(node.parentId) ?? [];
      if (!siblings.includes(node.id)) {
        this.childIds.set(node.parentId, [...siblings, node.id]);
      }
    }
  }

  /** Retrieve a node by identifier. */
  getNode(id: string): PreviewNode | undefined {
    return this.nodes.get(id);
  }

  /** The root node, or undefined when the tree is empty. */
  getRoot(): PreviewNode | undefined {
    if (this._rootId) return this.nodes.get(this._rootId);
    return undefined;
  }

  /** All immediate children of the given node. */
  getChildren(id: string): readonly PreviewNode[] {
    return (this.childIds.get(id) ?? [])
      .map((childId) => this.nodes.get(childId))
      .filter((n): n is PreviewNode => n !== undefined);
  }

  /** Every node in depth-first order. */
  depthFirst(): readonly PreviewNode[] {
    const root = this.getRoot();
    if (!root) return [];
    const result: PreviewNode[] = [];
    const visit = (node: PreviewNode): void => {
      result.push(node);
      for (const child of this.getChildren(node.id)) visit(child);
    };
    visit(root);
    return result;
  }

  /** Return every node matching the given kind. */
  findByKind(kind: PreviewNode['kind']): readonly PreviewNode[] {
    return this.depthFirst().filter((node) => node.kind === kind);
  }

  /** Return nodes whose display name contains the given substring. */
  search(displayNameSubstring: string): readonly PreviewNode[] {
    const lower = displayNameSubstring.toLowerCase();
    return this.depthFirst().filter((node) =>
      node.displayName.toLowerCase().includes(lower),
    );
  }

  /** Number of stored nodes. */
  size(): number {
    return this.nodes.size;
  }

  /** Whether the tree is empty. */
  isEmpty(): boolean {
    return this.nodes.size === 0;
  }

  /** Reset the tree to an empty state. */
  clear(): void {
    this.nodes.clear();
    this.childIds.clear();
    this._rootId = undefined;
  }

  /** Return a plain, JSON-serialisable snapshot: { nodes, rootId }. */
  toJSON(): { readonly nodes: Record<string, PreviewNode>; readonly rootId?: string } {
    const record: Record<string, PreviewNode> = {};
    for (const [id, node] of this.nodes) record[id] = { ...node, children: [...node.children] };
    return { nodes: record, rootId: this._rootId };
  }

  /** Rebuild a tree from a previous toJSON() output. */
  static fromJSON(data: { nodes: Record<string, PreviewNode>; rootId?: string }): PreviewTree {
    const tree = new PreviewTree();
    for (const node of Object.values(data.nodes)) tree.setNode(node);
    return tree;
  }
}
