# PRESERVE Authoring — Export Core

A development-only export layer that converts validated authoring outputs into
**deterministic export package descriptions**.

This is **NOT** a publishing system, **NOT** a distribution system, and
**NOT** a deployment pipeline. It contains no Steam upload, App Store
submission, Google Play publishing, CDN upload, cloud storage, build
automation, installer generation, runtime packaging, or executable generation.

The Export Core only *describes* what would be exported. It never writes to
disk, never opens a socket, and never touches the runtime game.

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
Preview
  ↓
Exporter        ←  you are here
```

The Exporter is the final stage. It consumes data that has already been
generated, validated, and previewed, then produces a manifest describing the
package plus in-memory serialized representations.

## Relationship with Validator

The Validation layer checks **authoring data** (schemas, IR, generated source).
The Export layer checks **package structure** via its own `ExportValidator`:
manifest completeness, duplicate entry identifiers, missing metadata, invalid
dependency declarations, and unsupported formats.

These are separate concerns and the two validators never call each other. A
validation report produced upstream can itself be *described* as an export
entry, so a package can carry its own quality evidence.

## Relationship with Preview

Preview produces inspectable trees and immutable `PreviewSnapshot` objects.
The Export builder accepts those snapshots and describes each one as an entry
(`category: PREVIEW`), recording the source identifier, node count, and
capture timestamp — without re-reading or re-walking the tree.

## Export flow

1. **ExportBuilder** inspects upstream outputs (generation results, preview
   snapshots, validation reports, schema metadata) and produces `ExportEntry`
   descriptions inside an `ExportPackage`.
2. **ExportPackage** holds identity, entries, and dependencies, and can emit an
   `ExportManifest` with deterministic ordering.
3. **ExportValidator** checks the manifest's structure.
4. **ExportWriter** renders the manifest into in-memory documents (JSON, text,
   or summary). Nothing is written to disk.
5. **ExportSession** drives the lifecycle and produces an immutable
   `ExportResult`.

## File responsibilities

| File | Responsibility |
| --- | --- |
| `ExportTypes.ts` | `ExportFormat`, `ExportTarget`, `ExportStatus`, `ExportMode`, `ExportCategory`, `ExportVersion`, `ExportAuthor`, `ExportDependency`, `ExportCompatibility`, `ExportMetadata`, `ExportOptions`. All JSON-serializable, no filesystem assumptions. |
| `ExportEntry.ts` | One described item: identifier, name, category, source reference, format, metadata, size info, and a deterministic checksum placeholder. Descriptive data only — no file reading, no content loading. |
| `ExportManifest.ts` | Manifest structure describing package identity, version, author, creation metadata, entries, dependencies, and compatibility. Deterministic ordering; JSON and text rendering. Describes only — never exports. |
| `ExportPackage.ts` | Container with `addEntry` / `setEntry` / `removeEntry` / `getEntry` / `listEntries`, dependency management, and `toManifest()`. Rejects duplicate identifiers via `DuplicateEntryError`. |
| `ExportBuilder.ts` | Converts generation results, preview snapshots, validation reports, and schema metadata into packages. Never compiles, executes, writes, uploads, or mutates its inputs. |
| `ExportWriter.ts` | In-memory rendering to JSON, plain text, and summary formats. No disk writing, no network upload, no archive creation. |
| `ExportResult.ts` | Immutable outcome: success flag, outcome tag, warnings, errors, manifest, package info, content, and execution metadata. |
| `ExportSession.ts` | Lifecycle: `CREATED → PREPARING → VALIDATING → EXPORTING → COMPLETED / FAILED / CANCELLED`. Attach package, update progress, complete, fail, cancel. No global state. |
| `ExportValidator.ts` | Structural validation of manifests: completeness, duplicate identifiers, missing metadata, invalid dependencies, unsupported formats. Never validates gameplay, balance, graphics, or runtime behaviour. |

## Why this is not publishing or deployment

| Export Core | Publishing / Deployment |
| --- | --- |
| Describes package contents | Transfers artifacts to a store or server |
| Produces manifests and in-memory documents | Produces installers, archives, binaries |
| Zero filesystem access | Writes build outputs to disk |
| Zero network access | Uploads to CDN, Steam, App Store, Play |
| Runs during development only | Runs in release pipelines |
| Tree-shaken from production bundles | Part of the shipping process |

## Quick start

```ts
import { buildExportPackage } from './ExportBuilder';
import { createExportSession } from './ExportSession';
import { validateExportManifest, formatExportValidation } from './ExportValidator';
import { createExportVersion, ExportFormat } from './ExportTypes';

// 1. Describe upstream outputs as an export package
const pkg = buildExportPackage({
  packageId: 'demo.package',
  options: {
    packageName: 'Demo Package',
    version: createExportVersion(1, 2, 0),
    author: { name: 'authoring-team' },
  },
  generationResults: [generationResult],   // from the Generation Pipeline
  previewSnapshots: [previewSnapshot],     // from the Preview layer
  validationReports: [validationReport],   // from the Validation layer
  schemas: [schemaDefinition],             // from the Schema layer
});

// 2. Validate the manifest's structure
const manifest = pkg.toManifest('2024-01-01T00:00:00.000Z');
const check = validateExportManifest(manifest);
console.log(formatExportValidation(check));

// 3. Run the session lifecycle
const session = createExportSession('demo');
session.attachPackage(pkg);
const result = session.complete({
  format: ExportFormat.JSON,
  timestamp: '2024-01-01T00:00:00.000Z',
});

console.log(result.success);                  // true
console.log(result.packageInfo?.entryCount);  // number of described entries
console.log(result.content);                  // serialized manifest JSON
```

Duplicate detection:

```ts
pkg.addEntry(entry);
pkg.addEntry(entry);   // throws DuplicateEntryError
```

Deterministic output — identical inputs plus a fixed timestamp always produce
byte-identical JSON:

```ts
const a = pkg.toManifest('2024-01-01T00:00:00.000Z');
const b = pkg.toManifest('2024-01-01T00:00:00.000Z');
JSON.stringify(a) === JSON.stringify(b);   // true
```

## Guarantees

- **Description only** — no publishing, distribution, deployment, or packaging.
- **Structure only** — zero knowledge of towers, enemies, weapons, damage,
  health, levels, themes, balancing, game rules, or UI.
- **Deterministic** — entries and dependencies sort by identifier; supply a
  timestamp for byte-stable serialization.
- **Serializable** — every entry, manifest, package, and result is plain JSON data.
- **Immutable results** — `ExportResult` objects are never mutated after creation.
- **No global mutable state** — each package, writer, and session owns its data.
- **No filesystem or network access** — everything operates on in-memory values.
- **Composition over inheritance** — sessions hold packages; writers hold
  documents; nothing subclasses.
- **AI-friendly** — every file under 250 lines, every function under 60 lines,
  every exported interface documented.

## Out of scope

No publishing system, distribution system, deployment system, build pipeline,
asset pipeline, runtime loader, editor UI, export window, or cloud integration.
