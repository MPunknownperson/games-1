/**
 * PRESERVE Authoring System — Export Core.
 *
 * ExportWriter.ts produces structured output representations of an export
 * package. It is an in-memory serializer only: no disk writing, no network
 * upload, no archive creation, no filesystem access of any kind.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import { manifestToJson, manifestToText, type ExportManifest } from './ExportManifest';
import type { ExportPackage } from './ExportPackage';
import {
  DEFAULT_EXPORT_OPTIONS,
  ExportFormat,
  formatExportVersion,
  type ExportOptions,
} from './ExportTypes';

/** One produced output document held in memory. */
export interface ExportDocument {
  /** Logical name for the document. Never a filesystem path. */
  readonly name: string;
  /** Format the content was rendered in. */
  readonly format: ExportFormat;
  /** Rendered content. */
  readonly content: string;
  /** Length of `content` in UTF-8 bytes. */
  readonly byteCount: number;
}

/**
 * In-memory collector of rendered export documents.
 * Composition-friendly: create one per export operation.
 */
export class ExportWriter {
  private readonly documents = new Map<string, ExportDocument>();

  /** Render a manifest as JSON and store it. */
  writeManifestJson(manifest: ExportManifest, pretty = true, name = 'manifest.json'): ExportDocument {
    return this.store(name, ExportFormat.JSON, manifestToJson(manifest, pretty));
  }

  /** Render a manifest as a plain-text listing and store it. */
  writeManifestText(manifest: ExportManifest, name = 'manifest.txt'): ExportDocument {
    return this.store(name, ExportFormat.TEXT, manifestToText(manifest));
  }

  /** Render a one-line-per-entry summary and store it. */
  writeSummary(manifest: ExportManifest, name = 'summary.txt'): ExportDocument {
    const header = `${manifest.packageId} v${formatExportVersion(manifest.version)} — ${manifest.entryCount} entries`;
    const rows = manifest.entries.map(
      (entry) => `${entry.category}\t${entry.id}\t${entry.format}\t${entry.size.byteCount}\t${entry.checksum}`,
    );
    return this.store(name, ExportFormat.SUMMARY, [header, ...rows].join('\n'));
  }

  /** Store an arbitrary pre-rendered document. */
  writeDocument(name: string, format: ExportFormat, content: string): ExportDocument {
    return this.store(name, format, content);
  }

  /** Retrieve a stored document by name. */
  getDocument(name: string): ExportDocument | undefined {
    return this.documents.get(name);
  }

  /** List every stored document, sorted by name for deterministic ordering. */
  listDocuments(): readonly ExportDocument[] {
    return Array.from(this.documents.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Number of stored documents. */
  size(): number {
    return this.documents.size;
  }

  /** Remove every stored document. */
  clear(): void {
    this.documents.clear();
  }

  /** Store a document, computing its byte length. */
  private store(name: string, format: ExportFormat, content: string): ExportDocument {
    const document: ExportDocument = {
      name,
      format,
      content,
      byteCount: utf8ByteCount(content),
    };
    this.documents.set(name, document);
    return document;
  }
}

/**
 * Render a package into documents according to the supplied options.
 * Returns the writer holding every produced document.
 */
export function writeExportPackage(
  pkg: ExportPackage,
  options: ExportOptions = {},
): { writer: ExportWriter; manifest: ExportManifest } {
  const resolved = { ...DEFAULT_EXPORT_OPTIONS, ...options };
  const manifest = pkg.toManifest(options.timestamp);
  const writer = new ExportWriter();

  if (resolved.mode === 'DESCRIBE') return { writer, manifest };

  if (resolved.mode === 'MANIFEST_ONLY') {
    writer.writeManifestJson(manifest, resolved.pretty);
    return { writer, manifest };
  }

  switch (resolved.format) {
    case ExportFormat.TEXT:
      writer.writeManifestText(manifest);
      break;
    case ExportFormat.SUMMARY:
      writer.writeSummary(manifest);
      break;
    default:
      writer.writeManifestJson(manifest, resolved.pretty);
      break;
  }
  return { writer, manifest };
}

/** Count the UTF-8 bytes represented by a JavaScript string. */
function utf8ByteCount(text: string): number {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).byteLength;
  let count = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) count += 1;
    else if (code < 0x800) count += 2;
    else count += 3;
  }
  return count;
}
