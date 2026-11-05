/**
 * PRESERVE Authoring System — Validation System.
 *
 * ValidationContext.ts carries shared, read-only information into every rule:
 * the validation mode, strictness, version details, and free-form metadata.
 *
 * It deliberately holds no reference to the engine, gameplay, UI, or rendering
 * systems — rules receive structural context only.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */

/** How thorough a validation pass should be. */
export type ValidationMode = 'quick' | 'standard' | 'exhaustive';

/** Version details describing what produced the data under inspection. */
export interface ValidationVersionInfo {
  /** Version of the authoring toolchain performing validation. */
  readonly authoringVersion?: string;
  /** Version of the schema definition being validated, when applicable. */
  readonly schemaVersion?: string;
  /** Version of the backend that produced generated source, when applicable. */
  readonly backendVersion?: string;
}

/** Read-only context handed to every rule during a validation pass. */
export interface ValidationContext {
  /** How thorough the current pass should be. */
  readonly mode: ValidationMode;
  /** When true, rules should promote advisory findings to errors. */
  readonly strict: boolean;
  /** Version details about the data and toolchain. */
  readonly version: ValidationVersionInfo;
  /** Free-form, serializable metadata supplied by the caller. */
  readonly metadata: Readonly<Record<string, unknown>>;
}

/** Options accepted by {@link createValidationContext}. */
export interface ValidationContextOptions {
  mode?: ValidationMode;
  strict?: boolean;
  version?: ValidationVersionInfo;
  metadata?: Record<string, unknown>;
}

/** Defaults applied when a caller omits context options. */
export const DEFAULT_VALIDATION_CONTEXT: Readonly<
  Required<Pick<ValidationContext, 'mode' | 'strict'>>
> = {
  mode: 'standard',
  strict: false,
};

/**
 * Build an immutable {@link ValidationContext}.
 * The returned object is plain data and safe to serialize.
 */
export function createValidationContext(
  options: ValidationContextOptions = {},
): ValidationContext {
  return {
    mode: options.mode ?? DEFAULT_VALIDATION_CONTEXT.mode,
    strict: options.strict ?? DEFAULT_VALIDATION_CONTEXT.strict,
    version: options.version ? { ...options.version } : {},
    metadata: options.metadata ? { ...options.metadata } : {},
  };
}

/**
 * Return a copy of `context` with the supplied changes applied.
 * The original context is never mutated.
 */
export function withContextChanges(
  context: ValidationContext,
  changes: ValidationContextOptions,
): ValidationContext {
  return {
    mode: changes.mode ?? context.mode,
    strict: changes.strict ?? context.strict,
    version: changes.version ? { ...context.version, ...changes.version } : context.version,
    metadata: changes.metadata ? { ...context.metadata, ...changes.metadata } : context.metadata,
  };
}
