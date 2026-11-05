/**
 * PRESERVE Authoring System — Intermediate Representation (IR) layer.
 *
 * IRFile.ts defines the descriptor for a single file-level unit within the IR.
 * A file groups modules, namespaces, and declarations that share a common
 * filesystem (or virtual-output) identity. The descriptor never implies any
 * syntax format, line breaks, or file-system mutation.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { ModuleDescriptor } from './IRModule';

/** Descriptor for a file-level unit in the intermediate representation. */
export interface FileDescriptor {
  readonly kind: 'File';
  /** Stable file identifier (logical path, not a filesystem path). */
  readonly fileId: string;
  /** Human-facing label for the file. */
  readonly displayName?: string;
  /** Module descriptors contained within the file. */
  readonly modules?: readonly ModuleDescriptor[];
  /** Optional documentation describing the file's purpose. */
  readonly documentation?: string;
  /** Tags for grouping and lookup. */
  readonly tags?: readonly string[];
  /** Optional metadata about encoding or format preferences. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}
