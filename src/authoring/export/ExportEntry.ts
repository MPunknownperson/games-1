/**
 * PRESERVE Authoring System — Export Core.
 *
 * ExportEntry.ts defines a single exported item. An entry is a *description*:
 * it records what would be exported, where it came from, its format, and its
 * size — but it never reads files, loads content, or touches the runtime.
 *
 * The `checksum` field is a placeholder. This layer computes a deterministic
 * structural digest only; real content hashing belongs to a future module.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { ExportCategory, ExportFormat, ExportMetadata } from './ExportTypes';

/** Where an entry's content originates. Purely a reference, never a handle. */
export interface ExportSourceReference {
  /** The upstream layer that produced this content. */
  readonly origin: 'schema' | 'generation' | 'preview' | 'validation' | 'custom';
  /** Stable identifier within that origin (schema id, request id, node id). */
  readonly sourceId: string;
  /** Optional logical path or locator within the origin. */
  readonly locator?: string;
}

/** Size information recorded for an entry. */
export interface ExportSizeInfo {
  /** Number of bytes the described content occupies, when known. */
  readonly byteCount: number;
  /** Number of discrete items, when the entry describes a collection. */
  readonly itemCount?: number;
}

/**
 * A single described item within an export package.
 * Descriptive data only — no content loading, no runtime references.
 */
export interface ExportEntry {
  /** Stable unique identifier within the package. */
  readonly id: string;
  /** Human-facing name for the entry. */
  readonly name: string;
  /** Classification of what this entry holds. */
  readonly category: ExportCategory;
  /** Where the described content came from. */
  readonly source: ExportSourceReference;
  /** Serialization format the entry would be written in. */
  readonly format: ExportFormat;
  /** Descriptive metadata. */
  readonly metadata: ExportMetadata;
  /** Size information for the described content. */
  readonly size: ExportSizeInfo;
  /**
   * Placeholder digest. Deterministic for identical descriptions; not a
   * cryptographic content hash.
   */
  readonly checksum: string;
}

/** Input accepted when constructing an entry. */
export interface ExportEntryInput {
  id: string;
  name: string;
  category: ExportCategory;
  source: ExportSourceReference;
  format: ExportFormat;
  metadata?: ExportMetadata;
  byteCount?: number;
  itemCount?: number;
}

/**
 * Build an export entry, deriving a deterministic placeholder checksum from
 * the entry's stable descriptive fields.
 */
export function createExportEntry(input: ExportEntryInput): ExportEntry {
  const size: ExportSizeInfo = {
    byteCount: input.byteCount ?? 0,
    itemCount: input.itemCount,
  };
  const metadata: ExportMetadata = input.metadata ?? {};
  return {
    id: input.id,
    name: input.name,
    category: input.category,
    source: { ...input.source },
    format: input.format,
    metadata,
    size,
    checksum: computeChecksum(input.id, input.category, input.format, size.byteCount),
  };
}

/**
 * Compute a deterministic placeholder digest from stable descriptive fields.
 * Identical descriptions always produce an identical value.
 */
export function computeChecksum(
  id: string,
  category: string,
  format: string,
  byteCount: number,
): string {
  const seed = `${id}|${category}|${format}|${byteCount}`;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `d${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/** Compare two entries by identifier, for deterministic ordering. */
export function compareEntries(left: ExportEntry, right: ExportEntry): number {
  return left.id.localeCompare(right.id);
}
