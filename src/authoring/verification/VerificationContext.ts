/**
 * PRESERVE Authoring System — Verification & Repair Layer.
 *
 * VerificationContext.ts carries immutable, read-only information into every
 * rule: project version, verification mode, thresholds, forbidden import
 * patterns, and free-form metadata.
 *
 * It holds no reference to the engine, gameplay, UI, or rendering — rules
 * receive structural configuration only.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */

/** How thorough a verification pass should be. */
export type VerificationMode = 'quick' | 'standard' | 'strict';

/** Numeric limits and pattern lists applied by the built-in checks. */
export interface VerificationConfiguration {
  /** Maximum permitted lines per file. */
  readonly maxFileLines: number;
  /** Maximum permitted lines per function body. */
  readonly maxFunctionLines: number;
  /** Import path fragments that must never appear in authoring code. */
  readonly forbiddenImportPatterns: readonly string[];
  /** Import path fragments indicating runtime coupling. */
  readonly runtimeImportPatterns: readonly string[];
  /** Source fragments that make output non-deterministic. */
  readonly nonDeterministicPatterns: readonly string[];
}

/** Default configuration matching the PRESERVE authoring coding standards. */
export const DEFAULT_VERIFICATION_CONFIG: Readonly<VerificationConfiguration> = {
  maxFileLines: 250,
  maxFunctionLines: 60,
  forbiddenImportPatterns: [
    'react',
    'react-dom',
    'canvas',
    'webgl',
    'three',
    'node:fs',
    'node:net',
    'node:http',
    'fs/promises',
  ],
  runtimeImportPatterns: [
    '../engine/',
    '../../engine/',
    '../ui/',
    '../../ui/',
    '../game/',
    '../../game/',
    '../../App',
  ],
  nonDeterministicPatterns: [
    'Math.random(',
    'Date.now(',
    'new Date()',
    'performance.now(',
    'crypto.randomUUID(',
  ],
};

/** Immutable context handed to every rule during a verification pass. */
export interface VerificationContext {
  /** Version of the project being verified. */
  readonly projectVersion: string;
  /** How thorough the current pass should be. */
  readonly mode: VerificationMode;
  /** Numeric limits and pattern lists. */
  readonly configuration: VerificationConfiguration;
  /** Free-form, serializable metadata supplied by the caller. */
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
}

/** Options accepted by {@link createVerificationContext}. */
export interface VerificationContextOptions {
  projectVersion?: string;
  mode?: VerificationMode;
  configuration?: Partial<VerificationConfiguration>;
  metadata?: Record<string, string | number | boolean | null>;
}

/**
 * Build an immutable {@link VerificationContext}.
 * The returned object is plain data and safe to serialize.
 */
export function createVerificationContext(
  options: VerificationContextOptions = {},
): VerificationContext {
  return {
    projectVersion: options.projectVersion ?? '0.0.0',
    mode: options.mode ?? 'standard',
    configuration: { ...DEFAULT_VERIFICATION_CONFIG, ...options.configuration },
    metadata: options.metadata ? { ...options.metadata } : {},
  };
}

/**
 * Return a copy of `context` with the supplied changes applied.
 * The original context is never mutated.
 */
export function withContextChanges(
  context: VerificationContext,
  changes: VerificationContextOptions,
): VerificationContext {
  return {
    projectVersion: changes.projectVersion ?? context.projectVersion,
    mode: changes.mode ?? context.mode,
    configuration: changes.configuration
      ? { ...context.configuration, ...changes.configuration }
      : context.configuration,
    metadata: changes.metadata ? { ...context.metadata, ...changes.metadata } : context.metadata,
  };
}
