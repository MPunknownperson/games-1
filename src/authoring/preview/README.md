# PRESERVE Authoring — Preview Core

A development-only preview layer for inspecting **generated authoring results**.
It produces structured, deterministic, JSON-serialisable representations of
schema definitions, IR trees, and generation outputs.

This is **NOT** runtime game rendering. It does not create UI components,
React elements, canvas surfaces, WebGL scenes, engine integrations, gameplay
simulations, asset loaders, or editor windows.

## Architecture position

```
Schema
  ↓
Generator Pipeline
  ↓
IR
  ↓
Backend
  ↓
Validator
  ↓
Preview        ←  you are here
  ↓
Exporter       ←  future
```

The Preview sits **after** Validation. It only consumes data that has already
passed structural validation and turns it into an inspectable tree with
formatted output, snapshots, and session tracking.

## Data flow

1. **Input** — a `PreviewTarget` (schema, IR, generation result, or custom data).
2. **PreviewBuilder** — inspects the payload's structure and builds a `PreviewTree`.
3. **PreviewFormatter** — produces tree text, compact summaries, JSON, or plain text.
4. **PreviewRenderer** — abstract contract wrapping the formatter; extensible for future output targets.
5. **PreviewSession** — attaches a tree, captures immutable snapshots, compares changes, and manages lifecycle.

## File responsibilities

| File | Responsibility |
| --- | --- |
| `PreviewTypes.ts` | Shared contracts: `PreviewKind`, `PreviewFormat`, `PreviewStatus`, `PreviewMetadata`, `PreviewOptions`, `PreviewTarget`. All JSON-serialisable; no runtime-specific types. |
| `PreviewNode.ts` | Smallest preview unit: `id`, `displayName`, `kind`, `metadata`, `parentId`, `children`, `properties`. Pure data — no functions, no gameplay semantics. |
| `PreviewTree.ts` | Container managing node insertion, O(1) lookup, depth-first traversal, kind-filtering, text search, and deterministic JSON serialisation. |
| `PreviewBuilder.ts` | Converts validated authoring data (schemas, IR, generation results) into a `PreviewTree`. Inspects structure only — no code execution, no gameplay knowledge. |
| `PreviewFormatter.ts` | Human-readable output: tree indentation, compact summaries, JSON, plain-text listings. Formatting only — no semantic transformation. |
| `PreviewRenderer.ts` | Abstract rendering contract (`PreviewRenderer` interface) with `defaultRenderer` (delegates to formatter) and `dataRenderer` (returns a plain data object). No canvas, DOM, React, or WebGL. |
| `PreviewSnapshot.ts` | Immutable snapshot: timestamp, source identifier, version info, serialised tree. Supports creation from tree, comparison between snapshots, and JSON export. |
| `PreviewSession.ts` | Session lifecycle: create, attach tree, update snapshot, close. Tracks `BUILDING → READY → STALE → CLOSED`. No global mutable state. |

## Why this is not runtime rendering

| Preview Core | Runtime Rendering |
| --- | --- |
| Inspects authoring data structures | Renders gameplay to screen |
| Outputs text / JSON / data objects | Outputs pixels to canvas / DOM / WebGL |
| Runs during development only | Runs during gameplay |
| Tree-shaken from production bundles | Shipped to players |
| Zero canvas / DOM / React dependencies | Depends on canvas / DOM / React |

## Quick start

```ts
import { buildPreviewTree } from './PreviewBuilder';
import { PreviewFormatter } from './PreviewFormatter';
import { createPreviewSession } from './PreviewSession';
import { PreviewFormat } from './PreviewTypes';

// 1. Build a preview from IR data
const irData = { kind: 'Class', name: 'Example', members: [] };
const tree = buildPreviewTree({ kind: 'IR', data: irData });

// 2. Format for inspection
console.log(PreviewFormatter.formatTree(tree));
// [ROOT] IR Preview  (type=ir)
//   [CLASS] Example

// 3. Manage a session with snapshots
const session = createPreviewSession('demo');
session.attachTree(tree, 'example.class');
console.log(session.exportSnapshot());

// 4. Compare after an update
session.attachTree(buildPreviewTree({
  kind: 'IR', data: { kind: 'Class', name: 'Example', members: [{ kind: 'Method', name: 'run' }] }
}), 'example.class');
console.log(session.compareLastSnapshots());
// { identical: false, nodeCountDiff: 1 }
```

## Guarantees

- **Structure only** — zero knowledge of towers, enemies, weapons, damage, health, levels, themes, balancing, game rules, or UI.
- **Deterministic** — identical input produces identical preview output; supply a timestamp for byte-stable serialisation.
- **Serializable** — every node, tree, snapshot, and session export is plain JSON data.
- **No global mutable state** — each `PreviewTree` and `PreviewSession` owns its data.
- **No filesystem or network access** — everything operates on in-memory values.
- **Composition over inheritance** — sessions hold trees; renderers wrap formatters; nothing subclasses.
- **AI-friendly** — every file under 250 lines, every function under 60 lines, every exported interface documented.

## Out of scope

No Preview Editor, Preview Window, React components, UI panels, asset previewers, gameplay simulators, Export system, or Template system. Those are future modules.
