/**
 * PRESERVE Authoring System — Generation Pipeline.
 *
 * GenerationContext.ts assembles the shared runtime information handed to a
 * backend for one dispatch. It bundles the session, the resolved backend, the
 * pipeline logger, immutable configuration, the cancellation token, and a
 * progress reporter. Backends never construct a context directly.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { GenerationBackend } from './GenerationBackend';
import type { GenerationLogger } from './GenerationLogger';
import type { CancellationToken, GenerationSession } from './GenerationSession';

/**
 * Immutable configuration for one dispatch.
 * Additional fields may be added later without breaking existing backends.
 */
export interface GenerationConfig {
  debug: boolean;
  verbose: boolean;
  strictMode: boolean;
  /** Optional soft cap for how many warnings a backend may emit. */
  maxWarnings?: number;
}

/** Default configuration used when the pipeline is constructed without one. */
export const DEFAULT_GENERATION_CONFIG: Readonly<GenerationConfig> = {
  debug: false,
  verbose: false,
  strictMode: false,
};

/**
 * The runtime context handed to a backend for one dispatch.
 * All fields are read-only from the backend's perspective; progress reporting
 * flows through the supplied helper method.
 */
export interface GenerationContext {
  readonly session: GenerationSession;
  readonly backend: GenerationBackend;
  readonly logger: GenerationLogger;
  readonly config: Readonly<GenerationConfig>;
  readonly cancellation: CancellationToken;
  /**
   * Update the session's progress fraction (0..1) and notify listeners.
   * Backends should call this at natural checkpoints.
   */
  reportProgress(progress: number, message?: string): void;
}

/** Inputs required to build a {@link GenerationContext}. */
export interface GenerationContextInput {
  session: GenerationSession;
  backend: GenerationBackend;
  logger: GenerationLogger;
  config: GenerationConfig;
  /** Optional hook invoked when the backend reports progress. */
  onProgress?: (progress: number, message?: string) => void;
}

/**
 * Build a context object from the pipeline's collaborators.
 * The returned object is a plain literal with no prototype methods.
 */
export function createGenerationContext(input: GenerationContextInput): GenerationContext {
  return {
    session: input.session,
    backend: input.backend,
    logger: input.logger,
    config: { ...input.config },
    cancellation: input.session.getCancellationToken(),
    reportProgress: (progress: number, message?: string) => {
      input.session.reportProgress(progress);
      input.onProgress?.(progress, message);
    },
  };
}
