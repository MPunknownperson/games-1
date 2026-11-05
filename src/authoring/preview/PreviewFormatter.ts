/**
 * PRESERVE Authoring System — Preview Core.
 *
 * PreviewFormatter.ts produces human-readable text output from a PreviewTree.
 * It supports tree-style indentation, compact summaries, JSON serialization,
 * and plain-text listings. Formatting is pure — it never mutates the tree
 * or changes semantic meaning.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { PreviewNode } from './PreviewNode';
import type { PreviewFormat, PreviewOptions } from './PreviewTypes';
import { PreviewTree } from './PreviewTree';

/** Format a tree into indented text with node kinds and key properties. */
export function formatTree(tree: PreviewTree, opts: PreviewOptions = {}): string {
  const root = tree.getRoot();
  if (!root) return '(empty preview tree)';
  const lines: string[] = [];
  const visit = (node: PreviewNode, indent: string): void => {
    const tag = `[${node.kind}]`;
    const props = formatProps(node.properties);
    lines.push(`${indent}${tag} ${node.displayName}${props ? `  (${props})` : ''}`);
    for (const child of tree.getChildren(node.id)) {
      if (opts.maxSiblings) {
        // handled during tree construction already
      }
      visit(child, indent + '  ');
    }
  };
  visit(root, '');
  return lines.join('\n');
}

/** Format a tree as compact one-line summaries. */
export function formatCompact(tree: PreviewTree): string {
  const root = tree.getRoot();
  if (!root) return '(empty preview tree)';
  const lines: string[] = [];
  const visit = (node: PreviewNode): void => {
    lines.push(`${node.kind}:${node.displayName}`);
    for (const child of tree.getChildren(node.id)) visit(child);
  };
  visit(root);
  return lines.join(' → ');
}

/** Format a tree as a JSON string. */
export function formatJson(tree: PreviewTree, pretty = true): string {
  return JSON.stringify(tree.toJSON(), null, pretty ? 2 : 0);
}

/** Dispatch to the correct formatter based on format kind. */
export function formatPreview(tree: PreviewTree, fmt: PreviewFormat, opts: PreviewOptions = {}): string {
  switch (fmt) {
    case 'TREE': return formatTree(tree, opts);
    case 'COMPACT': return formatCompact(tree);
    case 'JSON': return formatJson(tree);
    case 'TEXT': return formatPlainText(tree);
  }
}

/** Format a tree as plain text listing with depth indicators. */
export function formatPlainText(tree: PreviewTree): string {
  const root = tree.getRoot();
  if (!root) return '(empty preview tree)';
  const lines: string[] = [];
  const visit = (node: PreviewNode, depth: number): void => {
    lines.push(`${'  '.repeat(depth)}${node.displayName}`);
    for (const child of tree.getChildren(node.id)) visit(child, depth + 1);
  };
  visit(root, 0);
  return lines.join('\n');
}

/** Format a property bag into a compact string. */
function formatProps(props: Readonly<Record<string, string | number | boolean | null>>): string {
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(props)) {
    if (value !== null && value !== undefined && value !== '') {
      pairs.push(`${key}=${String(value)}`);
    }
  }
  return pairs.slice(0, 3).join(', ');
}
