/**
 * PRESERVE Authoring System — Export Core.
 *
 * ExportResult.ts describes the outcome of one export operation. Results are
 * immutable, plain, JSON-serializable data with no functions and no runtime
 * references.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { ExportManifest } from './ExportManifest';
import type { ExportFormat, ExportMode, ExportTarget } from './ExportTypes';

/** Categorises the outcome of one export operation. */
export type ExportOutcome = 'success' | 'failure' | 'cancelled';

/** Summary of the package that was described. */
export interface ExportPackageInfo {
  readonly packageId: string;
  readonly packageName: string;
  readonly entryCount: number;
  readonly totalByteCount: number;
  readonly dependencyCount: number;
}

/** Execution details recorded alongside a result. */
export interface ExportExecutionInfo {
  /** Wall-clock milliseconds spent producing the result. */
  readonly durationMs: number;
  /** Format the output was produced in. */
  readonly format: ExportFormat;
  /** Destination the operation targeted. */
  readonly target: ExportTarget;
  /** Thoroughness mode used. */
  readonly mode: ExportMode;
}

/** Immutable outcome of one export operation. */
export interface ExportResult {
  /** True when the operation completed without errors. */
  readonly success: boolean;
  /** Categorised outcome. */
  readonly outcome: ExportOutcome;
  /** Advisory findings that did not block the operation. */
  readonly warnings: readonly string[];
  /** Findings that caused the operation to fail. */
  readonly errors: readonly string[];
  /** Manifest describing the exported package, when one was produced. */
  readonly manifest?: ExportManifest;
  /** Summary of the described package. */
  readonly packageInfo?: ExportPackageInfo;
  /** Serialized output content, when the mode produced any. */
  readonly content?: string;
  /** Execution details. */
  readonly execution: ExportExecutionInfo;
  /** ISO-8601 timestamp recorded when the result was produced. */
  readonly completedAt: string;
}

/** Inputs accepted by the result factories. */
export interface ExportResultInput {
  manifest?: ExportManifest;
  packageInfo?: ExportPackageInfo;
  content?: string;
  warnings?: readonly string[];
  errors?: readonly string[];
  execution: ExportExecutionInfo;
  /** Fixed ISO-8601 timestamp for deterministic output. */
  timestamp?: string;
}

/** Build a success result. */
export function createSuccessResult(input: ExportResultInput): ExportResult {
  return buildResult('success', input);
}

/** Build a failure result. */
export function createFailureResult(input: ExportResultInput): ExportResult {
  return buildResult('failure', input);
}

/** Build a cancellation result. */
export function createCancelledResult(input: ExportResultInput): ExportResult {
  return buildResult('cancelled', input);
}

/** Derive package info from a manifest. */
export function packageInfoFromManifest(manifest: ExportManifest): ExportPackageInfo {
  return {
    packageId: manifest.packageId,
    packageName: manifest.packageName,
    entryCount: manifest.entryCount,
    totalByteCount: manifest.totalByteCount,
    dependencyCount: manifest.dependencies.length,
  };
}

/** Serialize a result to a JSON string. */
export function resultToJson(result: ExportResult, pretty = true): string {
  return JSON.stringify(result, null, pretty ? 2 : 0);
}

/** Shared factory used by every outcome-specific constructor. */
function buildResult(outcome: ExportOutcome, input: ExportResultInput): ExportResult {
  const warnings = input.warnings ? [...input.warnings] : [];
  const errors = input.errors ? [...input.errors] : [];
  return {
    success: outcome === 'success',
    outcome,
    warnings,
    errors,
    manifest: input.manifest,
    packageInfo: input.packageInfo ?? (input.manifest ? packageInfoFromManifest(input.manifest) : undefined),
    content: input.content,
    execution: { ...input.execution },
    completedAt: input.timestamp ?? new Date().toISOString(),
  };
}
