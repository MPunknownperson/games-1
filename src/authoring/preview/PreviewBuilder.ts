/**
 * PRESERVE Authoring System — Preview Core.
 *
 * PreviewBuilder.ts converts validated authoring data into PreviewTree
 * structures. Supported inputs: schema definitions, IR descriptors, and
 * generation result metadata.
 *
 * The builder inspects structure only. It never executes generated code,
 * never understands gameplay concepts, and never references the engine,
 * gameplay, UI, or runtime.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { SemanticVersion } from '../schema/SchemaTypes';
import type { PreviewOptions, PreviewTarget } from './PreviewTypes';
import { createPreviewNode, PreviewNodeKind } from './PreviewNode';
import { PreviewTree } from './PreviewTree';

/** Internal ID counter for deterministic node naming. */
function makeId(prefix: string, index: number): string {
  return `${prefix}_${index}`;
}

/** Format a semantic version as `major.minor.patch`. */
function fmtVersion(v: SemanticVersion): string {
  return `${v.major}.${v.minor}.${v.patch}`;
}

/** Recursively build a PreviewTree from an IR-like object. */
function buildIRNode(data: Record<string, unknown>, parentId: string | undefined, path: string, counter: { n: number }, opts: PreviewOptions, tree: PreviewTree): void {
  const kind = typeof data.kind === 'string' ? data.kind : 'unknown';
  const name = String(data.name ?? data.fileId ?? kind);
  const nodeId = makeId(kind.toLowerCase(), counter.n++);
  const props: Record<string, string | number | boolean | null> = {};

  for (const [k, v] of Object.entries(data)) {
    if (k === 'kind' || k === 'name' || k === 'fileId') continue;
    if (Array.isArray(v) || (v && typeof v === 'object')) continue;
    props[k] = v === undefined ? null : v as string | number | boolean | null;
  }

  tree.setNode(createPreviewNode({
    id: nodeId, displayName: name,
    kind: mapKindToPreviewNode(kind),
    parentId, properties: props,
  }));

  const childPath = `${path}.${name}`;
  for (const key of ['declarations', 'members', 'fields', 'modules', 'statements', 'imports', 'exports']) {
    const arr = data[key];
    if (Array.isArray(arr)) {
      for (let i = 0; i < arr.length; i++) {
        if (opts.maxSiblings && i >= opts.maxSiblings) {
          tree.setNode(createPreviewNode({
            id: makeId('truncated', counter.n++),
            displayName: `... +${arr.length - i} more`,
            kind: PreviewNodeKind.CUSTOM, parentId: nodeId,
            properties: { index: i, total: arr.length },
          }));
          break;
        }
        const child = arr[i];
        if (child && typeof child === 'object') {
          buildIRNode(child as Record<string, unknown>, nodeId, `${childPath}.${key}`, counter, opts, tree);
        }
      }
    }
  }
}

/** Map a loose IR kind string to a PreviewNodeKind. */
function mapKindToPreviewNode(kind: string): PreviewNodeKind {
  const map: Record<string, PreviewNodeKind> = {
    Module: PreviewNodeKind.MODULE, Namespace: PreviewNodeKind.NAMESPACE,
    Class: PreviewNodeKind.CLASS, Interface: PreviewNodeKind.INTERFACE,
    Enum: PreviewNodeKind.ENUM, Function: PreviewNodeKind.FUNCTION,
    Method: PreviewNodeKind.METHOD, Property: PreviewNodeKind.PROPERTY,
    Variable: PreviewNodeKind.VARIABLE, Constant: PreviewNodeKind.CONSTANT,
    Parameter: PreviewNodeKind.PARAMETER, Expression: PreviewNodeKind.EXPRESSION,
    Literal: PreviewNodeKind.LITERAL, Comment: PreviewNodeKind.COMMENT,
    File: PreviewNodeKind.FILE, Import: PreviewNodeKind.IMPORT,
    Export: PreviewNodeKind.EXPORT, Field: PreviewNodeKind.FIELD,
    Block: PreviewNodeKind.CONTAINER,
  };
  return map[kind] ?? PreviewNodeKind.CUSTOM;
}

/**
 * Convert a preview target (schema, IR, generation result) into a PreviewTree.
 * The builder inspects structure only — no gameplay knowledge, no code execution.
 */
export function buildPreviewTree(target: PreviewTarget, options: PreviewOptions = {}): PreviewTree {
  const tree = new PreviewTree();
  const counter = { n: 0 };

  switch (target.kind) {
    case 'SCHEMA': return buildSchemaTree(target.data as Record<string, unknown>, target.label, counter, options, tree);
    case 'IR': return buildIRTree(target.data as Record<string, unknown>, target.label, counter, options, tree);
    case 'GENERATION': return buildGenerationTree(target.data as Record<string, unknown>, target.label, counter, options, tree);
    default: return buildCustomTree(target.data, target.label, counter, options, tree);
  }
}

