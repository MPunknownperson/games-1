/**
 * PRESERVE Authoring System — Export Core.
 *
 * ExportSession.ts manages the lifecycle of one export operation:
 * CREATED → PREPARING → VALIDATING → EXPORTING → COMPLETED / FAILED / CANCELLED.
 *
 * Each session is a self-contained instance holding its own package, progress,
 * and result. There is no global mutable state, no filesystem access, and no
 * network access.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { ExportManifest } from './ExportManifest';
import type { ExportPackage } from './ExportPackage';
import {
  createCancelledResult,
  createFailureResult,
  createSuccessResult,
  packageInfoFromManifest,
  type ExportResult,
} from './ExportResult';
import {
  DEFAULT_EXPORT_OPTIONS,
  ExportStatus,
  type ExportOptions,
} from './ExportTypes';
import { validateExportManifest } from './ExportValidator';
import { writeExportPackage } from './ExportWriter';

/** Summary information about a session. */
export interface ExportSessionInfo {
  readonly id: string;
  readonly status: ExportStatus;
  readonly progress: number;
  readonly packageId?: string;
  readonly entryCount: number;
  readonly hasResult: boolean;
}

/** High-resolution timestamp with a safe fallback. */
function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * A self-contained export operation.
 * Composition-friendly: hold an instance; do not subclass.
 */
export class ExportSession {
  readonly id: string;
  private status: ExportStatus = ExportStatus.CREATED;
  private pkg: ExportPackage | null = null;
  private progress = 0;
  private result: ExportResult | null = null;
  private readonly warnings: string[] = [];
  private startedAtMs: number | null = null;

  constructor(id: string) {
    this.id = id;
  }

  /** Current lifecycle status. */
  getStatus(): ExportStatus {
    return this.status;
  }

  /** Latest reported progress in the inclusive range 0..1. */
  getProgress(): number {
    return this.progress;
  }

  /** The attached package, when one has been supplied. */
  getPackage(): ExportPackage | null {
    return this.pkg;
  }

  /** The produced result, when the session has finished. */
  getResult(): ExportResult | null {
    return this.result;
  }

  /** Attach the package to be exported, moving the session to PREPARING. */
  attachPackage(pkg: ExportPackage): void {
    if (this.isTerminal()) return;
    this.pkg = pkg;
    this.status = ExportStatus.PREPARING;
    this.startedAtMs = nowMs();
    this.progress = 0;
  }

  /** Update the current progress fraction; clamped to 0..1. */
  updateProgress(value: number): void {
    if (this.isTerminal()) return;
    this.progress = value < 0 ? 0 : value > 1 ? 1 : value;
  }

  /** Record an advisory warning against the session. */
  addWarning(message: string): void {
    this.warnings.push(message);
  }

  /**
   * Run validation then produce the export output.
   * Always returns a result; failures do not throw.
   */
  complete(options: ExportOptions = {}): ExportResult {
    if (this.isTerminal() && this.result) return this.result;
    const resolved = { ...DEFAULT_EXPORT_OPTIONS, ...options };
    if (!this.pkg) {
      return this.fail('No package attached to the export session.', options);
    }

    this.status = ExportStatus.VALIDATING;
    this.updateProgress(0.3);
    const manifest: ExportManifest = this.pkg.toManifest(options.timestamp);
    const validation = validateExportManifest(manifest);
    for (const issue of validation.issues) {
      if (issue.severity === 'warning') this.warnings.push(`${issue.code}: ${issue.message}`);
    }
    if (!validation.valid) {
      const errors = validation.issues
        .filter((issue) => issue.severity === 'error')
        .map((issue) => `${issue.code}: ${issue.message}`);
      return this.finishFailure(errors, options, manifest);
    }

    this.status = ExportStatus.EXPORTING;
    this.updateProgress(0.7);
    const { writer } = writeExportPackage(this.pkg, options);
    const primary = writer.listDocuments()[0];

    this.status = ExportStatus.COMPLETED;
    this.updateProgress(1);
    this.result = createSuccessResult({
      manifest,
      packageInfo: packageInfoFromManifest(manifest),
      content: primary?.content,
      warnings: this.warnings,
      execution: {
        durationMs: this.elapsed(),
        format: resolved.format,
        target: resolved.target,
        mode: resolved.mode,
      },
      timestamp: options.timestamp,
    });
    return this.result;
  }

  /** Fail the session with a single error message. */
  fail(message: string, options: ExportOptions = {}): ExportResult {
    return this.finishFailure([message], options);
  }

  /** Cancel the session, producing a cancellation result. */
  cancel(options: ExportOptions = {}): ExportResult {
    if (this.isTerminal() && this.result) return this.result;
    const resolved = { ...DEFAULT_EXPORT_OPTIONS, ...options };
    this.status = ExportStatus.CANCELLED;
    this.result = createCancelledResult({
      warnings: this.warnings,
      execution: {
        durationMs: this.elapsed(),
        format: resolved.format,
        target: resolved.target,
        mode: resolved.mode,
      },
      timestamp: options.timestamp,
    });
    return this.result;
  }

  /** Summary information about the session. */
  info(): ExportSessionInfo {
    return {
      id: this.id,
      status: this.status,
      progress: this.progress,
      packageId: this.pkg?.packageId,
      entryCount: this.pkg?.entryCount() ?? 0,
      hasResult: this.result !== null,
    };
  }

  /** Build and store a failure result. */
  private finishFailure(
    errors: readonly string[],
    options: ExportOptions,
    manifest?: ExportManifest,
  ): ExportResult {
    const resolved = { ...DEFAULT_EXPORT_OPTIONS, ...options };
    this.status = ExportStatus.FAILED;
    this.result = createFailureResult({
      manifest,
      warnings: this.warnings,
      errors,
      execution: {
        durationMs: this.elapsed(),
        format: resolved.format,
        target: resolved.target,
        mode: resolved.mode,
      },
      timestamp: options.timestamp,
    });
    return this.result;
  }

  /** Milliseconds elapsed since the package was attached. */
  private elapsed(): number {
    return this.startedAtMs === null ? 0 : nowMs() - this.startedAtMs;
  }

  /** Whether the session has reached a terminal state. */
  private isTerminal(): boolean {
    return (
      this.status === ExportStatus.COMPLETED ||
      this.status === ExportStatus.FAILED ||
      this.status === ExportStatus.CANCELLED
    );
  }
}

/** Create a new export session with a unique identifier. */
export function createExportSession(id?: string): ExportSession {
  return new ExportSession(id ?? `export_${Date.now().toString(36)}`);
}
