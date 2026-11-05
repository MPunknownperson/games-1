/**
 * PRESERVE Authoring System — Validation System.
 *
 * ValidatorTypes.ts declares the shared vocabulary used across the validation
 * layer: severities, source locations, issues, and target kinds. This file
 * contains type declarations and tiny pure constructors only — no validation
 * logic lives here.
 *
 * The validator inspects *structure*, never game design. It has no knowledge of
 * towers, enemies, damage, health, levels, themes, balance, or UI.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */

/** Severity classification for a single validation finding. */
export const ValidationSeverity = {
  /** Blocks acceptance; the data is structurally invalid. */
  ERROR: 'ERROR',
  /** Advisory; the data is usable but questionable. */
  WARNING: 'WARNING',
  /** Purely informational; no action required. */
  INFO: 'INFO',
} as const;

/** Union of every supported severity value. */
export type ValidationSeverity = (typeof ValidationSeverity)[keyof typeof ValidationSeverity];

/**
 * Points at where an issue was discovered.
 * Every field is optional because different targets expose different context:
 * schemas and IR have logical paths, generated source has lines and columns.
 */
export interface ValidationLocation {
  /** Logical file identifier or output path. Never a filesystem handle. */
  readonly file?: string;
  /** Dotted path into the inspected structure, e.g. `module.declarations.0`. */
  readonly path?: string;
  /** One-based line number, when the target is text. */
  readonly line?: number;
  /** One-based column number, when the target is text. */
  readonly column?: number;
}

/** A single structural finding produced by a validation rule. */
export interface ValidationIssue {
  /** Stable machine-readable code, e.g. `IR_CLASS_MISSING_NAME`. */
  readonly id: string;
  /** How serious the finding is. */
  readonly severity: ValidationSeverity;
  /** Human-readable explanation of what is structurally wrong. */
  readonly message: string;
  /** Where the finding was discovered. */
  readonly location?: ValidationLocation;
  /** Optional actionable hint describing how to resolve the finding. */
  readonly suggestion?: string;
}

/** The kind of data a validator inspects. */
export const ValidationTargetKind = {
  /** A schema definition from the Schema & Manifest layer. */
  SCHEMA: 'SCHEMA',
  /** An Intermediate Representation node or descriptor. */
  IR: 'IR',
  /** Generated source text produced by a language backend. */
  SOURCE: 'SOURCE',
} as const;

/** Union of every supported target kind. */
export type ValidationTargetKind = (typeof ValidationTargetKind)[keyof typeof ValidationTargetKind];

/**
 * A unit of work handed to the runner: the payload plus the kind of payload.
 * The runner uses `kind` to select matching validators; it never inspects
 * `data` itself.
 */
export interface ValidationTarget<T = unknown> {
  /** Which category of data `data` holds. */
  readonly kind: ValidationTargetKind;
  /** The payload being validated. */
  readonly data: T;
  /** Optional logical label used to enrich issue locations. */
  readonly label?: string;
}

/** Build a schema-kind validation target. */
export function schemaTarget<T>(data: T, label?: string): ValidationTarget<T> {
  return { kind: ValidationTargetKind.SCHEMA, data, label };
}

/** Build an IR-kind validation target. */
export function irTarget<T>(data: T, label?: string): ValidationTarget<T> {
  return { kind: ValidationTargetKind.IR, data, label };
}

/** Build a source-kind validation target. */
export function sourceTarget<T>(data: T, label?: string): ValidationTarget<T> {
  return { kind: ValidationTargetKind.SOURCE, data, label };
}

/** Construct an issue, defaulting the severity to `ERROR`. */
export function createIssue(
  id: string,
  message: string,
  options: {
    severity?: ValidationSeverity;
    location?: ValidationLocation;
    suggestion?: string;
  } = {},
): ValidationIssue {
  return {
    id,
    severity: options.severity ?? ValidationSeverity.ERROR,
    message,
    location: options.location,
    suggestion: options.suggestion,
  };
}

/** Count issues matching a given severity. */
export function countBySeverity(
  issues: readonly ValidationIssue[],
  severity: ValidationSeverity,
): number {
  let total = 0;
  for (const issue of issues) if (issue.severity === severity) total += 1;
  return total;
}
