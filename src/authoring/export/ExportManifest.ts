/**
 * PRESERVE Authoring System — Export Core.
 *
 * ExportManifest.ts describes the contents of an export package: identity,
 * version, authorship, creation metadata, entries, dependencies, and
 * compatibility.
 *
 * The manifest *describes* exported content. It never performs exporting,
 * never writes files, and never touches the runtime.
 *
 * Ordering is deterministic: entries and dependencies are sorted by
 * identifier so identical inputs always yield identical serialized output.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import { compareEntries, type ExportEntry } from './ExportEntry';
import {
  createExportVersion,
  type ExportAuthor,
  type ExportCompatibility,
  type ExportDependency,
  type ExportMetadata,
  type ExportVersion,
} from './ExportTypes';

/** Version of the manifest format itself. */
export const MANIFEST_FORMAT_VERSION: ExportVersion = createExportVersion(1, 0, 0);

/** Serializable manifest describing one export package. */
export interface ExportManifest {
  /** Version of the manifest format. */
  readonly manifestVersion: ExportVersion;
  /** Stable unique identifier of the package. */
  readonly packageId: string;
  /** Human-facing package name. */
  readonly packageName: string;
  /** Version of the package contents. */
  readonly version: ExportVersion;
  /** Authorship details. */
  readonly author: ExportAuthor;
  /** ISO-8601 timestamp recorded when the manifest was created. */
  readonly createdAt: string;
  /** Descriptive metadata. */
  readonly metadata: ExportMetadata;
  /** Described entries, sorted by identifier. */
  readonly entries: readonly ExportEntry[];
  /** Declared dependencies, sorted by identifier. */
  readonly dependencies: readonly ExportDependency[];
  /** Declared compatibility window. */
  readonly compatibility: ExportCompatibility;
  /** Total number of described entries. */
  readonly entryCount: number;
  /** Sum of `byteCount` across all described entries. */
  readonly totalByteCount: number;
}

/** Input accepted when constructing a manifest. */
export interface ExportManifestInput {
  packageId: string;
  packageName?: string;
  version?: ExportVersion;
  author?: ExportAuthor;
  metadata?: ExportMetadata;
  entries?: readonly ExportEntry[];
  dependencies?: readonly ExportDependency[];
  compatibility?: ExportCompatibility;
  /** Fixed ISO-8601 timestamp, making the manifest byte-stable. */
  timestamp?: string;
  /** Sort entries and dependencies by identifier. Defaults to true. */
  sorted?: boolean;
}

/** Author recorded when none is supplied. */
export const UNKNOWN_AUTHOR: ExportAuthor = { name: 'unknown' };

/**
 * Build a complete {@link ExportManifest}.
 * Deterministic when `timestamp` is supplied and `sorted` is enabled.
 */
export function createExportManifest(input: ExportManifestInput): ExportManifest {
  const sorted = input.sorted ?? true;
  const entries = input.entries ? [...input.entries] : [];
  const dependencies = input.dependencies ? [...input.dependencies] : [];
  if (sorted) {
    entries.sort(compareEntries);
    dependencies.sort((a, b) => a.id.localeCompare(b.id));
  }
  return {
    manifestVersion: MANIFEST_FORMAT_VERSION,
    packageId: input.packageId,
    packageName: input.packageName ?? input.packageId,
    version: input.version ?? createExportVersion(1, 0, 0),
    author: input.author ?? UNKNOWN_AUTHOR,
    createdAt: input.timestamp ?? new Date().toISOString(),
    metadata: input.metadata ?? {},
    entries,
    dependencies,
    compatibility: input.compatibility ?? {},
    entryCount: entries.length,
    totalByteCount: entries.reduce((sum, entry) => sum + entry.size.byteCount, 0),
  };
}

/** Serialize a manifest to a deterministic JSON string. */
export function manifestToJson(manifest: ExportManifest, pretty = true): string {
  return JSON.stringify(manifest, null, pretty ? 2 : 0);
}

/**
 * Render a manifest as a compact, human-readable text listing.
 * Formatting only; the manifest is never modified.
 */
export function manifestToText(manifest: ExportManifest): string {
  const v = manifest.version;
  const lines: string[] = [
    `Package: ${manifest.packageName} (${manifest.packageId})`,
    `Version: ${v.major}.${v.minor}.${v.patch}`,
    `Author:  ${manifest.author.name}`,
    `Created: ${manifest.createdAt}`,
    `Entries: ${manifest.entryCount} (${manifest.totalByteCount} bytes)`,
  ];
  if (manifest.dependencies.length > 0) {
    lines.push('Dependencies:');
    for (const dep of manifest.dependencies) {
      const optional = dep.optional ? ' (optional)' : '';
      lines.push(`  - ${dep.id}${optional}`);
    }
  }
  if (manifest.entries.length > 0) {
    lines.push('Contents:');
    for (const entry of manifest.entries) {
      lines.push(`  [${entry.category}] ${entry.name} — ${entry.format}, ${entry.size.byteCount} bytes`);
    }
  }
  return lines.join('\n');
}
