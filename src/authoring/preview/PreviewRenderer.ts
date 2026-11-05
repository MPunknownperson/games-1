/**
 * PRESERVE Authoring System — Preview Core.
 *
 * PreviewRenderer.ts defines an abstract rendering contract for preview data.
 * This is NOT graphical rendering — there is no canvas, DOM, React, WebGL, or
 * engine rendering here. The contract describes structured output formats:
 * tree data objects, plain text, and JSON strings.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { PreviewFormat, PreviewOptions } from './PreviewTypes';
import { formatJson, formatPlainText, formatTree } from './PreviewFormatter';
import { PreviewTree } from './PreviewTree';

/** Structured output from a preview renderer. */
export interface RenderedPreview {
  /** The format used for this rendering. */
  readonly format: PreviewFormat;
  /** The rendered content as a string. */
  readonly content: string;
  /** Number of nodes represented in the output. */
  readonly nodeCount: number;
}

/**
 * Abstract contract for rendering preview trees into various formats.
 * Implementations may target text, JSON, data objects, or other serialisable
 * representations — but never graphical surfaces.
 */
export interface PreviewRenderer {
  /** Human-readable name of the renderer. */
  readonly name: string;
  /**
   * Render the given tree into the requested format.
   * Returns a {@link RenderedPreview} with the string content and metadata.
   */
  render(tree: PreviewTree, format: PreviewFormat, options?: PreviewOptions): RenderedPreview;
}

/**
 * Default renderer that delegates to the PreviewFormatter functions.
 * Supports TREE, COMPACT, JSON, and TEXT output formats.
 */
export const defaultRenderer: PreviewRenderer = {
  name: 'default',

  render(tree: PreviewTree, format: PreviewFormat, options?: PreviewOptions): RenderedPreview {
    switch (format) {
      case 'JSON': {
        const content = formatJson(tree, options?.maxDepth === 0);
        return { format, content, nodeCount: tree.size() };
      }
      case 'TREE': {
        const content = formatTree(tree, options);
        return { format, content, nodeCount: tree.size() };
      }
      case 'COMPACT': {
        const content = (function formatCompact(t: PreviewTree): string {
          const root = t.getRoot();
          if (!root) return '(empty)';
          const parts: string[] = [];
          const visit = (n: { kind: string; displayName: string; id: string }): void => {
            parts.push(`${n.kind}:${n.displayName}`);
            for (const c of t.getChildren(n.id)) visit(c);
          };
          visit(root);
          return parts.join(' → ');
        })(tree);
        return { format, content, nodeCount: tree.size() };
      }
      case 'TEXT': {
        const content = formatPlainText(tree);
        return { format, content, nodeCount: tree.size() };
      }
    }
  },
};

/**
 * Renderer that returns a plain data object instead of formatted text.
 * Useful for programmatic inspection or hand-off to future exporters.
 */
export const dataRenderer: PreviewRenderer = {
  name: 'data',

  render(tree: PreviewTree): RenderedPreview {
    const content = JSON.stringify(tree.toJSON());
    return { format: 'JSON', content, nodeCount: tree.size() };
  },
};

/**
 * Build a combined renderer that chains multiple renderers and returns
 * all outputs keyed by renderer name.
 */
export function combinedRenderer(renderers: readonly PreviewRenderer[]): (tree: PreviewTree, format: PreviewFormat, options?: PreviewOptions) => Record<string, RenderedPreview> {
  return (tree, format, options) => {
    const result: Record<string, RenderedPreview> = {};
    for (const r of renderers) result[r.name] = r.render(tree, format, options);
    return result;
  };
}
