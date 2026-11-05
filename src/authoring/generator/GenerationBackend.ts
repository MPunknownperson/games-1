/**
 * PRESERVE Authoring System — Generation Pipeline.
 *
 * GenerationBackend.ts defines the interface every language backend
 * implements. The pipeline only depends on this interface — it never inspects
 * backend internals — so future TypeScript, JSON, YAML, Lua, and Markdown
 * backends can be added without changing the coordinator.
 *
 * No backend is implemented in this phase.
 *
 * Development-only; never imported by the engine, gameplay, UI, or runtime.
 */
import type { GenerationContext } from './GenerationContext';
import type { GenerationRequest } from './GenerationRequest';
import type { GenerationWriter } from './GenerationWriter';

/**
 * The contract every language backend must implement.
 * Backends are stateless coordinators of their own; they receive the request,
 * a writer for output, and a context providing logger/cancellation/progress.
 */
export interface GenerationBackend {
  /** Stable, unique backend identifier. */
  getName(): string;
  /** Semantic version string for the backend implementation. */
  getVersion(): string;
  /** Called once by the pipeline before the first `generate()` invocation. */
  initialize(): void | Promise<void>;
  /** Called once by the pipeline when the backend is unregistered or shut down. */
  shutdown(): void | Promise<void>;
  /**
   * Whether this backend can handle the given request. The pipeline dispatches
   * to the first registered backend whose `supports()` returns `true`.
   */
  supports(request: GenerationRequest): boolean;
  /**
   * Produce artifacts for the given request by writing through the supplied
   * writer. Backends must never write to disk or perform network I/O.
   */
  generate(
    request: GenerationRequest,
    writer: GenerationWriter,
    context: GenerationContext,
  ): void | Promise<void>;
}

/** Internal bookkeeping record for a registered backend. */
export interface BackendRegistration {
  readonly backend: GenerationBackend;
  readonly name: string;
  readonly version: string;
  /** Whether {@link GenerationBackend.initialize} has completed. */
  initialized: boolean;
}

/** Build a registration record from a backend instance. */
export function toBackendRegistration(backend: GenerationBackend): BackendRegistration {
  return {
    backend,
    name: backend.getName(),
    version: backend.getVersion(),
    initialized: false,
  };
}

/**
 * Verify that a candidate implements the full backend contract.
 * Throws an `Error` describing every missing method when invalid.
 */
export function assertBackendShape(backend: GenerationBackend): void {
  const missing: string[] = [];
  if (typeof backend?.getName !== 'function') missing.push('getName');
  if (typeof backend?.getVersion !== 'function') missing.push('getVersion');
  if (typeof backend?.initialize !== 'function') missing.push('initialize');
  if (typeof backend?.shutdown !== 'function') missing.push('shutdown');
  if (typeof backend?.supports !== 'function') missing.push('supports');
  if (typeof backend?.generate !== 'function') missing.push('generate');
  if (missing.length > 0) {
    throw new Error(`Invalid generation backend. Missing methods: ${missing.join(', ')}`);
  }
}
