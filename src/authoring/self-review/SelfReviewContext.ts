/**
 * PRESERVE Authoring System — AI Self-Review Layer.
 *
 * SelfReviewContext.ts carries an immutable, read-only context into the review
 * analyzers, scope evaluator, decision gate, retry controller, and verifier.
 * It stores project version, workflow id, strict safety limits, protected
 * areas, and a timestamp.
 *
 * It holds no reference to engine, UI, gameplay, or filesystem systems and uses
 * no global mutable state.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */

/** Immutable safety limits and configuration for a self-review workflow. */
export interface SelfReviewContext {
  /** Version of the project being reviewed. */
  readonly projectVersion: string;
  /** Stable identifier for the current workflow or session. */
  readonly workflowId: string;
  /** Maximum number of repair retries permitted before stopping. */
  readonly maximumRetryCount: number;
  /** Maximum number of changed files permitted in a single attempt. */
  readonly maximumChangedFiles: number;
  /** Maximum number of changed lines permitted in a single attempt. */
  readonly maximumChangedLines: number;
  /** Minimum confidence required for a change to proceed. */
  readonly confidenceThreshold: number;
  /** Path prefixes or globs where automatic repairs are forbidden. */
  readonly protectedAreas: readonly string[];
  /** Fixed ISO-8601 timestamp used for deterministic output. */
  readonly timestamp: string;
}

/** Options accepted when constructing a {@link SelfReviewContext}. */
export interface SelfReviewContextOptions {
  projectVersion?: string;
  workflowId?: string;
  maximumRetryCount?: number;
  maximumChangedFiles?: number;
  maximumChangedLines?: number;
  confidenceThreshold?: number;
  protectedAreas?: readonly string[];
  timestamp?: string;
}

/** Default safety limits matching PRESERVE self-review guidelines. */
export const DEFAULT_SELF_REVIEW_LIMITS = {
  maximumRetryCount: 3,
  maximumChangedFiles: 3,
  maximumChangedLines: 50,
  confidenceThreshold: 0.85,
} as const;

/** Default protected runtime, engine, and game paths. */
export const DEFAULT_PROTECTED_AREAS: readonly string[] = [
  'src/engine/',
  'src/engine/*',
  'src/runtime/',
  'src/runtime/*',
  'src/game/',
  'src/game/*',
  'src/ui/',
  'src/ui/*',
  'package.json',
  'package-lock.json',
  'vite.config.ts',
  'tsconfig.json',
];

/** Build an immutable {@link SelfReviewContext} with safety-first defaults. */
export function createSelfReviewContext(
  options: SelfReviewContextOptions = {},
): SelfReviewContext {
  return {
    projectVersion: options.projectVersion ?? '0.0.0',
    workflowId: options.workflowId ?? 'default_workflow',
    maximumRetryCount: options.maximumRetryCount ?? DEFAULT_SELF_REVIEW_LIMITS.maximumRetryCount,
    maximumChangedFiles: options.maximumChangedFiles ?? DEFAULT_SELF_REVIEW_LIMITS.maximumChangedFiles,
    maximumChangedLines: options.maximumChangedLines ?? DEFAULT_SELF_REVIEW_LIMITS.maximumChangedLines,
    confidenceThreshold: options.confidenceThreshold ?? DEFAULT_SELF_REVIEW_LIMITS.confidenceThreshold,
    protectedAreas: options.protectedAreas ? [...options.protectedAreas] : [...DEFAULT_PROTECTED_AREAS],
    timestamp: options.timestamp ?? new Date().toISOString(),
  };
}

/** Return a copy of `context` with the supplied changes applied. */
export function withSelfReviewContextChanges(
  context: SelfReviewContext,
  changes: SelfReviewContextOptions,
): SelfReviewContext {
  return createSelfReviewContext({
    projectVersion: changes.projectVersion ?? context.projectVersion,
    workflowId: changes.workflowId ?? context.workflowId,
    maximumRetryCount: changes.maximumRetryCount ?? context.maximumRetryCount,
    maximumChangedFiles: changes.maximumChangedFiles ?? context.maximumChangedFiles,
    maximumChangedLines: changes.maximumChangedLines ?? context.maximumChangedLines,
    confidenceThreshold: changes.confidenceThreshold ?? context.confidenceThreshold,
    protectedAreas: changes.protectedAreas ?? context.protectedAreas,
    timestamp: changes.timestamp ?? context.timestamp,
  });
}

/** Check whether a logical file path matches any prefix in a list of patterns. */
export function matchesProtectedArea(
  path: string,
  protectedAreas: readonly string[],
): boolean {
  const normalized = path.replace(/\\/g, '/');
  return protectedAreas.some((pattern) => {
    const normPat = pattern.replace(/\\/g, '/');
    if (normPat.endsWith('/*') || normPat.endsWith('*')) {
      return normalized.startsWith(normPat.replace(/\*+$/, ''));
    }
    if (normPat.endsWith('/')) {
      return normalized.startsWith(normPat) || normalized === normPat.slice(0, -1);
    }
    return normalized === normPat || normalized.startsWith(`${normPat}/`);
  });
}