/** Build a PreviewTree from a schema definition or array of definitions. */
function buildSchemaTree(data: unknown, label: string | undefined, counter: { n: number }, opts: PreviewOptions, tree: PreviewTree): PreviewTree {
  const rootId = makeId('schema_root', counter.n++);
  tree.setNode(createPreviewNode({
    id: rootId, displayName: label ?? 'Schema Preview',
    kind: PreviewNodeKind.ROOT,
    metadata: { label: label ?? 'Schema Preview' },
    properties: { type: 'schema' },
  }));

  const schemas = Array.isArray(data) ? data : data ? [data] : [];
  for (const schema of schemas) {
    if (!schema || typeof schema !== 'object') continue;
    const s = schema as Record<string, unknown>;
    const nodeId = makeId('schema', counter.n++);
    const version = s.version ? fmtVersion(s.version as SemanticVersion) : 'unknown';
    tree.setNode(createPreviewNode({
      id: nodeId, displayName: String(s.displayName ?? s.name ?? 'unnamed'),
      kind: PreviewNodeKind.SCHEMA, parentId: rootId,
      metadata: { sourceId: String(s.id ?? ''), version, label: String(s.displayName ?? s.name ?? '') },
      properties: { id: String(s.id ?? ''), category: String(s.category ?? ''), version },
    }));
    const fields = Array.isArray(s.fields) ? s.fields : [];
    for (let i = 0; i < (opts.maxSiblings || fields.length); i++) {
      const f = fields[i]; if (!f || typeof f !== 'object') continue;
      const fp = f as Record<string, unknown>;
      tree.setNode(createPreviewNode({
        id: makeId('field', counter.n++),
        displayName: String(fp.name ?? `field_${i}`),
        kind: PreviewNodeKind.FIELD, parentId: nodeId,
        properties: { valueType: String(fp.valueType ?? ''), required: Boolean(fp.required) },
      }));
    }
  }
  return tree;
}

/** Build a PreviewTree from IR data. */
function buildIRTree(data: unknown, label: string | undefined, counter: { n: number }, opts: PreviewOptions, tree: PreviewTree): PreviewTree {
  const rootId = makeId('ir_root', counter.n++);
  tree.setNode(createPreviewNode({
    id: rootId, displayName: label ?? 'IR Preview',
    kind: PreviewNodeKind.ROOT, metadata: { label: label ?? 'IR Preview' },
    properties: { type: 'ir' },
  }));

  if (Array.isArray(data)) {
    for (const item of data) {
      if (item && typeof item === 'object') buildIRNode(item as Record<string, unknown>, rootId, 'root', counter, opts, tree);
    }
  } else if (data && typeof data === 'object') {
    buildIRNode(data as Record<string, unknown>, rootId, 'root', counter, opts, tree);
  }
  return tree;
}

/** Build a PreviewTree from generation result metadata. */
function buildGenerationTree(data: unknown, label: string | undefined, counter: { n: number }, opts: PreviewOptions, tree: PreviewTree): PreviewTree {
  const rootId = makeId('gen_root', counter.n++);
  tree.setNode(createPreviewNode({
    id: rootId, displayName: label ?? 'Generation Preview',
    kind: PreviewNodeKind.ROOT, metadata: { label: label ?? 'Generation Preview' },
    properties: { type: 'generation' },
  }));

  if (data && typeof data === 'object' && 'generatedFiles' in data) {
    const files = (data as { generatedFiles?: unknown }).generatedFiles;
    if (Array.isArray(files)) {
      for (let i = 0; i < files.length; i++) {
        if (opts.maxSiblings && i >= opts.maxSiblings) break;
        const f = files[i] as { path?: string; language?: string; byteCount?: number; format?: string };
        tree.setNode(createPreviewNode({
          id: makeId('file', counter.n++),
          displayName: f.path ?? `file_${i}`,
          kind: PreviewNodeKind.GENERATED_FILE, parentId: rootId,
          properties: { language: String(f.language ?? ''), bytes: f.byteCount ?? 0, format: String(f.format ?? '') },
        }));
      }
    }
  }
  return tree;
}

/** Build a generic PreviewTree for arbitrary payloads. */
function buildCustomTree(data: unknown, label: string | undefined, counter: { n: number }, _opts: PreviewOptions, tree: PreviewTree): PreviewTree {
  const rootId = makeId('custom_root', counter.n++);
  tree.setNode(createPreviewNode({
    id: rootId, displayName: label ?? 'Custom Preview',
    kind: PreviewNodeKind.ROOT, metadata: { label: label ?? 'Custom Preview' },
    properties: { type: 'custom' },
  }));
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      tree.setNode(createPreviewNode({
        id: makeId('custom_prop', counter.n++),
        displayName: k,
        kind: PreviewNodeKind.CUSTOM, parentId: rootId,
        properties: { value: v === undefined ? null : String(v) },
      }));
    }
  }
  return tree;
}
