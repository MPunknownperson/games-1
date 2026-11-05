/**
 * PRESERVE Authoring System — Generation Pipeline.
 *
 * GenerationResult.ts defines the outcome type produced by the pipeline and
 * consumed by callers. Results are plain, serializable data suitable for JSON
 * export, logging, and future report exchange with other tools.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */

/** Format used for a single generated file's contents. */
export type GeneratedFileFormat = 'text' | 'json' | 'yaml' | 'binary';

/**
 * One artifact produced by a backend. Contents are always stored as a string
 * so results remain JSON-serializable; binary payloads are base64-encoded.
 */
export interface GeneratedFile {
  readonly path: string;
  readonly language: string;
  readonly format: GeneratedFileFormat;
  readonly contents: string;
  readonly byteCount: number;
}

/** Aggregate counts and timing for a single generation job. */
export interface GenerationStatistics {
  readonly fileCount: number;
  readonly byteCount: number;
  readonly warningCount: number;
  readonly errorCount: number;
  readonly durationMs: number;
}

/** Categorises the outcome of a single dispatch. */
export type GenerationOutcome = 'success' | 'failure' | 'cancelled';

/**
 * Structured outcome of one generation job. `success` mirrors
 * `outcome === 'success'` and is kept for convenience.
 */
export interface GenerationResult {
  readonly requestId: string;
  readonly backendName: string;
  readonly outcome: GenerationOutcome;
  readonly success: boolean;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly generatedFiles: readonly GeneratedFile[];
  readonly executionTimeMs: number;
  readonly statistics: GenerationStatistics;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly generatedAt: string;
}

/** Inputs accepted by every result factory. */
export interface ResultInput {
  requestId: string;
  backendName: string;
  files?: readonly GeneratedFile[];
  warnings?: readonly string[];
  errors?: readonly string[];
  executionTimeMs: number;
  metadata?: Record<string, unknown>;
  /** Fixed ISO-8601 timestamp for deterministic output. */
  timestamp?: string;
}

/** Build a success result. */
export function createSuccessResult(input: ResultInput): GenerationResult {
  return buildResult('success', input);
}

/** Build a failure result. */
export function createFailureResult(input: ResultInput): GenerationResult {
  return buildResult('failure', input);
}

/** Build a cancellation result. */
export function createCancelledResult(input: ResultInput): GenerationResult {
  return buildResult('cancelled', input);
}

/** Serialize a result to a JSON string. */
export function resultToJson(result: GenerationResult, pretty = true): string {
  return JSON.stringify(result, null, pretty ? 2 : 0);
}

/** Compute statistics from a set of files, warnings, and errors. */
function computeStatistics(
  files: readonly GeneratedFile[],
  warnings: readonly string[],
  errors: readonly string[],
  durationMs: number,
): GenerationStatistics {
  const byteCount = files.reduce((sum, file) => sum + file.byteCount, 0);
  return {
    fileCount: files.length,
    byteCount,
    warningCount: warnings.length,
    errorCount: errors.length,
    durationMs,
  };
}

/** Shared factory used by every outcome-specific constructor. */
function buildResult(outcome: GenerationOutcome, input: ResultInput): GenerationResult {
  const files = input.files ?? [];
  const warnings = input.warnings ?? [];
  const errors = input.errors ?? [];
  return {
    requestId: input.requestId,
    backendName: input.backendName,
    outcome,
    success: outcome === 'success',
    warnings: [...warnings],
    errors: [...errors],
    generatedFiles: [...files],
    executionTimeMs: input.executionTimeMs,
    statistics: computeStatistics(files, warnings, errors, input.executionTimeMs),
    metadata: input.metadata ? { ...input.metadata } : {},
    generatedAt: input.timestamp ?? new Date().toISOString(),
  };
}
