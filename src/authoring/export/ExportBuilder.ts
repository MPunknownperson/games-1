/**
 * PRESERVE Authoring System — Export Core.
 *
 * ExportBuilder.ts converts validated authoring outputs into export packages.
 * Supported inputs: preview snapshots, validation reports, generation results,
 * and schema metadata.
 *
 * The builder inspects existing data and produces descriptions. It never
 * compiles code, executes generated code, writes files, uploads data, or
 * modifies its inputs. It has no gameplay knowledge whatsoever.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import { createExportEntry, type ExportEntry } from './ExportEntry';
import { ExportPackage, type ExportPackageOptions } from './ExportPackage';
import { ExportCategory, ExportFormat } from './ExportTypes';

/** Loose structural view of a generation result. */
interface GenerationLike {
  readonly requestId?: unknown;
  readonly backendName?: unknown;
  readonly generatedFiles?: unknown;
}

/** Loose structural view of a preview snapshot. */
interface SnapshotLike {
  readonly sourceId?: unknown;
  readonly timestamp?: unknown;
  readonly nodeCount?: unknown;
}

/** Loose structural view of a validation report payload. */
interface ValidationLike {
  readonly title?: unknown;
  readonly summary?: unknown;
  readonly results?: unknown;
}

/** Loose structural view of a schema definition. */
interface SchemaLike {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly displayName?: unknown;
  readonly category?: unknown;
  readonly fields?: unknown;
}

/** Read a string field defensively, returning a fallback when absent. */
function str(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

/** Read a numeric field defensively, returning a fallback when absent. */
function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Describe the files of a generation result as export entries.
 * Reads only the descriptive fields; file contents are measured, never loaded.
 */
export function entriesFromGenerationResult(result: unknown): readonly ExportEntry[] {
  if (!result || typeof result !== 'object') return [];
  const source = result as GenerationLike;
  const files = source.generatedFiles;
  if (!Array.isArray(files)) return [];
  const requestId = str(source.requestId, 'unknown-request');
  return files.map((raw, index) => {
    const file = (raw ?? {}) as { path?: unknown; language?: unknown; byteCount?: unknown };
    const path = str(file.path, `file_${index}`);
    return createExportEntry({
      id: `source:${path}`,
      name: path,
      category: ExportCategory.SOURCE,
      format: ExportFormat.SOURCE,
      source: { origin: 'generation', sourceId: requestId, locator: path },
      byteCount: num(file.byteCount, 0),
      metadata: {
        label: path,
        properties: {
          language: str(file.language, 'unknown'),
          backend: str(source.backendName, 'unknown'),
        },
      },
    });
  });
}

/** Describe a preview snapshot as a single export entry. */
export function entryFromPreviewSnapshot(snapshot: unknown): ExportEntry | undefined {
  if (!snapshot || typeof snapshot !== 'object') return undefined;
  const snap = snapshot as SnapshotLike;
  const sourceId = str(snap.sourceId, 'unknown-preview');
  const nodeCount = num(snap.nodeCount, 0);
  return createExportEntry({
    id: `preview:${sourceId}`,
    name: `${sourceId} preview`,
    category: ExportCategory.PREVIEW,
    format: ExportFormat.JSON,
    source: { origin: 'preview', sourceId },
    itemCount: nodeCount,
    metadata: {
      label: `${sourceId} preview`,
      properties: { nodeCount, capturedAt: str(snap.timestamp, 'unknown') },
    },
  });
}

/** Describe a validation report as a single export entry. */
export function entryFromValidationReport(report: unknown): ExportEntry | undefined {
  if (!report || typeof report !== 'object') return undefined;
  const payload = report as ValidationLike;
  const title = str(payload.title, 'Validation Report');
  const summary = (payload.summary ?? {}) as Record<string, unknown>;
  const results = Array.isArray(payload.results) ? payload.results.length : 0;
  return createExportEntry({
    id: `validation:${title}`,
    name: title,
    category: ExportCategory.VALIDATION,
    format: ExportFormat.JSON,
    source: { origin: 'validation', sourceId: title },
    itemCount: results,
    metadata: {
      label: title,
      properties: {
        errors: num(summary.errors, 0),
        warnings: num(summary.warnings, 0),
        success: summary.success === true,
      },
    },
  });
}

/** Describe a schema definition as a single export entry. */
export function entryFromSchema(schema: unknown): ExportEntry | undefined {
  if (!schema || typeof schema !== 'object') return undefined;
  const payload = schema as SchemaLike;
  const id = str(payload.id, 'unknown-schema');
  const fields = Array.isArray(payload.fields) ? payload.fields.length : 0;
  return createExportEntry({
    id: `schema:${id}`,
    name: str(payload.displayName, str(payload.name, id)),
    category: ExportCategory.SCHEMA,
    format: ExportFormat.JSON,
    source: { origin: 'schema', sourceId: id },
    itemCount: fields,
    metadata: {
      label: str(payload.displayName, id),
      properties: { category: str(payload.category, 'unknown'), fieldCount: fields },
    },
  });
}

/** Inputs accepted when assembling a package. */
export interface ExportBuildInput {
  /** Stable package identifier. */
  packageId: string;
  /** Package-level options such as name, version, and author. */
  options?: ExportPackageOptions;
  /** Generation results whose files should be described. */
  generationResults?: readonly unknown[];
  /** Preview snapshots to describe. */
  previewSnapshots?: readonly unknown[];
  /** Validation reports to describe. */
  validationReports?: readonly unknown[];
  /** Schema definitions to describe. */
  schemas?: readonly unknown[];
}

/**
 * Assemble an {@link ExportPackage} from validated authoring outputs.
 *
 * Entries are added with `setEntry` so repeated descriptions of the same
 * artifact collapse rather than throwing; use {@link ExportValidator} to
 * surface genuine duplicate-identifier problems.
 */
export function buildExportPackage(input: ExportBuildInput): ExportPackage {
  const pkg = new ExportPackage(input.packageId, input.options);

  for (const result of input.generationResults ?? []) {
    for (const entry of entriesFromGenerationResult(result)) pkg.setEntry(entry);
  }
  for (const snapshot of input.previewSnapshots ?? []) {
    const entry = entryFromPreviewSnapshot(snapshot);
    if (entry) pkg.setEntry(entry);
  }
  for (const report of input.validationReports ?? []) {
    const entry = entryFromValidationReport(report);
    if (entry) pkg.setEntry(entry);
  }
  for (const schema of input.schemas ?? []) {
    const entry = entryFromSchema(schema);
    if (entry) pkg.setEntry(entry);
  }
  return pkg;
}
