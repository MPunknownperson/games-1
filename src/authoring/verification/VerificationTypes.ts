/**
 * PRESERVE Authoring System — Verification & Repair Layer.
 *
 * VerificationTypes.ts declares the shared vocabulary used across the
 * verification layer: severities, categories, target kinds, statuses, and the
 * descriptor shapes that checks operate on.
 *
 * Verification inspects *structure and quality*, never gameplay. It has no
 * knowledge of towers, enemies, weapons, damage, health, levels, themes,
 * balancing, or UI. All types are plain data and JSON-serializable.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */

/** How serious a verification finding is. */
export const VerificationSeverity = {
  /** Blocks acceptance; the artifact violates a hard requirement. */
  ERROR: 'ERROR',
  /** Advisory; the artifact is usable but should be reviewed. */
  WARNING: 'WARNING',
  /** Purely informational. */
  INFO: 'INFO',
} as const;

/** Union of every supported severity. */
export type VerificationSeverity =
  (typeof VerificationSeverity)[keyof typeof VerificationSeverity];

/** Which quality dimension a check belongs to. */
export const VerificationCategory = {
  /** File and function size limits. */
  STRUCTURE: 'STRUCTURE',
  /** Import direction and layering rules. */
  DEPENDENCY: 'DEPENDENCY',
  /** Authoring/runtime coupling prevention. */
  ISOLATION: 'ISOLATION',
  /** JSON round-trip safety. */
  SERIALIZATION: 'SERIALIZATION',
  /** Stability of repeated output. */
  DETERMINISM: 'DETERMINISM',
  /** Compilation and build outcomes. */
  BUILD: 'BUILD',
} as const;

/** Union of every supported category. */
export type VerificationCategory =
  (typeof VerificationCategory)[keyof typeof VerificationCategory];

/** The kind of artifact a check inspects. */
export const VerificationTargetKind = {
  /** A described source file (path plus contents). */
  SOURCE_FILE: 'SOURCE_FILE',
  /** An in-memory structure inspected for serialization safety. */
  STRUCTURE: 'STRUCTURE',
  /** Build outcome information supplied by a caller. */
  BUILD: 'BUILD',
} as const;

/** Union of every supported target kind. */
export type VerificationTargetKind =
  (typeof VerificationTargetKind)[keyof typeof VerificationTargetKind];

/** Lifecycle state of a verification pass. */
export const VerificationStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  PASSED: 'PASSED',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
} as const;

/** Union of every supported status. */
export type VerificationStatus =
  (typeof VerificationStatus)[keyof typeof VerificationStatus];

/** Points at where a finding was discovered. */
export interface VerificationLocation {
  /** Logical file path. Never a filesystem handle. */
  readonly file?: string;
  /** Symbol or structural path within the file. */
  readonly symbol?: string;
  /** One-based line number. */
  readonly line?: number;
}

/** One finding produced by a verification rule. */
export interface VerificationIssue {
  /** Stable machine-readable code, e.g. `FILE_TOO_LONG`. */
  readonly code: string;
  /** How serious the finding is. */
  readonly severity: VerificationSeverity;
  /** Quality dimension the finding belongs to. */
  readonly category: VerificationCategory;
  /** Human-readable explanation. */
  readonly message: string;
  /** Where the finding was discovered. */
  readonly location?: VerificationLocation;
  /** Observed value that triggered the finding, when numeric. */
  readonly actual?: number;
  /** Configured limit that was exceeded, when applicable. */
  readonly limit?: number;
}

/** A described source file. Contents are supplied by the caller. */
export interface SourceFileDescriptor {
  /** Logical path used for reporting. */
  readonly path: string;
  /** Full text of the file. */
  readonly contents: string;
}

/** Build outcome information supplied by a caller. */
export interface BuildOutcomeDescriptor {
  /** Whether the build completed successfully. */
  readonly success: boolean;
  /** Number of modules transformed, when reported. */
  readonly moduleCount?: number;
  /** Output size in bytes, when reported. */
  readonly outputBytes?: number;
  /** Compilation error messages, when any. */
  readonly errors?: readonly string[];
  /** Compilation warning messages, when any. */
  readonly warnings?: readonly string[];
}

/** A unit of work handed to the runner. */
export interface VerificationTarget<T = unknown> {
  /** Which category of artifact `data` holds. */
  readonly kind: VerificationTargetKind;
  /** The payload being verified. */
  readonly data: T;
  /** Optional logical label used to enrich locations. */
  readonly label?: string;
}

/** Build a source-file target. */
export function sourceFileTarget(
  file: SourceFileDescriptor,
): VerificationTarget<SourceFileDescriptor> {
  return { kind: VerificationTargetKind.SOURCE_FILE, data: file, label: file.path };
}

/** Build a structure target. */
export function structureTarget<T>(data: T, label?: string): VerificationTarget<T> {
  return { kind: VerificationTargetKind.STRUCTURE, data, label };
}

/** Build a build-outcome target. */
export function buildTarget(
  outcome: BuildOutcomeDescriptor,
): VerificationTarget<BuildOutcomeDescriptor> {
  return { kind: VerificationTargetKind.BUILD, data: outcome, label: 'build' };
}

/** Construct an issue, defaulting the severity to `ERROR`. */
export function createIssue(
  code: string,
  category: VerificationCategory,
  message: string,
  options: {
    severity?: VerificationSeverity;
    location?: VerificationLocation;
    actual?: number;
    limit?: number;
  } = {},
): VerificationIssue {
  return {
    code,
    severity: options.severity ?? VerificationSeverity.ERROR,
    category,
    message,
    location: options.location,
    actual: options.actual,
    limit: options.limit,
  };
}
