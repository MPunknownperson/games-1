/**
 * PRESERVE Authoring System — Generation Pipeline.
 *
 * GenerationWriter.ts collects generated artifacts in memory and exposes them
 * as {@link GeneratedFile} records. It NEVER writes to the filesystem, opens
 * network sockets, or performs I/O. Backends call the appropriate `write*`
 * method for each artifact; the pipeline hands the collected files to the
 * result factory.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { GeneratedFile, GeneratedFileFormat } from './GenerationResult';

/**
 * Structured, in-memory collector of generated artifacts.
 * Composition-friendly: hold an instance per generation session.
 */
export class GenerationWriter {
  private readonly files = new Map<string, GeneratedFile>();
  private readonly warnings: string[] = [];

  /** Write a plain-text artifact. */
  writeText(path: string, contents: string, language = 'text'): GeneratedFile {
    return this.store(path, language, 'text', contents);
  }

  /** Write a JSON artifact. `value` is serialized with two-space indentation. */
  writeJson(path: string, value: unknown, language = 'json'): GeneratedFile {
    const contents = JSON.stringify(value, null, 2);
    return this.store(path, language, 'json', contents);
  }

  /**
   * Write a YAML artifact. Full YAML serialization arrives in a later phase;
   * the current implementation stores a deterministic JSON preview so the
   * writer contract is stable and callers can rely on the format tag today.
   */
  writeYaml(path: string, value: unknown, language = 'yaml'): GeneratedFile {
    const preview = `# yaml-preview\n${JSON.stringify(value, null, 2)}\n`;
    this.warnings.push(`YAML serialization is pending; wrote JSON preview for "${path}".`);
    return this.store(path, language, 'yaml', preview);
  }

  /**
   * Write a binary artifact. The bytes are base64-encoded so results remain
   * JSON-serializable; a downstream sink can decode when writing to disk.
   */
  writeBinary(path: string, data: Uint8Array | ArrayBuffer, language = 'binary'): GeneratedFile {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const contents = bytesToBase64(bytes);
    this.warnings.push(`Binary output is stored as base64 for "${path}".`);
    const file: GeneratedFile = { path, language, format: 'binary', contents, byteCount: bytes.byteLength };
    this.files.set(path, file);
    return file;
  }

  /** Enumerate every stored artifact. */
  getFiles(): readonly GeneratedFile[] {
    return Array.from(this.files.values());
  }

  /** Enumerate warnings accumulated during writing. */
  getWarnings(): readonly string[] {
    return [...this.warnings];
  }

  /** Whether an artifact exists for the given path. */
  has(path: string): boolean {
    return this.files.has(path);
  }

  /** Number of stored artifacts. */
  size(): number {
    return this.files.size;
  }

  /** Reset the writer to an empty state. */
  clear(): void {
    this.files.clear();
    this.warnings.length = 0;
  }

  /** Shared storage helper for text-shaped formats. */
  private store(path: string, language: string, format: GeneratedFileFormat, contents: string): GeneratedFile {
    const byteCount = utf8ByteCount(contents);
    const file: GeneratedFile = { path, language, format, contents, byteCount };
    this.files.set(path, file);
    return file;
  }
}

/** Count the UTF-8 bytes represented by a JavaScript string. */
function utf8ByteCount(str: string): number {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str).byteLength;
  let count = 0;
  for (let i = 0; i < str.length; i += 1) {
    const code = str.charCodeAt(i);
    if (code < 0x80) count += 1;
    else if (code < 0x800) count += 2;
    else count += 3;
  }
  return count;
}

/** Encode raw bytes as base64 without relying on any environment library. */
function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const b1 = bytes[i];
    const b2 = bytes[i + 1];
    const b3 = bytes[i + 2];
    out += alphabet[b1 >> 2];
    out += alphabet[((b1 & 3) << 4) | (b2 >> 4)];
    out += alphabet[((b2 & 15) << 2) | (b3 >> 6)];
    out += alphabet[b3 & 63];
  }
  if (i < bytes.length) {
    const b1 = bytes[i];
    const b2 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    out += alphabet[b1 >> 2];
    out += alphabet[((b1 & 3) << 4) | (b2 >> 4)];
    out += i + 1 < bytes.length ? alphabet[(b2 & 15) << 2] : '=';
    out += '=';
  }
  return out;
}
