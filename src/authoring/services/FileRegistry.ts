/**
 * PRESERVE Authoring System — file metadata registry.
 *
 * Maintains metadata about files ONLY. It never scans, reads, or modifies the
 * filesystem. Future modules use it to record and query information about the
 * files they care about, while the actual files on disk remain authoritative.
 */
import type { FileKind, FileMetadata } from '../types/AuthoringTypes';

/** Input accepted when registering a file entry. */
export interface FileRegistrationInput {
  /** Logical path of the file. Used as the entry id by default. */
  path: string;
  /** Optional classification; defaults to 'unknown'. */
  kind?: FileKind;
  /** Optional freeform tags for later filtering. */
  tags?: string[];
  /** Optional human-readable description. */
  description?: string;
}

/**
 * In-memory registry of {@link FileMetadata}. Composition-friendly and free of
 * any filesystem side effects.
 */
export class FileRegistry {
  private readonly entries = new Map<string, FileMetadata>();

  /**
   * Register (or replace) metadata for a file.
   * @returns the stored metadata record.
   */
  register(input: FileRegistrationInput): FileMetadata {
    const id = input.path;
    const metadata: FileMetadata = {
      id,
      path: input.path,
      kind: input.kind ?? 'unknown',
      tags: input.tags ? [...input.tags] : [],
      description: input.description,
      registeredAt: Date.now(),
    };
    this.entries.set(id, metadata);
    return metadata;
  }

  /** Remove an entry by id. Returns true if an entry was removed. */
  unregister(id: string): boolean {
    return this.entries.delete(id);
  }

  /** Look up an entry by id. */
  get(id: string): FileMetadata | undefined {
    return this.entries.get(id);
  }

  /** Look up an entry by path (path is the default id). */
  getByPath(path: string): FileMetadata | undefined {
    return this.entries.get(path);
  }

  /** Whether an entry with the given id exists. */
  has(id: string): boolean {
    return this.entries.has(id);
  }

  /** List all registered entries. */
  list(): readonly FileMetadata[] {
    return Array.from(this.entries.values());
  }

  /** List entries matching a specific kind. */
  listByKind(kind: FileKind): readonly FileMetadata[] {
    return this.list().filter((entry) => entry.kind === kind);
  }

  /** Remove all entries. */
  clear(): void {
    this.entries.clear();
  }

  /** Number of registered entries. */
  size(): number {
    return this.entries.size;
  }
}
